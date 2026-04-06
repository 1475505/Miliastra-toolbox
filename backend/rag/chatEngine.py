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
from common.llm_config import resolve_llm_config


class CombinedRetriever:
    """基于名额分配的优先级检索器，通过 rag_engine.retrieve_nodes() 执行两阶段召回：

    Phase 1 (preferred): 召回 official 目录下的官方文档，最多 doc_max 条
    Phase 2 (non_preferred): 召回 bbs/user 目录下的用户内容，补齐至 total_k 条

    合并顺序: 先放 non_preferred，再放 preferred，按 node_id 去重。
    效果: 官方文档占主要名额(doc_max)，用户内容补齐剩余。
    注意: 若 doc_max 接近 total_k，bbs/user 名额会减少；运行时以环境变量 TOP_K/DOC_MAX 为准。

    数据库 source_dir 与 Miliastra-knowledge 目录对应关系:
        official/guide/    → source_dir="guide"
        official/tutorial/ → source_dir="tutorial"
        official/faq/      → source_dir="faq" 或 "official_faq"
        bbs/               → source_dir="bbs"
        user/              → source_dir="user"
    """

    # 官方文档的 source_dir 白名单（对应 Miliastra-knowledge/official/ 下的子目录）
    OFFICIAL_SOURCE_DIRS = ["guide", "tutorial", "faq", "official_faq"]

    def __init__(self, rag_engine, total_k: int = 5, doc_max: int = 4, similarity_cutoff: float = None):
        self.rag_engine = rag_engine
        self.total_k = int(total_k)
        self.doc_max = int(doc_max)
        self.similarity_cutoff = similarity_cutoff

    def retrieve(self, query: str):
        total_k = max(self.total_k, 0)
        preferred_k = max(min(self.doc_max, total_k), 0)

        preferred_nodes = []
        non_preferred_nodes = []

        # Phase 1: 官方文档 (source_dir IN official 白名单)
        try:
            preferred_filters = MetadataFilters(
                filters=[MetadataFilter(key="source_dir", value=self.OFFICIAL_SOURCE_DIRS, operator=FilterOperator.IN)]
            )
            preferred_nodes = list(self.rag_engine.retrieve_nodes(
                query,
                filters=preferred_filters,
                top_k=max(preferred_k, 4) if preferred_k > 0 else 4,
                similarity_cutoff=self.similarity_cutoff,
            ))
        except Exception:
            preferred_nodes = []

        # Phase 2: 用户内容 (source_dir NOT IN official 白名单，即 bbs/user 等)
        non_preferred_k = total_k - len(preferred_nodes)
        try:
            non_preferred_filters = MetadataFilters(
                filters=[MetadataFilter(key="source_dir", value=self.OFFICIAL_SOURCE_DIRS, operator=FilterOperator.NIN)]
            )
            non_preferred_nodes = list(self.rag_engine.retrieve_nodes(
                query,
                filters=non_preferred_filters,
                top_k=max(non_preferred_k, 1),
                similarity_cutoff=self.similarity_cutoff,
            ))
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

    # 异步适配
    async def aretrieve(self, query: str):
        return await asyncio.to_thread(self.retrieve, query)


class ChatEngine:
    """轻量级对话引擎"""

    NON_STREAM_OUTPUT_INSTRUCTION = (
        "请直接使用纯文本作答，避免使用 Markdown 标题、列表、表格、代码块或其他格式化语法。"
    )
    
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
            "你是千星沙箱知识库问答助手。千星沙箱是一款游戏 UGC 编辑器，主要通过实体、组件和节点图来实现功能与逻辑。\n"
            "请严格根据给定的知识库片段回答用户问题，不要把未检索到的信息当成已知事实。\n"
            "如果上下文可以直接回答，就先给出简洁结论，再补充依据、步骤、参数或注意事项。\n"
            "如果用户问的是实现思路、排障方法或方案比较，请只总结文档中能够支撑的部分；超出文档的延伸内容必须明确标注为“推测”或“建议”。\n"
            "如果上下文信息不足、表述冲突，或无法支持明确结论，请直接说明“知识库片段不足以确认”，并指出最相关的已知信息，不要编造节点、参数、限制或官方规则。\n"
            "回答时尽量保留文档中的术语、节点名、组件名、参数名、报错文本和配置项原文，不要随意改写专有名词。\n"
            "相关的文档内容：\n"
            "{context_str}"
        )
        
        # 检索查询生成 prompt
        self.query_extraction_prompt = (
            "你是一个面向知识库召回的检索词生成助手。请根据用户问题（可能包含图片）生成最适合检索千星沙箱文档的关键词。\n"
            "背景：知识库主要包含实体、组件、节点图、节点名称、参数说明、教程、FAQ、排障经验等中文文档。\n\n"
            "生成规则：\n"
            "1. 优先提取高价值术语：节点名、组件名、系统名、功能名、参数名、报错文本、配置项、目标效果。\n"
            "   示例术语可参考知识库中的真实文档主题：碰撞与交互、角色设置、镜头设置、基础运动、特效、界面控件、阵营设置、技能设置、定时器、自定义变量、信号通信、投射运动器、小地图标识、命中与受击、背包、货币与商店。\n"
            "2. 如果用户表达口语化、笼统或不知道准确名称，请改写成更像文档标题或节点术语的关键词。\n"
            "   例如把“怎么让角色能攻击”改写为“角色 攻击”，把“怎么买卖道具”改写为“货币与商店 背包 道具”。\n"
            "3. 如果问题是在问“怎么实现某效果”，同时提取“目标效果”和“可能相关的机制词”，例如事件、触发、检测、位移、特效、同步、变量。\n"
            "   例如“做一个会掉奖励的怪物”可以提取为“命中与受击 掉落物 道具 背包 事件”。\n"
            "4. 如果有图片，优先提取图片中的错误提示、节点名称、组件名称、按钮文字、配置字段、数字或英文标识。\n"
            "5. 保留关键专有名词的原文；必要时可补充 1 个最可能的同义检索词，但不要堆砌泛词。\n"
            "6. 避免输出“怎么”“为什么”“问题”“这个”“那个”“使用方法”这类低信息词。\n"
            "7. 输出 2-6 个简洁关键词或短语；如果问题本身非常明确，也可以更少。\n"
            "8. 只输出检索词，用空格分隔，不要输出句子、标点、编号或解释。\n\n"
            "用户问题：{message}"
        )
    
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

    def _build_context_prompt(self, context_str: str, plain_text_output: bool = False) -> str:
        prompt = self.context_prompt_template.format(context_str=context_str)
        if plain_text_output:
            prompt = f"{prompt}\n{self.NON_STREAM_OUTPUT_INSTRUCTION}"
        return prompt
    
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
        resolved_config = resolve_llm_config(config)
        
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
            
            # 8. 阶段2：执行检索（TOP_K/DOC_MAX 由环境变量覆盖默认值）
            similarity_top_k = int(os.getenv("TOP_K", "12"))
            similarity_cutoff = float(os.getenv("SIMILARITY_THRESHOLD", "0.3"))
            
            retriever = CombinedRetriever(
                rag_engine=self.rag_engine,
                total_k=similarity_top_k,
                doc_max=int(os.getenv("DOC_MAX", "8")),
                similarity_cutoff=similarity_cutoff
            )
            nodes = retriever.retrieve(retrieval_query)
            node_ids = [nd.node_id[:12] for nd in nodes]
            print(f"[ChatEngine] 召回 {len(nodes)} 条, ids={node_ids}")
            
            # 9. 阶段3：构建 prompt 和消息，让 LLM 根据检索结果回答
            context_str = "\n\n".join([n.get_content() for n in nodes])
            fmt_msg = self._build_context_prompt(context_str, plain_text_output=True) + f"\n\n用户问题：{message}"
            
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
        resolved_config = resolve_llm_config(config)
        
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
            
            # 步骤1.5：发送对话引擎就绪状态
            yield ": chat_engine_created\n\n"
            
            # 步骤2：阶段1 - 让 LLM 生成检索查询
            yield f"data: {json.dumps({'type': 'status', 'data': '正在分析问题...'}, ensure_ascii=False)}\n\n"
            retrieval_query = await self._generate_retrieval_query_async(llm, message, image_base64)
            yield ": query_generated\n\n"
            
            # 步骤3：阶段2 - 执行检索（TOP_K/DOC_MAX 由环境变量覆盖默认值）
            similarity_top_k = int(os.getenv("TOP_K", "12"))
            similarity_cutoff = float(os.getenv("SIMILARITY_THRESHOLD", "0.3"))
            
            retriever = CombinedRetriever(
                rag_engine=self.rag_engine,
                total_k=similarity_top_k,
                doc_max=int(os.getenv("DOC_MAX", "8")),
                similarity_cutoff=similarity_cutoff
            )
            
            # 使用 LLM 生成的查询进行检索
            nodes = await asyncio.to_thread(retriever.retrieve, retrieval_query)
            node_ids = [nd.node_id[:12] for nd in nodes]
            print(f"[ChatEngine Stream] 召回 {len(nodes)} 条, ids={node_ids}")
            
            # 完成后立即发送心跳
            yield ": retrieval_done\n\n"
            
            # 步骤4：发送来源信息
            sources = self._extract_sources(nodes)
            yield f"data: {json.dumps({'type': 'sources', 'data': sources}, ensure_ascii=False)}\n\n"
            yield ": sources_sent\n\n"
            
            # 步骤5：阶段3 - 构建 prompt 和消息，让 LLM 根据检索结果回答
            context_str = "\n\n".join([n.get_content() for n in nodes])
            fmt_msg = self._build_context_prompt(context_str, plain_text_output=False) + f"\n\n用户问题：{message}"
            
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
