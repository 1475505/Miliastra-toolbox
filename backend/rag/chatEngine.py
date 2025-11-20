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

# 加载 backend/.env 文件（如果存在）
load_dotenv()

# 加载 rag_v1/.env 文件（优先级更高，会覆盖同名变量）
rag_v1_env_path = os.path.join(os.path.dirname(__file__), "..", "..", "knowledge", "rag_v1", ".env")
rag_v1_env_path = os.path.abspath(rag_v1_env_path)
if os.path.exists(rag_v1_env_path):
    load_dotenv(rag_v1_env_path, override=True)
    print(f"[ChatEngine] 已加载 rag_v1 环境变量: {rag_v1_env_path}")

# 添加 rag_v1 到路径（兼容 Docker 和本地环境）
rag_v1_path = os.path.join(os.path.dirname(__file__), "..", "..", "knowledge", "rag_v1")
rag_v1_path = os.path.abspath(rag_v1_path)
if rag_v1_path not in sys.path:
    sys.path.insert(0, rag_v1_path)

from typing import List, Dict, Any, Generator
import json
import asyncio
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
        # 优先级1：use_default_model 为 true，使用默认免费模型（最高优先级）
        if config.get("use_default_model", False):
            return {
                "api_key": os.getenv("DEFAULT_FREE_MODEL_KEY", ""),
                "api_base_url": os.getenv("DEFAULT_FREE_MODEL_URL", ""),
                "model": os.getenv("DEFAULT_FREE_MODEL_NAME", "")
            }
        
        # 优先级2：用户提供的配置完整（api_key、api_base_url、model 都非空）
        if (config.get("api_key") and config["api_key"].strip() and
            config.get("api_base_url") and config["api_base_url"].strip() and
            config.get("model") and config["model"].strip()):
            return {
                "api_key": config["api_key"],
                "api_base_url": config["api_base_url"],
                "model": config["model"]
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
        # 从环境变量读取检索参数，提供默认值
        similarity_top_k = int(os.getenv("TOP_K", "5"))
        similarity_cutoff = float(os.getenv("SIMILARITY_THRESHOLD", "0.6"))
        
        return CondensePlusContextChatEngine.from_defaults(
            retriever=self.rag_engine.index.as_retriever(
                similarity_top_k=similarity_top_k,
                similarity_cutoff=similarity_cutoff
            ),
            llm=llm,
            chat_history=chat_history,
            context_prompt=(
                "千星沙箱是一款游戏UGC编辑器，主要通过配置实体、节点图来进行操作，实现交互和逻辑。接下来，请根据给予的文档内容回答问题。\n"
                "相关的文档内容：\n"
                "{context_str}\n"
                "回答时，若需要出现文档未提及的观点，请简单标注"
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
            config: LLM 配置 {"api_key", "api_base_url", "model", "use_default_model", "context_length"}
        
        Returns:
            {"answer": str, "sources": List[dict], "tokens": int}
        """
        # 1. 解析 LLM 配置（优先用户 key，其次默认免费模型）
        resolved_config = self._resolve_llm_config(config)
        
        # 2. 获取上下文长度配置（默认为3轮对话）
        context_length = config.get("context_length", 3)
        # 限制对话历史长度（每轮对话包含 user 和 assistant 两条消息）
        # 特殊处理：当context_length=0时，不使用任何对话历史
        if context_length == 0:
            limited_conversation = []
        elif len(conversation) > context_length * 2:
            limited_conversation = conversation[-(context_length * 2):]
        else:
            limited_conversation = conversation
        
        # 3. 创建动态 LLM
        llm = OpenAILike(
            api_key=resolved_config["api_key"],
            api_base=resolved_config["api_base_url"],
            model=resolved_config["model"],
            is_chat_model=True
        )
        print(f"[ChatEngine] 使用 LLM 模型: {resolved_config['model']}")
        
        # 4. 转换对话历史为 ChatMessage 格式（参考官方文档）
        chat_history = [
            ChatMessage(role=msg["role"], content=msg["content"])
            for msg in limited_conversation
        ]
        # 4. 转换对话历史为 ChatMessage 格式（参考官方文档）
        chat_history = [
            ChatMessage(role=msg["role"], content=msg["content"])
            for msg in limited_conversation
        ]
        
        # 5. 重置 token 计数器
        self.token_counter.reset_counts()
        
        # 6. 设置全局 callback manager（参考官方文档）
        original_callback_manager = LlamaSettings.callback_manager
        LlamaSettings.callback_manager = CallbackManager([self.token_counter])
        
        try:
            # 7. 创建 CondensePlusContextChatEngine（参考官方文档）
            chat_engine = self._create_chat_engine(llm, chat_history)
            
            # 8. 执行查询
            response = chat_engine.chat(message)
            
            # 9. 提取来源
            sources = self._extract_sources(response.source_nodes)
            
            # 10. 获取 completion tokens（参考官方文档）
            completion_tokens = self.token_counter.completion_llm_token_count
            
            result = {
                "answer": response.response,
                "sources": sources,
                "tokens": completion_tokens
            }

            # TODO 暂时不支持reasoning_content
            reasoning = None
            # 尝试从 metadata 获取
            if hasattr(response, "metadata") and response.metadata:
                reasoning = response.metadata.get("reasoning_content")
            
            # 如果 response 对象本身有 additional_kwargs
            if not reasoning and hasattr(response, "additional_kwargs"):
                reasoning = response.additional_kwargs.get("reasoning_content")
            
            if reasoning:
                result["reasoning"] = reasoning
            
            return result
        finally:
            # 恢复原来的 callback manager
            LlamaSettings.callback_manager = original_callback_manager
    
    async def chat_stream_async(self, message: str, conversation: List[Dict[str, str]], config: Dict[str, str]):
        """执行异步流式对话查询（带心跳机制防止超时）
        
        Args:
            message: 用户问题
            conversation: 对话历史 [{"role": "user|assistant", "content": "...";}]
            config: LLM 配置 {"api_key", "api_base_url", "model", "use_default_model", "context_length"}
        
        Yields:
            SSE 格式的数据流:
            - : heartbeat (心跳注释，保持连接)
            - data: {"type": "sources", "data": [...]}
            - data: {"type": "token", "data": "文本块"}
            - data: {"type": "done", "data": {"tokens": 123}}
        """
        # 1. 解析 LLM 配置（优先用户 key，其次默认免费模型）
        resolved_config = self._resolve_llm_config(config)
        
        # 2. 获取上下文长度配置（默认为3轮对话）
        context_length = config.get("context_length", 3)
        # 限制对话历史长度（每轮对话包含 user 和 assistant 两条消息）
        # 特殊处理：当context_length=0时，不使用任何对话历史
        if context_length == 0:
            limited_conversation = []
        elif len(conversation) > context_length * 2:
            limited_conversation = conversation[-(context_length * 2):]
        else:
            limited_conversation = conversation
        # 3. 创建动态 LLM
        llm = OpenAILike(
            api_key=resolved_config["api_key"],
            api_base=resolved_config["api_base_url"],
            model=resolved_config["model"],
            is_chat_model=True
        )
        print(f"[ChatEngine Stream] 使用模型: {resolved_config['model']} (API: {resolved_config['api_base_url']})")
        
        # 4. 转换对话历史为 ChatMessage 格式
        chat_history = [
            ChatMessage(role=msg["role"], content=msg["content"])
            for msg in limited_conversation
        ]
        
        # 5. 重置 token 计数器
        self.token_counter.reset_counts()
        
        # 6. 设置全局 callback manager
        original_callback_manager = LlamaSettings.callback_manager
        LlamaSettings.callback_manager = CallbackManager([self.token_counter])
        
        try:
            # 步骤1：发送初始心跳
            yield ": connected\n\n"
            
            # 步骤2：创建 chat engine（可能耗时较长）
            chat_engine = self._create_chat_engine(llm, chat_history)
            # 完成后立即发送心跳
            yield ": chat_engine_created\n\n"
            
            # 步骤3：执行流式查询（检索知识库可能耗时）
            # 使用 asyncio.wait_for 实现心跳，每30秒发送一次
            chat_task = asyncio.create_task(chat_engine.astream_chat(message))
            streaming_response = None
            
            while not chat_task.done():
                try:
                    # 等待任务完成，或者超时
                    streaming_response = await asyncio.wait_for(asyncio.shield(chat_task), timeout=30.0)
                except asyncio.TimeoutError:
                    # 超时发送心跳
                    yield ": heartbeat\n\n"
            
            # 确保获取结果（如果循环结束是因为 task done 但 wait_for 还没返回）
            if streaming_response is None:
                streaming_response = await chat_task

            # 完成后立即发送心跳
            yield ": retrieval_done\n\n"
            
            # 步骤4：发送来源信息
            sources = self._extract_sources(streaming_response.source_nodes)
            yield f"data: {json.dumps({'type': 'sources', 'data': sources}, ensure_ascii=False)}\n\n"
            # 完成后立即发送心跳
            yield ": sources_sent\n\n"
            
            # 步骤5：流式发送文本
            chunk_count = 0
            # 使用 async_response_gen 获取更详细的响应信息
            async for response_chunk in streaming_response.async_response_gen():
                # 发送文本内容
                if response_chunk:
                    yield f"data: {json.dumps({'type': 'token', 'data': response_chunk}, ensure_ascii=False)}\n\n"
                
                chunk_count += 1
                # 每10个文本块发送一次心跳
                if chunk_count % 10 == 0:
                    yield ": generating\n\n"
            
            # 步骤6：发送完成信号
            completion_tokens = self.token_counter.completion_llm_token_count
            yield f"data: {json.dumps({'type': 'done', 'data': {'tokens': completion_tokens}}, ensure_ascii=False)}\n\n"
            # 完成后发送最终心跳
            yield ": completed\n\n"
            
        except Exception as e:
            # 发送错误信息
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)}, ensure_ascii=False)}\n\n"
            
        finally:
            # 恢复原来的 callback manager
            LlamaSettings.callback_manager = original_callback_manager
