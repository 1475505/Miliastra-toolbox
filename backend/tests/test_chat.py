"""
RAG Chat 功能测试

测试驱动开发：先写测试，再实现功能
"""
import pytest
from rag.chatEngine import ChatEngine
from rag.chat import ChatRequest, ChatResponse, Message


class TestChatEngine:
    """ChatEngine 单元测试"""
    
    def test_init(self):
        """测试 ChatEngine 初始化"""
        engine = ChatEngine()
        assert engine.rag_engine is not None
        assert engine.rag_engine.index is not None
        assert engine.token_counter is not None
    
    def test_chat_signature(self):
        """测试 chat 方法签名"""
        import inspect
        sig = inspect.signature(ChatEngine.chat)
        params = list(sig.parameters.keys())
        assert 'message' in params
        assert 'conversation' in params
        assert 'config' in params


class TestChatAPI:
    """测试 FastAPI 端点"""
    
    def test_request_model_validation(self):
        """测试请求模型验证"""
        # 有效请求
        valid_request = {
            "message": "什么是小地图？",
            "conversation": [],
            "config": {
                "api_key": "sk-test",
                "api_base_url": "https://api.deepseek.com/v1",
                "model": "deepseek-chat"
            }
        }
        
        request = ChatRequest(**valid_request)
        assert request.message == "什么是小地图？"
        assert len(request.conversation) == 0
        assert request.config.api_key == "sk-test"
    
    def test_request_missing_required_fields(self):
        """测试缺少必填字段"""
        with pytest.raises(Exception):
            ChatRequest(message="test")  # 缺少 config
    
    def test_response_model_structure(self):
        """测试响应模型结构"""
        from rag.chat import ChatData, SourceNode
        
        response = ChatResponse(
            success=True,
            data=ChatData(
                id="test_session",
                question="什么是小地图？",
                answer="小地图是...",
                sources=[
                    SourceNode(
                        title="小地图指南",
                        doc_id="doc_001",
                        similarity=0.89,
                        text_snippet="小地图是游戏中的重要功能...",
                        url="/knowledge/guide/map.md"
                    )
                ],
                stats={"tokens": 150}
            )
        )
        
        assert response.success is True
        assert response.data.answer == "小地图是..."
        assert len(response.data.sources) == 1
        assert response.error is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
