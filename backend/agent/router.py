"""Agent API 路由 - /api/v1/agent/*"""
import asyncio
import json
import logging
import time
import uuid
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

from agent.agentEngine import AgentEngine
from agent.diagram import diagram_store
from share.service import (
    KIND_ASYNC_TASK,
    MAX_SINGLE_BYTES,
    STATUS_COMPLETED,
    STATUS_ERROR,
    STATUS_PENDING,
    ShareServiceError,
    ShareTooLargeError,
    share_service,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ── 请求/响应模型（与 RAG 接口共用结构）──────────────────────
class Message(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1)
    reasoning: Optional[str] = Field(default=None, description="assistant 消息的推理内容，思考模式模型需原样回传")


class LLMConfig(BaseModel):
    api_key: str = ""
    api_base_url: str = ""
    model: str = ""
    use_default_model: int = Field(default=0)
    context_length: int = Field(default=3, ge=0, le=20)
    answer_language: str = Field(default="chs", description="回答目标语言码（chs/cht/en/jp/kr/de/es/fr/id/it/pt/ru/th/tr/vi），默认中文")


class AgentChatRequest(BaseModel):
    id: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=10000)
    conversation: List[Message] = Field(default_factory=list)
    config: LLMConfig
    image_base64: Optional[str] = None
    image_base64s: Optional[List[str]] = None


# ── 单例 ────────────────────────────────────────────────────
_engine: Optional[AgentEngine] = None


def _get_engine() -> AgentEngine:
    global _engine
    if _engine is None:
        _engine = AgentEngine()
    return _engine


def _normalize_image_base64s(body: AgentChatRequest) -> Optional[List[str]]:
    """兼容单张/多张图片输入，统一返回图片列表（无图片时返回 None）"""
    images = list(body.image_base64s or [])
    if body.image_base64 and body.image_base64 not in images:
        images.insert(0, body.image_base64)
    return images if images else None


# ── 端点 ────────────────────────────────────────────────────
@router.post("/agent/chat")
async def agent_chat(req: Request, body: AgentChatRequest):
    try:
        base = f"{req.url.scheme}://{req.headers.get('host', '')}"
        result = await _get_engine().chat(
            message=body.message,
            conversation=[m.model_dump() for m in body.conversation],
            config=body.config.model_dump(),
            image_base64s=_normalize_image_base64s(body),
        )
        answer = result.get("answer", "")
        if base and "/api/v1/agent/diagram/" in answer:
            result["answer"] = answer.replace(
                "/api/v1/agent/diagram/", f"{base}/api/v1/agent/diagram/"
            )
        return {"success": True, "data": {
            "id": body.id or f"agent-{uuid.uuid4().hex[:12]}",
            "question": body.message, "mode": "agent", **result}, "error": None}
    except ValueError as e:
        return {"success": False, "data": None, "error": {"code": "INVALID_CONFIG", "message": str(e)}}
    except Exception as e:
        return {"success": False, "data": None, "error": {"code": "INTERNAL_ERROR", "message": str(e)}}


async def _rewrite_diagram_urls(agen, base: str):
    prefix = f"{base}/api/v1/agent/diagram/"
    async for chunk in agen:
        yield chunk.replace("/api/v1/agent/diagram/", prefix)


@router.post("/agent/chat/stream")
async def agent_chat_stream(req: Request, body: AgentChatRequest):
    try:
        base = f"{req.url.scheme}://{req.headers.get('host', '')}"
        stream = _get_engine().chat_stream(
            message=body.message,
            conversation=[m.model_dump() for m in body.conversation],
            config=body.config.model_dump(),
            image_base64s=_normalize_image_base64s(body),
        )
        return StreamingResponse(
            _rewrite_diagram_urls(stream, base) if base else stream,
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})
    except Exception as e:
        return StreamingResponse(
            iter([f"data: {json.dumps({'type': 'error', 'data': str(e)}, ensure_ascii=False)}\n\n"]),
            media_type="text/event-stream")


@router.get("/agent/capabilities")
async def agent_capabilities():
    return {"success": True, "data": {
        "mode": "agent", "streaming": True, "image_input": False,
        "tools": ["get_node_info", "list_documents", "get_document", "search_knowledge", "generate_diagram", "translate_terms"]}}


# ── 异步 Agent 对话（结果挂到分享页）─────────────────────────

