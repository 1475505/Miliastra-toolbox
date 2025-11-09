"""
ChatEngine - 封装 LlamaIndex 对话引擎

设计原则：
1. 无状态：客户端管理对话历史
2. 依赖注入：动态 LLM 配置
3. 单一职责：只负责对话逻辑
"""
import sys
import os

# 添加 rag_v1 到路径
rag_v1_path = os.path.join(os.path.dirname(__file__), "..", "..", "knowledge", "rag_v1")
if rag_v1_path not in sys.path:
    sys.path.insert(0, rag_v1_path)

from typing import List, Dict, Any
from llama_index.llms.openai_like import OpenAILike
from llama_index.core.llms import ChatMessage
from llama_index.core.chat_engine import CondensePlusContextChatEngine
from llama_index.core.callbacks import CallbackManager, TokenCountingHandler
from llama_index.core import Settings as LlamaSettings
import tiktoken

from src.rag_engine import create_rag_engine


class ChatEngine:
    """轻量级对话引擎"""
    
    def __init__(self):
        """初始化 RAG 索引和 token 计数器"""
        self.rag_engine = create_rag_engine()
        if not self.rag_engine.index:
            raise RuntimeError("知识库未初始化，请先构建索引")
        
        # 初始化 token 计数器（参考官方文档）
        self.token_counter = TokenCountingHandler(
            tokenizer=tiktoken.encoding_for_model("gpt-3.5-turbo").encode,
            verbose=False
        )
    
    def chat(self, message: str, conversation: List[Dict[str, str]], config: Dict[str, str]) -> Dict[str, Any]:
        """执行对话查询
        
        Args:
            message: 用户问题
            conversation: 对话历史 [{"role": "user|assistant", "content": "..."}]
            config: LLM 配置 {"api_key", "api_base_url", "model"}
        
        Returns:
            {"answer": str, "sources": List[dict], "tokens": int}
        """
        # 1. 创建动态 LLM
        llm = OpenAILike(
            api_key=config["api_key"],
            api_base=config["api_base_url"],
            model=config["model"],
            is_chat_model=True
        )
        
        # 2. 转换对话历史为 ChatMessage 格式（参考官方文档）
        chat_history = [
            ChatMessage(role=msg["role"], content=msg["content"])
            for msg in conversation
        ]
        
        # 3. 重置 token 计数器
        self.token_counter.reset_counts()
        
        # 4. 设置全局 callback manager（参考官方文档）
        original_callback_manager = LlamaSettings.callback_manager
        LlamaSettings.callback_manager = CallbackManager([self.token_counter])
        
        try:
            # 5. 创建 CondensePlusContextChatEngine（参考官方文档）
            chat_engine = CondensePlusContextChatEngine.from_defaults(
                retriever=self.rag_engine.index.as_retriever(
                    similarity_top_k=5,
                    similarity_cutoff=0.6
                ),
                llm=llm,
                chat_history=chat_history,
                context_prompt=(
                    "你是千星沙箱编辑器助手，能够进行正常的交互，也能基于文档内容回答问题。\n"
                    "这里是相关的文档内容：\n"
                    "{context_str}\n"
                    "指令：使用之前的对话历史或上述上下文来与用户交互并提供帮助。"
                ),
                verbose=False
            )
            
            # 6. 执行查询
            response = chat_engine.chat(message)
            
            # 7. 提取来源
            sources = [
                {
                    "title": node.metadata.get("file_name", "未知文档"),
                    "doc_id": node.metadata.get("doc_id", ""),
                    "similarity": round(node.score or 0.0, 2),
                    "text_snippet": node.get_text()[:200] + "...",
                    "url": node.metadata.get("file_path", "")
                }
                for node in response.source_nodes
            ]
            
            # 8. 获取 completion tokens（参考官方文档）
            completion_tokens = self.token_counter.completion_llm_token_count
            
            return {
                "answer": response.response,
                "sources": sources,
                "tokens": completion_tokens
            }
        finally:
            # 恢复原来的 callback manager
            LlamaSettings.callback_manager = original_callback_manager
