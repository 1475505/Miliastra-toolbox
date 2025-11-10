"""
ChatEngine - 封装 LlamaIndex 对话引擎

设计原则：
1. 无状态：客户端管理对话历史
2. 依赖注入：动态 LLM 配置
3. 单一职责：只负责对话逻辑
"""
import sys
import os
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv()

# 添加 rag_v1 到路径
rag_v1_path = os.path.join(os.path.dirname(__file__), "..", "..", "knowledge", "rag_v1")
if rag_v1_path not in sys.path:
    sys.path.insert(0, rag_v1_path)

from typing import List, Dict, Any, Generator
import json
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
    
    def _resolve_llm_config(self, config: Dict[str, Any]) -> Dict[str, str]:
        """解析 LLM 配置，优先使用用户提供的配置，否则使用默认免费模型
        
        Args:
            config: 请求中的 config 对象 {"api_key", "api_base_url", "model", "use_default_model"}
            
        Returns:
            {"api_key", "api_base_url", "model"}
        """
        # 优先级1：用户提供的配置完整（api_key、api_base_url、model 都非空）
        if (config.get("api_key") and config["api_key"].strip() and
            config.get("api_base_url") and config["api_base_url"].strip() and
            config.get("model") and config["model"].strip()):
            return {
                "api_key": config["api_key"],
                "api_base_url": config["api_base_url"],
                "model": config["model"]
            }
        
        # 优先级2：use_default_model 为 true，使用默认免费模型
        if config.get("use_default_model", False):
            return {
                "api_key": os.getenv("DEFAULT_FREE_MODEL_KEY", ""),
                "api_base_url": os.getenv("DEFAULT_FREE_MODEL_URL", ""),
                "model": os.getenv("DEFAULT_FREE_MODEL_NAME", "")
            }
        
        # 如果都没有提供，抛出异常
        raise ValueError("未提供有效的 API 配置，请完整配置 API Key、Base URL、Model，或启用默认免费模型")
    
    
    def _create_chat_engine(self, llm, chat_history):
        """创建 chat engine（公共方法）
        
        Args:
            llm: LLM 实例
            chat_history: ChatMessage 列表
            
        Returns:
            CondensePlusContextChatEngine 实例
        """
        return CondensePlusContextChatEngine.from_defaults(
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
    
    def _extract_sources(self, source_nodes) -> List[Dict[str, Any]]:
        """提取来源信息（公共方法）
        
        Args:
            source_nodes: 源节点列表
            
        Returns:
            来源信息列表
        """
        return [
            {
                "title": node.metadata.get("title", node.metadata.get("file_name", "未知文档")),
                "doc_id": node.metadata.get("id", node.metadata.get("doc_id", "")),
                "similarity": round(node.score or 0.0, 2),
                "text_snippet": node.get_text()[:200] + "...",
                "url": node.metadata.get("url", node.metadata.get("sourceURL", node.metadata.get("file_path", "")))
            }
            for node in source_nodes
        ]
    
    def chat(self, message: str, conversation: List[Dict[str, str]], config: Dict[str, str]) -> Dict[str, Any]:
        """执行对话查询
        
        Args:
            message: 用户问题
            conversation: 对话历史 [{"role": "user|assistant", "content": "..."}]
            config: LLM 配置 {"api_key", "api_base_url", "model", "use_default_model"}
        
        Returns:
            {"answer": str, "sources": List[dict], "tokens": int}
        """
        # 1. 解析 LLM 配置（优先用户 key，其次默认免费模型）
        resolved_config = self._resolve_llm_config(config)
        
        # 2. 创建动态 LLM
        llm = OpenAILike(
            api_key=resolved_config["api_key"],
            api_base=resolved_config["api_base_url"],
            model=resolved_config["model"],
            is_chat_model=True
        )
        
        # 3. 转换对话历史为 ChatMessage 格式（参考官方文档）
        chat_history = [
            ChatMessage(role=msg["role"], content=msg["content"])
            for msg in conversation
        ]
        
        # 4. 重置 token 计数器
        self.token_counter.reset_counts()
        
        # 5. 设置全局 callback manager（参考官方文档）
        original_callback_manager = LlamaSettings.callback_manager
        LlamaSettings.callback_manager = CallbackManager([self.token_counter])
        
        try:
            # 6. 创建 CondensePlusContextChatEngine（参考官方文档）
            chat_engine = self._create_chat_engine(llm, chat_history)
            
            # 7. 执行查询
            response = chat_engine.chat(message)
            
            # 8. 提取来源
            sources = self._extract_sources(response.source_nodes)
            
            # 9. 获取 completion tokens（参考官方文档）
            completion_tokens = self.token_counter.completion_llm_token_count
            
            return {
                "answer": response.response,
                "sources": sources,
                "tokens": completion_tokens
            }
        finally:
            # 恢复原来的 callback manager
            LlamaSettings.callback_manager = original_callback_manager
    
    def chat_stream(self, message: str, conversation: List[Dict[str, str]], config: Dict[str, str]) -> Generator[str, None, None]:
        """执行流式对话查询
        
        Args:
            message: 用户问题
            conversation: 对话历史 [{"role": "user|assistant", "content": "..."}]
            config: LLM 配置 {"api_key", "api_base_url", "model", "use_default_model"}
        
        Yields:
            SSE 格式的数据流:
            - data: {"type": "sources", "data": [...]}
            - data: {"type": "token", "data": "文本块"}
            - data: {"type": "done", "data": {"tokens": 123}}
        """
        # 1. 解析 LLM 配置（优先用户 key，其次默认免费模型）
        resolved_config = self._resolve_llm_config(config)
        
        # 2. 创建动态 LLM
        llm = OpenAILike(
            api_key=resolved_config["api_key"],
            api_base=resolved_config["api_base_url"],
            model=resolved_config["model"],
            is_chat_model=True
        )
        
        # 3. 转换对话历史为 ChatMessage 格式
        chat_history = [
            ChatMessage(role=msg["role"], content=msg["content"])
            for msg in conversation
        ]
        
        # 4. 重置 token 计数器
        self.token_counter.reset_counts()
        
        # 5. 设置全局 callback manager
        original_callback_manager = LlamaSettings.callback_manager
        LlamaSettings.callback_manager = CallbackManager([self.token_counter])
        
        try:
            # 6. 创建 chat engine
            chat_engine = self._create_chat_engine(llm, chat_history)
            
            # 7. 执行流式查询
            streaming_response = chat_engine.stream_chat(message)
            
            # 8. 先发送来源信息
            sources = self._extract_sources(streaming_response.source_nodes)
            yield f"data: {json.dumps({'type': 'sources', 'data': sources}, ensure_ascii=False)}\n\n"
            
            # 9. 流式发送文本
            for text_chunk in streaming_response.response_gen:
                yield f"data: {json.dumps({'type': 'token', 'data': text_chunk}, ensure_ascii=False)}\n\n"
            
            # 10. 发送完成信号
            completion_tokens = self.token_counter.completion_llm_token_count
            yield f"data: {json.dumps({'type': 'done', 'data': {'tokens': completion_tokens}}, ensure_ascii=False)}\n\n"
            
        finally:
            # 恢复原来的 callback manager
            LlamaSettings.callback_manager = original_callback_manager