def _map_share_error(e: ShareServiceError) -> HTTPException:
    if isinstance(e, ShareTooLargeError):
        return HTTPException(status_code=413, detail=str(e))
    return HTTPException(status_code=503, detail="Share storage unavailable")


def _inline_diagrams(answer: str, diagrams: List[Dict[str, str]]) -> str:
    """将回答中的相对 diagram URL 替换为 data URI。

    diagram_store 是内存 LRU（重启即失效），而分享链接长期存在，
    内联后分享页不依赖服务进程状态即可渲染图表。
    """
    for d in diagrams:
        url = f"/api/v1/agent/diagram/{d.get('diagram_id', '')}"
        if url in answer:
            answer = answer.replace(url, d["png_data_uri"])
    return answer


def _build_agent_payload(body: AgentChatRequest, result: Dict[str, Any], inline_diagrams: bool = True) -> Dict[str, Any]:
    """将 Agent 异步结果包装为分享页可直接渲染的消息列表（对齐前端 agent 模式消息结构）"""
    image_count = len(body.image_base64s or []) + (1 if body.image_base64 else 0)
    user_message: Dict[str, Any] = {"role": "user", "content": body.message}
    if image_count:
        user_message["imageCount"] = image_count

    answer = result.get("answer", "")
    if inline_diagrams:
        answer = _inline_diagrams(answer, result.get("diagrams") or [])

    # 与前端 agent 模式一致：工具轨迹消息在回答之前，不单独发 sources 消息
    messages: List[Dict[str, Any]] = [user_message]
    if result.get("tool_trace"):
        messages.append({"type": "tool_trace", "traces": result["tool_trace"], "stats": result.get("stats")})

    assistant_message: Dict[str, Any] = {"role": "assistant", "content": answer}
    if result.get("reasoning"):
        assistant_message["reasoning"] = result["reasoning"]
    messages.append(assistant_message)

    title = body.message[:20] + ("..." if len(body.message) > 20 else "")
    return {"title": title, "messages": messages, "createdAt": int(time.time() * 1000)}


def _payload_bytes(payload: Dict[str, Any]) -> int:
    return len(json.dumps(payload, ensure_ascii=False).encode("utf-8"))


@router.post("/agent/chat/async")
async def agent_chat_async(body: AgentChatRequest):
    """异步 Agent 对话：立即返回任务链接，后台执行完成后结果挂到分享页

    通过 GET /api/v1/share/{task_id} 轮询 status（pending → completed / error），
    completed 后 messages 为分享页渲染格式（user / tool_trace / assistant）。
    """
    payload: Dict[str, Any] = {"title": "", "messages": [], "createdAt": int(time.time() * 1000)}
    try:
        task_id = share_service.create(
            kind=KIND_ASYNC_TASK, status=STATUS_PENDING, title="", payload=payload
        )
    except ShareServiceError as e:
        raise _map_share_error(e) from e

    asyncio.create_task(_run_agent_task(task_id, body))

    return {"task_id": task_id, "url": f"/share/{task_id}", "status": STATUS_PENDING}


async def _run_agent_task(task_id: str, body: AgentChatRequest) -> None:
    """后台执行 Agent 对话并回写结果到 shares 表"""
    try:
        result = await _get_engine().chat(
            message=body.message,
            conversation=[m.model_dump() for m in body.conversation],
            config=body.config.model_dump(),
            image_base64s=_normalize_image_base64s(body),
        )
        payload = _build_agent_payload(body, result)
        if _payload_bytes(payload) > MAX_SINGLE_BYTES:
            # 内联图表超限时降级为保留相对 URL，仍超限则由 update_task 拒绝并落 error
            payload = _build_agent_payload(body, result, inline_diagrams=False)
        share_service.update_task(task_id, STATUS_COMPLETED, payload=payload)
    except Exception as e:
        logger.error("async agent task %s failed: %s", task_id, e)
        try:
            share_service.update_task(task_id, STATUS_ERROR, error=str(e))
        except ShareServiceError as persist_error:
            logger.error("async agent task %s failed to persist error: %s", task_id, persist_error)


@router.get("/agent/diagram/{diagram_id}")
async def get_diagram_png(diagram_id: str):
    """返回由 generate_diagram 工具生成的 PNG 图片。"""
    entry = diagram_store.get(diagram_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="图表不存在或已过期")
    png_bytes, _ = entry
    return Response(content=png_bytes, media_type="image/png",
                    headers={"Cache-Control": "public, max-age=3600"})
