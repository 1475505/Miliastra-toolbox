"""Agent API 路由 - /api/v1/agent/*"""
import json
import uuid
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

from agent.agentEngine import AgentEngine
from agent.diagram import diagram_store

router = APIRouter()


# ── 请求/响应模型（与 RAG 接口共用结构）──────────────────────
class Message(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1)


class LLMConfig(BaseModel):
    api_key: str = ""
    api_base_url: str = ""
    model: str = ""
    use_default_model: int = Field(default=0)
    context_length: int = Field(default=3, ge=0, le=20)


class AgentChatRequest(BaseModel):
    id: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=2000)
    conversation: List[Message] = Field(default_factory=list)
    config: LLMConfig


# ── 单例 ────────────────────────────────────────────────────
_engine: Optional[AgentEngine] = None


def _get_engine() -> AgentEngine:
    global _engine
    if _engine is None:
        _engine = AgentEngine()
    return _engine


# ── 端点 ────────────────────────────────────────────────────
@router.post("/agent/chat")
async def agent_chat(req: Request, body: AgentChatRequest):
    try:
        base = f"{req.url.scheme}://{req.headers.get('host', '')}"
        result = await _get_engine().chat(
            message=body.message,
            conversation=[m.model_dump() for m in body.conversation],
            config=body.config.model_dump(),
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
        "tools": ["get_node_info", "list_documents", "get_document", "search_knowledge", "generate_diagram"]}}


@router.get("/agent/diagram/{diagram_id}")
async def get_diagram_png(diagram_id: str):
    """返回由 generate_diagram 工具生成的 PNG 图片。"""
    entry = diagram_store.get(diagram_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="图表不存在或已过期")
    png_bytes, _ = entry
    return Response(content=png_bytes, media_type="image/png",
                    headers={"Cache-Control": "public, max-age=3600"})
