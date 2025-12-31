"""轻量级 PostgreSQL 客户端封装"""
from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Optional, Any, Dict
from datetime import date

import psycopg2
from psycopg2 import OperationalError
from dotenv import load_dotenv

load_dotenv()


class PGClient:
    """统一的 PostgreSQL 调用入口，支持简单事务控制。"""

    def __init__(self, dsn: Optional[str] = None) -> None:
        self._dsn_override = dsn
        self._db_available = None  # 缓存数据库可用状态

    @property
    def dsn(self) -> str:
        dsn = self._dsn_override or os.getenv("PG_URL", "")
        if not dsn:
            raise OperationalError("PG_URL 未配置")
        return dsn

    def is_db_available(self) -> bool:
        """检查数据库是否可用（带缓存）"""
        if self._db_available is not None:
            return self._db_available
        
        try:
            with self.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
            self._db_available = True
            return True
        except Exception:
            self._db_available = False
            return False

    def connect(self):
        """创建一个新的 psycopg2 连接实例。"""
        return psycopg2.connect(self.dsn)

    @contextmanager
    def connection(self):
        conn = self.connect()
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def cursor(self):
        with self.connection() as conn:
            cursor = conn.cursor()
            try:
                yield cursor
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                cursor.close()

    def execute_query(self, query: str, params: tuple = None) -> list:
        """执行查询并返回结果（安全模式：数据库不可用时返回空列表）
        
        Args:
            query: SQL 查询语句
            params: 查询参数
            
        Returns:
            查询结果列表，如果数据库不可用则返回空列表
        """
        if not self.is_db_available():
            print("db not available")
            return []
        
        try:
            with self.cursor() as cur:
                cur.execute(query, params)
                return cur.fetchall()
        except Exception as e:
            print(f"[PGClient] 查询失败: {e}")
            return []

    def execute_update(self, query: str, params: tuple = None) -> int:
        """执行更新并返回影响行数（安全模式：数据库不可用时返回0）
        
        Args:
            query: SQL 更新语句
            params: 更新参数
            
        Returns:
            影响的行数，如果数据库不可用则返回0
        """
        if not self.is_db_available():
            return 0
        
        try:
            with self.cursor() as cur:
                cur.execute(query, params)
                return cur.rowcount
        except Exception as e:
            print(f"[PGClient] 更新失败: {e}")
            return 0


