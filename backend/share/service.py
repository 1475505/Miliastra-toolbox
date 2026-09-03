"""分享与异步对话任务的 PostgreSQL 存储服务

设计要点：
1. 单表 shares 承载两类数据：普通分享（kind=share）与异步对话任务（kind=async_task）
2. 容量控制：总容量 100MB，超出后按 last_access_at 做 LRU 淘汰
3. 单条上限 2MB，防止一条分享挤爆容量
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from psycopg2.extras import Json

from common.pg_client import pg_client

logger = logging.getLogger(__name__)

# ── 容量控制配置 ────────────────────────────────────────────
MAX_TOTAL_BYTES = 100 * 1024 * 1024   # 全部分享总容量 100MB
MAX_SINGLE_BYTES = 2 * 1024 * 1024    # 单条分享上限 2MB
EVICT_BATCH = 64                      # 每轮 LRU 淘汰批量

# ── 类型常量 ────────────────────────────────────────────────
KIND_SHARE = "share"
KIND_ASYNC_TASK = "async_task"

STATUS_READY = "ready"
STATUS_PENDING = "pending"
STATUS_COMPLETED = "completed"
STATUS_ERROR = "error"


class ShareServiceError(Exception):
    """分享存储异常（数据库不可用等）"""


class ShareTooLargeError(ShareServiceError):
    """单条分享超过容量上限"""


@dataclass(frozen=True)
class ShareRecord:
    """一条分享/异步任务的完整记录"""
    id: str
    kind: str
    status: str
    title: str
    messages: Optional[List[Dict[str, Any]]]
    error: Optional[str]


_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS shares (
    id VARCHAR(32) PRIMARY KEY,
    kind VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL,
    title VARCHAR(256),
    payload JSONB,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_access_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shares_last_access ON shares (last_access_at);
"""


class ShareService:
    """shares 表的读写与 LRU 淘汰"""

    def __init__(self) -> None:
        self._table_ready = False

    def initialise(self) -> None:
        """建表（幂等），供应用启动时调用"""
        with pg_client.cursor() as cur:
            cur.execute(_TABLE_SQL)
        self._table_ready = True

    def _ensure_table(self) -> None:
        if not self._table_ready:
            self.initialise()

    def _generate_id(self) -> str:
        """生成带人类可读时间前缀的 ID：YYYYMMDD-HHMMSS-<8位随机hex>"""
        return f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}"

    def create(self, kind: str, status: str, title: str, payload: Dict[str, Any]) -> str:
        """插入一条分享并执行 LRU 容量淘汰，返回生成的 id"""
        size = len(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
        if size > MAX_SINGLE_BYTES:
            raise ShareTooLargeError(f"payload {size} bytes exceeds limit {MAX_SINGLE_BYTES}")

        share_id = self._generate_id()
        try:
            self._ensure_table()
            with pg_client.cursor() as cur:
                cur.execute(
                    "INSERT INTO shares (id, kind, status, title, payload, size_bytes) VALUES (%s, %s, %s, %s, %s, %s)",
                    (share_id, kind, status, title[:256], Json(payload), size),
                )
                self._evict_over_capacity(cur, keep_id=share_id)
        except ShareTooLargeError:
            raise
        except Exception as e:
            raise ShareServiceError(str(e)) from e
        return share_id

    def _evict_over_capacity(self, cur: Any, keep_id: str) -> None:
        """总容量超限时按 last_access ASC 淘汰，删到不超限或无行可删为止"""
        while True:
            cur.execute("SELECT COALESCE(SUM(size_bytes), 0) FROM shares")
            if cur.fetchone()[0] <= MAX_TOTAL_BYTES:
                return
            cur.execute(
                """
                DELETE FROM shares
                WHERE id IN (
                    SELECT id FROM shares
                    WHERE id <> %s
                    ORDER BY last_access_at ASC, id ASC
                    LIMIT %s
                )
                """,
                (keep_id, EVICT_BATCH),
            )
            if cur.rowcount == 0:
                # 只剩刚插入的这一条（本身已在单条上限内），无法再淘汰
                return

    def get(self, share_id: str) -> Optional[ShareRecord]:
        """按 id 读取并 touch last_access_at（LRU 依据）"""
        try:
            self._ensure_table()
            with pg_client.cursor() as cur:
                cur.execute(
                    """
                    UPDATE shares SET last_access_at = now()
                    WHERE id = %s
                    RETURNING kind, status, title, payload, error
                    """,
                    (share_id,),
                )
                row = cur.fetchone()
        except Exception as e:
            raise ShareServiceError(str(e)) from e

        if row is None:
            return None
        payload: Optional[Dict[str, Any]] = row[3]
        return ShareRecord(
            id=share_id,
            kind=row[0],
            status=row[1],
            title=row[2] or "",
            messages=payload.get("messages") if payload else None,
            error=row[4],
        )

    def update_task(
        self,
        share_id: str,
        status: str,
        payload: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        """异步任务完成/失败后回写结果（payload 中的 title 同步回写 title 列）"""
        size = len(json.dumps(payload, ensure_ascii=False).encode("utf-8")) if payload is not None else 0
        if size > MAX_SINGLE_BYTES:
            raise ShareTooLargeError(f"payload {size} bytes exceeds limit {MAX_SINGLE_BYTES}")
        title = payload.get("title") if payload else None
        try:
            self._ensure_table()
            with pg_client.cursor() as cur:
                cur.execute(
                    """
                    UPDATE shares
                    SET status = %s, payload = %s, size_bytes = %s, error = %s,
                        title = COALESCE(%s, title)
                    WHERE id = %s
                    """,
                    (
                        status,
                        Json(payload) if payload is not None else None,
                        size,
                        error,
                        title[:256] if title else None,
                        share_id,
                    ),
                )
        except Exception as e:
            raise ShareServiceError(str(e)) from e


share_service = ShareService()
