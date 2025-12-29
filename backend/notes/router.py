"""
笔记 API 路由
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta

from common.pg_client import pg_client

router = APIRouter()

# 北京时区 (UTC+8)
BEIJING_TZ = timezone(timedelta(hours=8))


def to_beijing_time(dt):
    """将时间转换为北京时区"""
    if dt is None:
        return None
    # 如果是aware datetime，转换到北京时区
    if dt.tzinfo is not None:
        return dt.astimezone(BEIJING_TZ).isoformat()
    # 如果是naive datetime，假设它是UTC时间，然后转换为北京时区
    else:
        return dt.replace(tzinfo=timezone.utc).astimezone(BEIJING_TZ).isoformat()


class NoteCreate(BaseModel):
    author: Optional[str] = None
    content: str
    img_url: Optional[str] = None
    video_url: Optional[str] = None


class NoteUpdate(BaseModel):
    author: Optional[str] = None
    content: Optional[str] = None
    img_url: Optional[str] = None
    video_url: Optional[str] = None


class NoteResponse(BaseModel):
    id: int
    created_at: str
    version: str
    author: Optional[str]
    content: Optional[str]
    likes: int
    img_url: Optional[str]
    video_url: Optional[str]


@router.post("/notes")
async def create_note(note: NoteCreate):
    """创建笔记"""
    if not note.content or not note.content.strip():
        raise HTTPException(status_code=400, detail="笔记内容不能为空")
    
    try:
        with pg_client.cursor() as cur:
            query = """
                INSERT INTO public.notes (created_at, author, content, likes, img_url, video_url)
                VALUES (NOW(), %s, %s, 0, %s, %s)
                RETURNING id, created_at, version, author, content, likes, img_url, video_url
            """
            cur.execute(query, (note.author, note.content, note.img_url, note.video_url))
            row = cur.fetchone()
        
        result = {
            "id": row[0],
            "created_at": to_beijing_time(row[1]),
            "version": to_beijing_time(row[2]),
            "author": row[3],
            "content": row[4],
            "likes": row[5] or 0,
            "img_url": row[6],
            "video_url": row[7]
        }
        
        return {
            "success": True,
            "data": result
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/notes/{note_id}")
async def update_note(note_id: int, note: NoteUpdate):
    """修改笔记（创建新版本）"""
    if not note.author and not note.content:
        raise HTTPException(status_code=400, detail="至少需要提供 author 或 content 其中之一")
    
    try:
        with pg_client.cursor() as cur:
            query = """
                SELECT id, created_at, author, content, likes, img_url, video_url
                FROM public.notes
                WHERE id = %s
                ORDER BY version DESC
                LIMIT 1
            """
            cur.execute(query, (note_id,))
            row = cur.fetchone()
            
            if not row:
                raise HTTPException(status_code=404, detail="笔记不存在")
            
            old_id, old_created_at, old_author, old_content, old_likes, old_img_url, old_video_url = row
            new_author = note.author if note.author is not None else old_author
            new_content = note.content if note.content is not None else old_content
            new_img_url = note.img_url if note.img_url is not None else old_img_url
            new_video_url = note.video_url if note.video_url is not None else old_video_url
            
            insert_query = """
                INSERT INTO public.notes (id, created_at, author, content, likes, img_url, video_url)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, created_at, version, author, content, likes, img_url, video_url
            """
            cur.execute(insert_query, (
                old_id,
                old_created_at,
                new_author,
                new_content,
                old_likes,
                new_img_url,
                new_video_url
            ))
            new_row = cur.fetchone()
        
        result = {
            "id": new_row[0],
            "created_at": to_beijing_time(new_row[1]),
            "version": to_beijing_time(new_row[2]),
            "author": new_row[3],
            "content": new_row[4],
            "likes": new_row[5] or 0,
            "img_url": new_row[6],
            "video_url": new_row[7]
        }
        
        return {
            "success": True,
            "data": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/notes/{note_id}/like")
async def like_note(note_id: int):
    """点赞笔记"""
    try:
        with pg_client.cursor() as cur:
            query = """
                WITH latest_note AS (
                    SELECT id, version
                    FROM public.notes
                    WHERE id = %s
                    ORDER BY version DESC
                    LIMIT 1
                )
                UPDATE public.notes
                SET likes = COALESCE(likes, 0) + 1
                WHERE id = (SELECT id FROM latest_note)
                    AND version = (SELECT version FROM latest_note)
                RETURNING id, likes
            """
            cur.execute(query, (note_id,))
            row = cur.fetchone()
            
            if not row:
                raise HTTPException(status_code=404, detail="笔记不存在")
        
        result = {
            "id": row[0],
            "likes": row[1] or 0
        }
        
        return {
            "success": True,
            "data": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/notes")
async def list_notes(
    search: Optional[str] = Query(None, description="搜索关键词（在内容和作者中模糊搜索）"),
    sort_by: str = Query("likes", regex="^(likes|created_at)$", description="排序方式"),
    limit: int = Query(20, ge=1, le=100, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量")
):
    """查询笔记列表（只返回每个id的最新版本）"""
    try:
        with pg_client.cursor() as cur:
            if sort_by == "likes":
                order_by = "likes DESC, version DESC"
            else:
                order_by = "created_at DESC"
            
            if search:
                query = f"""
                    WITH latest_notes AS (
                        SELECT DISTINCT ON (id) 
                            id, created_at, version, author, content, likes, img_url, video_url
                        FROM public.notes
                        WHERE content ILIKE %s OR author ILIKE %s
                        ORDER BY id, version DESC
                    )
                    SELECT id, created_at, version, author, content, likes, img_url, video_url
                    FROM latest_notes
                    ORDER BY {order_by}
                    LIMIT %s OFFSET %s
                """
                search_pattern = f"%{search}%"
                cur.execute(query, (search_pattern, search_pattern, limit, offset))
                rows = cur.fetchall()
                
                count_query = """
                    WITH latest_notes AS (
                        SELECT DISTINCT ON (id) id
                        FROM public.notes
                        WHERE content ILIKE %s OR author ILIKE %s
                        ORDER BY id, version DESC
                    )
                    SELECT COUNT(*) FROM latest_notes
                """
                cur.execute(count_query, (search_pattern, search_pattern))
                total = cur.fetchone()[0]
            else:
                query = f"""
                    WITH latest_notes AS (
                        SELECT DISTINCT ON (id) 
                            id, created_at, version, author, content, likes, img_url, video_url
                        FROM public.notes
                        ORDER BY id, version DESC
                    )
                    SELECT id, created_at, version, author, content, likes, img_url, video_url
                    FROM latest_notes
                    ORDER BY {order_by}
                    LIMIT %s OFFSET %s
                """
                cur.execute(query, (limit, offset))
                rows = cur.fetchall()
                
                count_query = """
                    SELECT COUNT(DISTINCT id) FROM public.notes
                """
                cur.execute(count_query)
                total = cur.fetchone()[0]
        
        items = [
            {
                "id": row[0],
                "created_at": to_beijing_time(row[1]),
                "version": to_beijing_time(row[2]),
                "author": row[3],
                "content": row[4],
                "likes": row[5] or 0,
                "img_url": row[6],
                "video_url": row[7]
            }
            for row in rows
        ]
        
        return {
            "success": True,
            "data": {
                "total": total,
                "items": items
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/notes/{note_id}")
async def get_note(note_id: int):
    """获取单个笔记详情（最新版本）"""
    try:
        with pg_client.cursor() as cur:
            query = """
                SELECT id, created_at, version, author, content, likes, img_url, video_url
                FROM public.notes
                WHERE id = %s
                ORDER BY version DESC
                LIMIT 1
            """
            cur.execute(query, (note_id,))
            row = cur.fetchone()
            
            if not row:
                raise HTTPException(status_code=404, detail="笔记不存在")
        
        result = {
            "id": row[0],
            "created_at": to_beijing_time(row[1]),
            "version": to_beijing_time(row[2]),
            "author": row[3],
            "content": row[4],
            "likes": row[5] or 0,
            "img_url": row[6],
            "video_url": row[7]
        }
        
        return {
            "success": True,
            "data": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
