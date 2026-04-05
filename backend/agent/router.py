"""Agent API 路由 - /api/v1/agent/*"""
import json
import uuid
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

from agent.agentEngine import AgentEngine

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
async def agent_chat(request: AgentChatRequest):
    try:
        result = await _get_engine().chat(
            message=request.message,
            conversation=[m.model_dump() for m in request.conversation],
            config=request.config.model_dump(),
        )
        return {"success": True, "data": {
            "id": request.id or f"agent-{uuid.uuid4().hex[:12]}",
            "question": request.message, "mode": "agent", **result}, "error": None}
    except ValueError as e:
        return {"success": False, "data": None, "error": {"code": "INVALID_CONFIG", "message": str(e)}}
    except Exception as e:
        return {"success": False, "data": None, "error": {"code": "INTERNAL_ERROR", "message": str(e)}}


@router.post("/agent/chat/stream")
async def agent_chat_stream(request: AgentChatRequest):
    try:
        return StreamingResponse(
            _get_engine().chat_stream(
                message=request.message,
                conversation=[m.model_dump() for m in request.conversation],
                config=request.config.model_dump()),
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
        "tools": ["get_node_info", "list_documents", "get_document", "search_knowledge"]}}
