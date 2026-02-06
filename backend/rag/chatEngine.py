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
from datetime import datetime, timezone, timedelta

# 加载 backend/.env 文件（如果存在）
load_dotenv()

# 加载 rag_v1/.env 文件（优先级更高，会覆盖同名变量）
rag_v1_env_path = os.path.join(os.path.dirname(__file__), "..", "..", "knowledge", "rag_v1", ".env")
rag_v1_env_path = os.path.abspath(rag_v1_env_path)
if os.path.exists(rag_v1_env_path):
    load_dotenv(rag_v1_env_path, override=True)
    print(f"[ChatEngine] 已加载 rag_v1 环境变量: {rag_v1_env_path}")

# 添加 backend/common 到路径以导入限额管理器
backend_path = os.path.join(os.path.dirname(__file__), "..")
backend_path = os.path.abspath(backend_path)
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

# 添加 rag_v1 到路径（兼容 Docker 和本地环境）
rag_v1_path = os.path.join(os.path.dirname(__file__), "..", "..", "knowledge", "rag_v1")
rag_v1_path = os.path.abspath(rag_v1_path)
if rag_v1_path not in sys.path:
    sys.path.insert(0, rag_v1_path)

from typing import List, Dict, Any, Generator, Optional
import json
import asyncio
import base64
from llama_index.llms.openai_like import OpenAILike
from llama_index.core.llms import ChatMessage, TextBlock, ImageBlock, MessageRole
from llama_index.core.callbacks import CallbackManager, TokenCountingHandler
from llama_index.core import Settings as LlamaSettings
from llama_index.core.vector_stores.types import MetadataFilters, MetadataFilter, FilterOperator
import tiktoken

from src.rag_engine import create_rag_engine
from common.pg_client import model_usage_manager


