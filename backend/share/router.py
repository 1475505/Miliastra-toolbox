"""分享与异步对话 API 路由 - /api/v1/share/* 与 /api/v1/rag/chat/async（agent 异步见 agent/router.py）"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from rag.chat import ChatRequest, get_chat_engine
from share.service import (
    KIND_ASYNC_TASK,
    KIND_SHARE,
    STATUS_COMPLETED,
    STATUS_ERROR,
    STATUS_PENDING,
    STATUS_READY,
    ShareServiceError,
    ShareTooLargeError,
    share_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["share"])


# ── 请求/响应模型 ───────────────────────────────────────────

class ShareMessage(BaseModel):
    """对齐前端 src/types.ts 的 ChatMessage（role 消息或 sources/tool_trace 消息）。

    服务端只做骨架校验与图片剥离，未声明的字段（reasoning、traces 等）原样透传存储。
    """
    model_config = ConfigDict(extra="allow")

    role: Optional[Literal["user", "assistant"]] = None
    content: Optional[str] = None
    type: Optional[Literal["sources", "tool_trace"]] = None
    imageBase64: Optional[str] = None
    imageBase64s: Optional[List[str]] = None


class ShareRequest(BaseModel):
    title: str = Field(default="", max_length=256)
    messages: List[ShareMessage] = Field(min_length=1, max_length=500)


class ShareCreateResponse(BaseModel):
    id: str
    url: str


class ShareDataResponse(BaseModel):
    id: str
    kind: str
    status: str
    title: str
    messages: Optional[List[Dict[str, Any]]] = None
    error: Optional[str] = None


class AsyncChatCreateResponse(BaseModel):
    task_id: str
    url: str
    status: str


# ── 工具函数 ────────────────────────────────────────────────

def _strip_images(messages: List[ShareMessage]) -> List[Dict[str, Any]]:
    """剥离消息中的 base64 图片，替换为 imageCount 占位标记"""
    stripped: List[Dict[str, Any]] = []
    for msg in messages:
        data = msg.model_dump(exclude_none=True)
        if msg.role == "user":
            images = msg.imageBase64s or ([msg.imageBase64] if msg.imageBase64 else [])
            data.pop("imageBase64", None)
            data.pop("imageBase64s", None)
            if images:
                data["imageCount"] = len(images)
        stripped.append(data)
    return stripped


def _map_service_error(e: ShareServiceError) -> HTTPException:
    if isinstance(e, ShareTooLargeError):
        return HTTPException(status_code=413, detail=str(e))
    return HTTPException(status_code=503, detail="Share storage unavailable")


def _build_async_payload(request: ChatRequest, result: Dict[str, Any]) -> Dict[str, Any]:
    """将异步对话结果包装为分享页可直接渲染的消息列表"""
    image_count = len(request.image_base64s or []) + (1 if request.image_base64 else 0)
    user_message: Dict[str, Any] = {"role": "user", "content": request.message}
    if image_count:
        user_message["imageCount"] = image_count

    assistant_message: Dict[str, Any] = {"role": "assistant", "content": result.get("answer", "")}
    if result.get("reasoning"):
        assistant_message["reasoning"] = result["reasoning"]

    messages: List[Dict[str, Any]] = [user_message, assistant_message]
    if result.get("sources"):
        messages.append({
            "type": "sources",
            "sources": result["sources"],
            "tokens": result.get("tokens"),
        })

    title = request.message[:20] + ("..." if len(request.message) > 20 else "")
    return {"title": title, "messages": messages, "createdAt": int(time.time() * 1000)}


# ── 分享端点 ────────────────────────────────────────────────

@router.post("/share", response_model=ShareCreateResponse)
async def create_share(request: ShareRequest) -> ShareCreateResponse:
    """创建分享，返回可分享的链接"""
    payload: Dict[str, Any] = {
        "title": request.title,
        "messages": _strip_images(request.messages),
        "createdAt": int(time.time() * 1000),
    }
    try:
        share_id = share_service.create(
            kind=KIND_SHARE, status=STATUS_READY, title=request.title, payload=payload
        )
    except ShareServiceError as e:
        raise _map_service_error(e) from e
    return ShareCreateResponse(id=share_id, url=f"/share/{share_id}")


@router.get("/share/{share_id}", response_model=ShareDataResponse)
async def get_share(share_id: str) -> ShareDataResponse:
    """读取分享内容（异步任务未完成时 messages 为空，前端轮询本接口）"""
    try:
        record = share_service.get(share_id)
    except ShareServiceError as e:
        raise _map_service_error(e) from e
    if record is None:
        raise HTTPException(status_code=404, detail="Share not found")
    return ShareDataResponse(
        id=record.id,
        kind=record.kind,
        status=record.status,
        title=record.title,
        messages=record.messages,
        error=record.error,
    )


# ── 异步对话端点 ────────────────────────────────────────────

@router.post("/rag/chat/async", response_model=AsyncChatCreateResponse)
async def chat_async(request: ChatRequest) -> AsyncChatCreateResponse:
    """异步对话：立即返回任务链接，结果完成后可通过 GET /share/{id} 轮询查看"""
    payload: Dict[str, Any] = {"title": "", "messages": [], "createdAt": int(time.time() * 1000)}
    try:
        task_id = share_service.create(
            kind=KIND_ASYNC_TASK, status=STATUS_PENDING, title="", payload=payload
        )
    except ShareServiceError as e:
        raise _map_service_error(e) from e

    asyncio.create_task(_run_async_task(task_id, request))

    return AsyncChatCreateResponse(task_id=task_id, url=f"/share/{task_id}", status=STATUS_PENDING)


async def _run_async_task(task_id: str, request: ChatRequest) -> None:
    """后台执行对话并回写结果到 shares 表"""
    try:
        engine = get_chat_engine()
        image_base64s = request.image_base64s
        if not image_base64s and request.image_base64:
            image_base64s = [request.image_base64]

        result = await asyncio.to_thread(
            engine.chat,
            message=request.message,
            conversation=[msg.model_dump() for msg in request.conversation],
            config=request.config.model_dump(),
            image_base64s=image_base64s,
        )
        share_service.update_task(task_id, STATUS_COMPLETED, payload=_build_async_payload(request, result))
    except Exception as e:
        logger.error("async chat task %s failed: %s", task_id, e)
        try:
            share_service.update_task(task_id, STATUS_ERROR, error=str(e))
        except ShareServiceError as persist_error:
            logger.error("async chat task %s failed to persist error: %s", task_id, persist_error)
