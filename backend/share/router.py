"""
素材分享 API 路由
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

# 数据库连接配置
DB_URL = os.getenv("PG_URL")


class ShareCreate(BaseModel):
    title: str
    description: Optional[str] = None
    bilibili_url: Optional[str] = None
    gil_url: Optional[str] = None


class ShareResponse(BaseModel):
    id: int
    created_at: str
    title: Optional[str]
    description: Optional[str]
    bilibili_url: Optional[str]
    gil_url: Optional[str]


def get_db():
    """获取数据库连接"""
    return psycopg2.connect(DB_URL)


@router.get("/shares")
async def list_shares(
    title: Optional[str] = Query(None, description="标题关键词（模糊搜索）"),
    limit: int = Query(20, ge=1, le=100, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量")
):
    """查询分享列表"""
    try:
        conn = get_db()
        cur = conn.cursor()
        
        # 构建查询
        if title:
            query = """
                SELECT id, created_at, title, description, bilibili_url, gil_url
                FROM public.shares
                WHERE title ILIKE %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """
            cur.execute(query, (f"%{title}%", limit, offset))
            rows = cur.fetchall()
            
            count_query = "SELECT COUNT(*) FROM public.shares WHERE title ILIKE %s"
            cur.execute(count_query, (f"%{title}%",))
            total = cur.fetchone()[0]
        else:
            query = """
                SELECT id, created_at, title, description, bilibili_url, gil_url
                FROM public.shares
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """
            cur.execute(query, (limit, offset))
            rows = cur.fetchall()
            
            count_query = "SELECT COUNT(*) FROM public.shares"
            cur.execute(count_query)
            total = cur.fetchone()[0]
        
        items = [
            {
                "id": row[0],
                "created_at": row[1].isoformat() if row[1] else None,
                "title": row[2],
                "description": row[3],
                "bilibili_url": row[4],
                "gil_url": row[5]
            }
            for row in rows
        ]
        
        cur.close()
        conn.close()
        
        return {
            "success": True,
            "data": {
                "total": total,
                "items": items
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/shares")
async def create_share(share: ShareCreate):
    """创建分享"""
    if not share.title or not share.title.strip():
        raise HTTPException(status_code=400, detail="标题不能为空")
    
    try:
        conn = get_db()
        cur = conn.cursor()
        
        query = """
            INSERT INTO public.shares (title, description, bilibili_url, gil_url)
            VALUES (%s, %s, %s, %s)
            RETURNING id, created_at, title, description, bilibili_url, gil_url
        """
        
        cur.execute(query, (
            share.title,
            share.description,
            share.bilibili_url,
            share.gil_url
        ))
        
        row = cur.fetchone()
        conn.commit()
        
        result = {
            "id": row[0],
            "created_at": row[1].isoformat() if row[1] else None,
            "title": row[2],
            "description": row[3],
            "bilibili_url": row[4],
            "gil_url": row[5]
        }
        
        cur.close()
        conn.close()
        
        return {
            "success": True,
            "data": result
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