class CombinedRetriever:
    """组合检索器：
    - 先从非user来源召回 N 条（doc_max 的部分）
    - 再从user来源召回,补足到 total_k
    """

    def __init__(self, index, total_k: int = 5, doc_max: int = 4, bbs_key: str = "source_dir", bbs_value: str = "user", similarity_cutoff: float = None):
        self.index = index
        self.total_k = int(total_k)
        self.doc_max = int(doc_max)
        self.bbs_key = bbs_key
        self.bbs_value = bbs_value
        self.similarity_cutoff = similarity_cutoff

    def _call_retrieve(self, retriever, query: str, filters=None):
        """Call the underlying retriever with the query.

        This implementation no longer attempts to pass `filters` to the
        underlying retriever. Some deployed llama-index/chroma versions do
        not support a `filters` kwarg; we ignore `filters` here and always
        call the basic `retrieve(query)` / `get_relevant_documents(query)`
        method. Callers may still pass a `filters` argument but it will be
        ignored.

        metadata:{'file_name': 'bbs-faq.md', 'file_path': '/home/ubuntu/js/Miliastra-toolbox/knowledge/rag_v1/../user/bbs-faq.md', 'source_dir': 'user', 'id': 'bbs-faq-20251201', 'title': '米游社【问答集中楼】开发问题互助专区', 'force': True, 'url': 'https://www.miyoushe.com/ys/article/69834163', 'h1_title': 'Q. A.', 'chunk_index': 173}
        """
        # Support different retriever method names but always call with query only
        if hasattr(retriever, "retrieve"):
            return retriever.retrieve(query)
        if hasattr(retriever, "get_relevant_documents"):
            return retriever.get_relevant_documents(query)
        raise RuntimeError("base retriever 不支持 retrieve 或 get_relevant_documents 方法")

    def retrieve(self, query: str):
        total_k = max(self.total_k, 0)
        preferred_k = max(min(self.doc_max, total_k), 0)

        preferred_nodes = []
        non_preferred_nodes = []

        try:
            preferred_filters = MetadataFilters(
                filters=[MetadataFilter(key=self.bbs_key, value=self.bbs_value, operator=FilterOperator.NE)]
            )
            preferred_retriever = self.index.as_retriever(
                similarity_top_k=max(preferred_k, 4) if preferred_k > 0 else 4,
                similarity_cutoff=self.similarity_cutoff,
                filters=preferred_filters
            )
            preferred_nodes = list(self._call_retrieve(preferred_retriever, query))
        except Exception:
            preferred_nodes = []

        non_preferred_k = total_k - len(preferred_nodes)
        try:
            non_preferred_filters = MetadataFilters(
                filters=[MetadataFilter(key=self.bbs_key, value=self.bbs_value, operator=FilterOperator.EQ)]
            )
            non_preferred_retriever = self.index.as_retriever(
                similarity_top_k=max(non_preferred_k, 1),
                similarity_cutoff=self.similarity_cutoff,
                filters=non_preferred_filters
            )
            non_preferred_nodes = list(self._call_retrieve(non_preferred_retriever, query))
        except Exception:
            non_preferred_nodes = []

        combined = []
        seen = set()

        def _add_nodes(nodes, limit):
            for node in nodes:
                if len(combined) >= limit:
                    break
                node_id = getattr(node, "node_id", None) or id(node)
                if node_id in seen:
                    continue
                seen.add(node_id)
                combined.append(node)

        _add_nodes(non_preferred_nodes, non_preferred_k)
        _add_nodes(preferred_nodes, non_preferred_k + preferred_k)

        if len(combined) < total_k:
            _add_nodes(non_preferred_nodes, total_k)
            _add_nodes(preferred_nodes, total_k)

        return combined[:total_k]

    # 适配其他调用方可能使用的方法名
    def get_relevant_documents(self, query: str):
        return self.retrieve(query)

    # 异步适配：某些 llama_index 组件会调用 aretrieve / aget_relevant_documents
    async def aretrieve(self, query: str):
        """异步包装同步 retrieve，使用线程池执行以兼容同步实现。"""
        # 延迟导入 asyncio.to_thread 在 Python 3.9+ 可用
        return await asyncio.to_thread(self.retrieve, query)

    async def aget_relevant_documents(self, query: str):
        return await self.aretrieve(query)


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

        self.context_prompt_template = (
            "千星沙箱是一款游戏UGC编辑器，主要通过配置实体、节点图来进行操作，实现交互和逻辑。接下来，请根据给予的文档内容回答问题。\n"
            "相关的文档内容：\n"
            "{context_str}\n"
            "回答时，若需要出现文档未提及的观点，请简单标注"
        )
        
        # 检索查询生成 prompt
        self.query_extraction_prompt = (
            "你是一个知识库检索助手。请分析用户的问题（可能包含图片），提取用于检索的关键词。\n"
            "背景：千星沙箱是一款游戏UGC编辑器，知识库包含实体、节点图、组件、事件等文档。\n\n"
            "要求：\n"
            "1. 识别问题中的核心概念和关键词\n"
            "2. 如果有图片，识别图片中的关键信息（如错误提示、节点名称、配置项等）\n"
            "3. 生成 1-5 个简洁的检索关键词或短语\n"
            "4. 只输出检索词，用空格分隔，不要其他解释\n\n"
            "用户问题：{message}"
        )
    
    def _resolve_llm_config(self, config: Dict[str, Any]) -> Dict[str, str]:
        """解析 LLM 配置，优先使用用户提供的配置，否则使用默认免费模型
        
        Args:
            config: 请求中的 config 对象 {"api_key", "api_base_url", "model", "use_default_model"}
            
        Returns:
            {"api_key", "api_base_url", "model", "channel_id"}
        
        Raises:
            ValueError: 当渠道超出限额时抛出异常
        """
        # 优先级1：use_default_model 为 1, 2, 3, 4 或 5，使用默认免费模型（最高优先级）
        use_default = config.get("use_default_model", 0)
        channel_id = use_default  # 记录渠道ID用于限额检查
        
        if use_default in [1, 2, 3, 4, 5]:
            # 检查限额（仅渠道1、2、5需要检查）
            if use_default in [1, 2, 5]:
                quota_result = model_usage_manager.check_and_increment(use_default)
                if not quota_result["allowed"]:
                    raise ValueError(
                        f"渠道 {use_default} 已达每日限额 {quota_result['limit']} 次，"
                        f"当前使用 {quota_result['usage']} 次，请明天再试或使用其他渠道"
                    )
                print(f"[ChatEngine] 渠道 {use_default} 限额检查通过: "
                      f"使用 {quota_result['usage']}/{quota_result['limit']}, "
                      f"剩余 {quota_result['remaining']} 次")
        
        if use_default == 1:
            # 渠道1：使用原有逻辑
            hour = datetime.now(timezone(timedelta(hours=8))).hour
            model = os.getenv("DEFAULT_FREE_MODEL_NAME", "")
            if 16 <= hour < 24:
                model = os.getenv("DEFAULT_FREE_MODEL_NAME_PEAK", "")
            return {
                "api_key": os.getenv("DEFAULT_FREE_MODEL_KEY", ""),
                "api_base_url": os.getenv("DEFAULT_FREE_MODEL_URL", ""),
                "model": model,
                "channel_id": channel_id
            }
        elif use_default == 2:
            # 渠道2：使用DEFAULT_FREE_MODEL_KEY2/URL2和DEFAULT_FREE_MODEL_NAME2
            return {
                "api_key": os.getenv("DEFAULT_FREE_MODEL_KEY2", ""),
                "api_base_url": os.getenv("DEFAULT_FREE_MODEL_URL2", ""),
                "model": os.getenv("DEFAULT_FREE_MODEL_NAME2", ""),
                "channel_id": channel_id
            }
        elif use_default == 3:
            # 渠道3：使用DEFAULT_FREE_MODEL_KEY2/URL2和DEFAULT_FREE_MODEL_NAME3
            return {
                "api_key": os.getenv("DEFAULT_FREE_MODEL_KEY2", ""),
                "api_base_url": os.getenv("DEFAULT_FREE_MODEL_URL2", ""),
                "model": os.getenv("DEFAULT_FREE_MODEL_NAME3", ""),
                "channel_id": channel_id
            }
        elif use_default == 4:
            # 渠道4：使用DEFAULT_FREE_MODEL_KEY2/URL2和DEFAULT_FREE_MODEL_NAME4
            return {
                "api_key": os.getenv("DEFAULT_FREE_MODEL_KEY2", ""),
                "api_base_url": os.getenv("DEFAULT_FREE_MODEL_URL2", ""),
                "model": os.getenv("DEFAULT_FREE_MODEL_NAME4", ""),
                "channel_id": channel_id
            }
        elif use_default == 5:
            # 渠道5：使用DEFAULT_FREE_MODEL_KEY2/URL2和DEFAULT_FREE_MODEL_NAME5
            return {
                "api_key": os.getenv("DEFAULT_FREE_MODEL_KEY2", ""),
                "api_base_url": os.getenv("DEFAULT_FREE_MODEL_URL2", ""),
                "model": os.getenv("DEFAULT_FREE_MODEL_NAME5", ""),
                "channel_id": channel_id
            }
        
        # 优先级2：用户提供的配置完整（api_key、api_base_url、model 都非空）
        if (config.get("api_key") and config["api_key"].strip() and
            config.get("api_base_url") and config["api_base_url"].strip() and
            config.get("model") and config["model"].strip()):
            return {
                "api_key": config["api_key"],
                "api_base_url": config["api_base_url"],
                "model": config["model"],
                "channel_id": 0  # 用户自定义配置，不限额
            }
        
        # 如果都没有提供，抛出异常
        raise ValueError("未提供有效的 API 配置，请完整配置 API Key、Base URL、Model，或启用默认免费模型")
    
    def _generate_retrieval_query(self, llm, message: str, image_base64: Optional[str] = None) -> str:
        """阶段1：让 LLM 分析用户问题（+图片），生成检索查询
        
        Args:
            llm: LLM 实例
            message: 用户原始问题
            image_base64: 可选的图片数据
            
        Returns:
            生成的检索查询字符串
        """
        prompt_text = self.query_extraction_prompt.format(message=message)
        
        blocks = [TextBlock(text=prompt_text)]
        if image_base64:
            blocks.append(ImageBlock(url=image_base64))
        
        extract_msg = ChatMessage(role=MessageRole.USER, blocks=blocks)
        
        try:
            response = llm.chat([extract_msg])
            extracted_query = response.message.content.strip()
            # 合并原始问题和提取的关键词
            final_query = f"{message} {extracted_query}"
            print(f"[ChatEngine] 检索查询生成: {extracted_query}")
            return final_query
        except Exception as e:
            print(f"[ChatEngine] 检索查询生成失败，使用原始问题: {e}")
            return message
    
    async def _generate_retrieval_query_async(self, llm, message: str, image_base64: Optional[str] = None) -> str:
        """异步版本：让 LLM 分析用户问题（+图片），生成检索查询"""
        prompt_text = self.query_extraction_prompt.format(message=message)
        
        blocks = [TextBlock(text=prompt_text)]
        if image_base64:
            blocks.append(ImageBlock(url=image_base64))
        
        extract_msg = ChatMessage(role=MessageRole.USER, blocks=blocks)
        
        try:
            response = await llm.achat([extract_msg])
            extracted_query = response.message.content.strip()
            final_query = f"{message} {extracted_query}"
            print(f"[ChatEngine Stream] 检索查询生成: {extracted_query}")
            return final_query
        except Exception as e:
            print(f"[ChatEngine Stream] 检索查询生成失败，使用原始问题: {e}")
            return message
    
    def _extract_sources(self, source_nodes) -> List[Dict[str, Any]]:
        """提取来源信息（公共方法），按URL去重
        
        Args:
            source_nodes: 源节点列表
            
        Returns:
            来源信息列表（按URL去重后）
        """
        sources = []
        seen_urls = set()
        
        for node in source_nodes:
            url = node.metadata.get("url", node.metadata.get("sourceURL", node.metadata.get("file_path", "")))
            
            # 按URL去重
            if url and url in seen_urls:
                continue
            if url:
                seen_urls.add(url)
            
            sources.append({
                "title": node.metadata.get("title", node.metadata.get("file_name", "未知文档")),
                "doc_id": node.metadata.get("id", node.metadata.get("doc_id", "")),
                "similarity": round(node.score or 0.0, 2),
                "text_snippet": node.get_text()[:200] + "...",
                "url": url
            })
        
        return sources
    
    def chat(self, message: str, conversation: List[Dict[str, str]], config: Dict[str, str], image_base64: Optional[str] = None) -> Dict[str, Any]:
        """执行对话查询
        
        Args:
            message: 用户问题
            conversation: 对话历史 [{"role": "user|assistant", "content": "..."}]
            config: LLM 配置 {"api_key", "api_base_url", "model", "use_default_model", "context_length"}
            image_base64: 可选的 Base64 编码图片字符串 (data:image/jpeg;base64,...)
        
        Returns:
            {"answer": str, "sources": List[dict], "tokens": int}
        """
        # 1. 解析 LLM 配置
        resolved_config = self._resolve_llm_config(config)
        
        # 2. 获取上下文长度配置
        context_length = config.get("context_length", 3)
        if context_length == 0:
            limited_conversation = []
        elif len(conversation) > context_length * 2:
            limited_conversation = conversation[-(context_length * 2):]
        else:
            limited_conversation = conversation
        
        # 3. 创建 LLM
        llm = OpenAILike(
            api_key=resolved_config["api_key"],
            api_base=resolved_config["api_base_url"],
            model=resolved_config["model"],
            is_chat_model=True
        )
        print(f"[ChatEngine] 使用 LLM 模型: {resolved_config['model']}")
        
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
            # 7. 阶段1：让 LLM 生成检索查询
            retrieval_query = self._generate_retrieval_query(llm, message, image_base64)
            
            # 8. 阶段2：执行检索 - 总共8条，优先7条官方文档，再从user补齐
            similarity_top_k = int(os.getenv("TOP_K", "8"))
            similarity_cutoff = float(os.getenv("SIMILARITY_THRESHOLD", "0.3"))
            
            retriever = CombinedRetriever(
                index=self.rag_engine.index,
                total_k=similarity_top_k,
                doc_max=int(os.getenv("DOC_MAX", "7")),
                bbs_key=os.getenv("BBS_KEY", "source_dir"),
                bbs_value=os.getenv("BBS_VALUE", "user"),
                similarity_cutoff=similarity_cutoff
            )
            nodes = retriever.retrieve(retrieval_query)
            
            # 9. 阶段3：构建 prompt 和消息，让 LLM 根据检索结果回答
            context_str = "\n\n".join([n.get_content() for n in nodes])
            fmt_msg = self.context_prompt_template.format(context_str=context_str) + f"\n\n用户问题：{message}"
            
            blocks = [TextBlock(text=fmt_msg)]
            if image_base64:
                # 使用 url 传递 data URI
                blocks.append(ImageBlock(url=image_base64))
            
            last_msg = ChatMessage(role=MessageRole.USER, blocks=blocks)
            
            # 9. 执行查询 (直接调用 LLM)
            response = llm.chat(chat_history + [last_msg])
            
            # 10. 提取来源
            sources = self._extract_sources(nodes)
            
            # 11. 获取 completion tokens
            completion_tokens = self.token_counter.completion_llm_token_count
            
            result = {
                "answer": response.message.content,
                "sources": sources,
                "tokens": completion_tokens
            }

            # TODO 暂时不支持reasoning_content
            reasoning = None
            # 尝试从 additional_kwargs 获取
            if hasattr(response.message, "additional_kwargs"):
                reasoning = response.message.additional_kwargs.get("reasoning_content")
            
            if reasoning:
                result["reasoning"] = reasoning
            
            return result
        finally:
            # 恢复原来的 callback manager
            LlamaSettings.callback_manager = original_callback_manager
    
    async def chat_stream_async(self, message: str, conversation: List[Dict[str, str]], config: Dict[str, str], image_base64: Optional[str] = None):
        """执行异步流式对话查询（带心跳机制防止超时）"""
        # 1. 解析 LLM 配置
        resolved_config = self._resolve_llm_config(config)
        
        # 2. 获取上下文长度配置
        context_length = config.get("context_length", 1)
        if context_length == 0:
            limited_conversation = []
        elif len(conversation) > context_length * 2:
            limited_conversation = conversation[-(context_length * 2):]
        else:
            limited_conversation = conversation

        # 3. 创建 LLM
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
            
            # 步骤2：阶段1 - 让 LLM 生成检索查询
            yield f"data: {json.dumps({'type': 'status', 'data': '正在分析问题...'}, ensure_ascii=False)}\n\n"
            retrieval_query = await self._generate_retrieval_query_async(llm, message, image_base64)
            yield ": query_generated\n\n"
            
            # 步骤3：阶段2 - 执行检索 - 总共8条，优先7条官方文档，再从user补齐
            similarity_top_k = int(os.getenv("TOP_K", "8"))
            similarity_cutoff = float(os.getenv("SIMILARITY_THRESHOLD", "0.3"))
            
            retriever = CombinedRetriever(
                index=self.rag_engine.index,
                total_k=similarity_top_k,
                doc_max=int(os.getenv("DOC_MAX", "7")),
                bbs_key=os.getenv("BBS_KEY", "id"),
                bbs_value=os.getenv("BBS_VALUE", "bbs-faq"),
                similarity_cutoff=similarity_cutoff
            )
            
            # 使用 LLM 生成的查询进行检索
            nodes = await asyncio.to_thread(retriever.retrieve, retrieval_query)
            
            # 完成后立即发送心跳
            yield ": retrieval_done\n\n"
            
            # 步骤4：发送来源信息
            sources = self._extract_sources(nodes)
            yield f"data: {json.dumps({'type': 'sources', 'data': sources}, ensure_ascii=False)}\n\n"
            yield ": sources_sent\n\n"
            
            # 步骤5：阶段3 - 构建 prompt 和消息，让 LLM 根据检索结果回答
            context_str = "\n\n".join([n.get_content() for n in nodes])
            fmt_msg = self.context_prompt_template.format(context_str=context_str) + f"\n\n用户问题：{message}"
            
            blocks = [TextBlock(text=fmt_msg)]
            if image_base64:
                blocks.append(ImageBlock(url=image_base64))
                print("[ChatEngine Stream] 已加载图片数据")
            
            last_msg = ChatMessage(role=MessageRole.USER, blocks=blocks)
            
            # 步骤6：流式发送文本
            stream_gen = await llm.astream_chat(chat_history + [last_msg])
            
            chunk_count = 0
            async for response_chunk in stream_gen:
                # response_chunk 是 ChatResponseChunk，包含 delta
                content = response_chunk.delta
                
                if content:
                    yield f"data: {json.dumps({'type': 'token', 'data': content}, ensure_ascii=False)}\n\n"
                
                chunk_count += 1
                if chunk_count % 10 == 0:
                    yield ": generating\n\n"
            
            # 步骤7：发送完成信号
            completion_tokens = self.token_counter.completion_llm_token_count
            yield f"data: {json.dumps({'type': 'done', 'data': {'tokens': completion_tokens}}, ensure_ascii=False)}\n\n"
            yield ": completed\n\n"
            
        except Exception as e:
            # 发送错误信息
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)}, ensure_ascii=False)}\n\n"
            
        finally:
            # 恢复原来的 callback manager
            LlamaSettings.callback_manager = original_callback_manager