class ModelUsageManager:
    """模型使用量管理器：管理每日限额
    
    注意：使用现有表结构，通过 (channel_id, date) 组合查询
    其中 channel_id 存储在某个字段中以区分不同渠道
    """
    
    # 需要限额的渠道（每日250次）
    RATE_LIMITED_CHANNELS = {1, 2, 5}
    DAILY_LIMIT = 250
    
    def __init__(self, pg_client: PGClient):
        self.pg_client = pg_client
    
    def _get_record_id(self, channel_id: int, today: date) -> int:
        """获取或创建记录ID，使用复合查询适配现有表结构
        
        由于表结构使用自增主键 model_id，我们需要：
        1. 先查询是否存在该 channel_id + date 的记录
        2. 不存在则插入新记录
        3. 返回记录的主键 model_id
        
        注意：这里假设表中可以存储多条记录，通过 date 字段区分日期
        实际使用时，channel_id 需要存储在某个字段中（例如复用 model_id 存储渠道ID）
        """
        # 方案：直接使用 model_id 字段存储渠道ID (1-5)
        # 每天为每个渠道创建/更新一条记录
        return channel_id
    
    def check_and_increment(self, channel_id: int) -> Dict[str, Any]:
        """检查限额并递增使用次数
        
        Args:
            channel_id: 模型渠道ID (1-5)
            
        Returns:
            {
                "allowed": bool,  # 是否允许使用
                "usage": int,     # 当前使用次数
                "limit": int,     # 限额（无限额时为-1）
                "remaining": int  # 剩余次数（无限额时为-1）
            }
        """
        # 不在限额渠道内，直接允许
        if channel_id not in self.RATE_LIMITED_CHANNELS:
            return {
                "allowed": True,
                "usage": 0,
                "limit": -1,
                "remaining": -1
            }
        
        # 数据库不可用，认为未限额
        if not self.pg_client.is_db_available():
            print("pg not available")
            return {
                "allowed": True,
                "usage": 0,
                "limit": self.DAILY_LIMIT,
                "remaining": self.DAILY_LIMIT
            }
        
        today = date.today()
        
        try:
            # 使用 model_id 存储渠道ID，通过 date 字段区分日期
            # 查询今天的使用量
            query = """
                SELECT usage, model_id 
                FROM models 
                WHERE model_id = %s AND date = %s
                LIMIT 1
            """
            result = self.pg_client.execute_query(query, (channel_id, today))
            
            if result:
                current_usage = result[0][0] or 0
                record_id = result[0][1]
            else:
                current_usage = 0
                record_id = None
            
            # 检查是否超限
            if current_usage >= self.DAILY_LIMIT:
                return {
                    "allowed": False,
                    "usage": current_usage,
                    "limit": self.DAILY_LIMIT,
                    "remaining": 0
                }
            
            # 未超限，递增使用次数
            if record_id:
                # 更新已有记录
                update_query = """
                    UPDATE models 
                    SET usage = usage + 1 
                    WHERE model_id = %s AND date = %s
                """
                self.pg_client.execute_update(update_query, (channel_id, today))
            else:
                # 插入新记录（注意：由于 model_id 是自增的，需要特殊处理）
                # 这里我们使用 INSERT 并手动指定 model_id = channel_id
                insert_query = """
                    INSERT INTO models (model_id, date, usage) 
                    VALUES (%s, %s, 1)
                    ON CONFLICT DO NOTHING
                """
                # 如果数据库支持 ON CONFLICT，使用它；否则直接插入
                try:
                    self.pg_client.execute_update(insert_query, (channel_id, today))
                except Exception:
                    # 回退到普通 INSERT（可能失败）
                    fallback_query = "INSERT INTO models (model_id, date, usage) VALUES (%s, %s, 1)"
                    self.pg_client.execute_update(fallback_query, (channel_id, today))
            
            new_usage = current_usage + 1
            return {
                "allowed": True,
                "usage": new_usage,
                "limit": self.DAILY_LIMIT,
                "remaining": self.DAILY_LIMIT - new_usage
            }
            
        except Exception as e:
            print(f"[ModelUsageManager] 检查限额失败: {e}")
            # 出错时认为未限额
            return {
                "allowed": True,
                "usage": 0,
                "limit": self.DAILY_LIMIT,
                "remaining": self.DAILY_LIMIT
            }
    
    def get_usage(self, channel_id: int) -> Dict[str, Any]:
        """获取当前使用量（不递增）
        
        Args:
            channel_id: 模型渠道ID
            
        Returns:
            {"usage": int, "limit": int, "remaining": int}
        """
        # 不在限额渠道内
        if channel_id not in self.RATE_LIMITED_CHANNELS:
            return {
                "usage": 0,
                "limit": -1,
                "remaining": -1
            }
        
        # 数据库不可用
        if not self.pg_client.is_db_available():
            return {
                "usage": 0,
                "limit": self.DAILY_LIMIT,
                "remaining": self.DAILY_LIMIT
            }
        
        today = date.today()
        
        try:
            query = "SELECT usage FROM models WHERE model_id = %s AND date = %s"
            result = self.pg_client.execute_query(query, (channel_id, today))
            
            current_usage = result[0][0] if result else 0
            
            return {
                "usage": current_usage or 0,
                "limit": self.DAILY_LIMIT,
                "remaining": max(0, self.DAILY_LIMIT - (current_usage or 0))
            }
            
        except Exception as e:
            print(f"[ModelUsageManager] 获取使用量失败: {e}")
            return {
                "usage": 0,
                "limit": self.DAILY_LIMIT,
                "remaining": self.DAILY_LIMIT
            }


# 全局实例
pg_client = PGClient()
model_usage_manager = ModelUsageManager(pg_client)

__all__ = ["PGClient", "pg_client", "ModelUsageManager", "model_usage_manager"]
