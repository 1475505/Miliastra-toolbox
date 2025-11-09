"""
FastAPI Chat 端点

设计原则：
1. 薄层封装：只负责请求/响应转换
2. 数据验证：使用 Pydantic
3. 错误处理：统一异常处理
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from .chatEngine import ChatEngine

router = APIRouter()


# ============ 请求模型 ============

class Message(BaseModel):
    """对话消息"""
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1)


class LLMConfig(BaseModel):
    """LLM 配置"""
    api_key: str = Field(..., min_length=1)
    api_base_url: str = Field(..., min_length=1)
    model: str = Field(..., min_length=1)


class ChatRequest(BaseModel):
    """聊天请求"""
    id: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=2000)
    conversation: List[Message] = Field(default_factory=list)
    config: LLMConfig


# ============ 响应模型 ============

class SourceNode(BaseModel):
    """引用来源"""
    title: str
    doc_id: str
    similarity: float
    text_snippet: str
    url: str


class ChatData(BaseModel):
    """聊天响应数据"""
    id: str
    question: str
    answer: str
    sources: List[SourceNode]
    stats: Dict[str, Any]


class ChatResponse(BaseModel):
    """统一响应格式"""
    success: bool
    data: Optional[ChatData] = None
    error: Optional[str] = None


# ============ 全局状态 ============

chat_engine = None


def get_chat_engine() -> ChatEngine:
    """获取 ChatEngine 单例"""
    global chat_engine
    if chat_engine is None:
        chat_engine = ChatEngine()
    return chat_engine


# ============ API 端点 ============

@router.post("/rag/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """对话端点
    
    Returns:
        ChatResponse: 包含答案、来源、统计信息
    """
    try:
        # 1. 获取引擎
        engine = get_chat_engine()
        
        # 2. 转换请求
        conversation = [msg.dict() for msg in request.conversation]
        llm_config = request.config.dict()
        
        # 3. 执行对话
        result = engine.chat(
            message=request.message,
            conversation=conversation,
            config=llm_config
        )
        
        # 4. 构建响应
        return ChatResponse(
            success=True,
            data=ChatData(
                id=request.id or "default_session",
                question=request.message,
                answer=result["answer"],
                sources=[SourceNode(**src) for src in result["sources"]],
                stats={"tokens": result["tokens"]}
            )
        )
    
    except Exception as e:
        # 统一错误处理
        return ChatResponse(
            success=False,
            error=str(e)
        )


@router.get("/health")
async def health():
    """健康检查"""
    try:
        engine = get_chat_engine()
        return {
            "status": "ok",
            "index_loaded": engine.rag_engine.index is not None
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }
