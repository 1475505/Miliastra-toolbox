"""
RAG引擎核心模块
"""
import logging
from typing import List, Dict, Any, Optional
import tiktoken

from .config import config
from .parser import DocumentParser
from .db import get_storage_context, get_vector_store_index, clear_collection, get_collection_stats

from llama_index.core import Settings as LlamaSettings
from llama_index.core.schema import Document
from llama_index.core.query_engine import BaseQueryEngine
from llama_index.core.retrievers import BaseRetriever
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai_like import OpenAILike
from llama_index.core.base.embeddings.base import BaseEmbedding
from llama_index.retrievers.bm25 import BM25Retriever
from llama_index.core.retrievers import QueryFusionRetriever
from llama_index.core.callbacks import CallbackManager, TokenCountingHandler

class RAGStrategy:
    VECTOR = "vector"
    HYBRID = "hybrid"

class FusionMode:
    RECIPROCAL_RANK = "reciprocal_rerank"
    RELATIVE_SCORE = "relative_score"

class RAGEngine:
    """RAG搜索引擎"""

    def __init__(self):
        config.validate()
        # 配置日志（如果还没有配置）
        if not logging.getLogger().handlers:
            logging.basicConfig(
                level=getattr(logging, config.LOG_LEVEL.upper(), logging.INFO),
                format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )

        self._setup_services()
        self.parser = DocumentParser(
            chunk_size=config.MAX_CHUNK_SIZE,
            chunk_overlap=config.CHUNK_OVERLAP,
            use_h1_only=config.USE_H1_ONLY
        )
        self.storage_context = get_storage_context(
            persist_dir=config.KNOWLEDGE_BASE_PATH,
            collection_name=config.CHROMA_COLLECTION_NAME
        )
        self.index = self._load_index()
        self.documents = []  # 保存文档节点，用于BM25检索
        self.query_engine = self._create_query_engine()
        
        # 初始化 token 计数器
        # 使用通用的 cl100k_base encoding，适用于所有模型
        self.token_counter = TokenCountingHandler(
            tokenizer=tiktoken.get_encoding("cl100k_base").encode,
            verbose=False
        )
        
        logging.info("RAG引擎初始化完成")

    def _setup_services(self):
        """配置LlamaIndex的LLM和嵌入模型"""
        # 配置嵌入模型
        LlamaSettings.embed_model = OpenAIEmbedding(
            api_key=config.OPENAI_API_KEY,
            api_base=config.OPENAI_BASE_URL,
            model_name=config.EMBEDDING_MODEL,
            embed_batch_size=32
        )
        # 配置 LLM（使用 OpenAILike 支持自定义模型）
        LlamaSettings.llm = OpenAILike(
            api_key=config.OPENAI_API_KEY,
            api_base=config.OPENAI_BASE_URL,
            model=config.CHAT_MODEL,
            is_chat_model=True
        )

    def _load_index(self):
        """加载向量索引"""
        stats = get_collection_stats(config.KNOWLEDGE_BASE_PATH, config.CHROMA_COLLECTION_NAME)
        if stats.get("total_documents", 0) > 0:
            logging.info("从现有存储加载索引...")
            return get_vector_store_index(self.storage_context, embed_model=LlamaSettings.embed_model)
        logging.info("未找到现有索引。")
        return None

    def build_knowledge_base(self, force_rebuild: bool = False, source_directories: Optional[List[str]] = None):
        """
        构建知识库，支持增量更新。
        
        Args:
            force_rebuild: 如果为 True，强制重新嵌入所有文档（忽略文档 frontmatter 的 force 标签）
            source_directories: 要处理的源目录列表
            
        Returns:
            包含处理结果的字典
        """
        from .db import check_document_exists, delete_document_by_id
        
        source_dirs = source_directories or config.KNOWLEDGE_SOURCE_DIRS
        
        # 加载所有文档
        all_documents = []
        for directory in source_dirs:
            logging.info(f"加载目录: {directory}")
            docs = self.parser.load_documents(directory)
            all_documents.extend(docs)
        
        if not all_documents:
            logging.error("在指定目录中未找到可处理的文档。")
            return {"status": "error", "message": "未找到文档。"}
        
        logging.info(f"共加载 {len(all_documents)} 个文档")
        
        # 确保索引已初始化
        self._ensure_index_initialized()
        
        # 统计信息
        processed_count = 0
        skipped_count = 0
        updated_count = 0
        error_count = 0
        
        # 逐个文档处理（复用通用方法）
        for doc in all_documents:
            try:
                result = self._process_document_embedding(doc, force=force_rebuild)
                
                if result["status"] == "success":
                    processed_count += 1
                    if result.get("updated"):
                        updated_count += 1
                elif result["status"] == "skipped":
                    skipped_count += 1
                else:
                    error_count += 1
                    
            except Exception as e:
                logging.error(f"❌ 处理文档失败: {e}", exc_info=True)
                error_count += 1
                continue
        
        # 更新查询引擎
        self.query_engine = self._create_query_engine()
        
        # 返回统计信息
        stats = get_collection_stats(config.KNOWLEDGE_BASE_PATH, config.CHROMA_COLLECTION_NAME)
        
        result = {
            "status": "success",
            "stats": stats,
            "summary": {
                "total_documents": len(all_documents),
                "processed": processed_count,
                "skipped": skipped_count,
                "updated": updated_count,
                "errors": error_count
            }
        }
        
        logging.info(f"\n{'='*60}")
        logging.info(f"知识库构建完成！")
        logging.info(f"  总文档数: {len(all_documents)}")
        logging.info(f"  已处理: {processed_count} ({updated_count} 个更新)")
        logging.info(f"  已跳过: {skipped_count}")
        logging.info(f"  失败: {error_count}")
        logging.info(f"  知识库总节点数: {stats.get('total_documents', 0)}")
        logging.info(f"{'='*60}\n")
        
        return result
    
    def _ensure_index_initialized(self):
        """确保索引已初始化"""
        if not self.index:
            logging.info("索引未初始化，正在创建新索引...")
            self.index = get_vector_store_index(
                self.storage_context,
                embed_model=LlamaSettings.embed_model
            )
    
    def _insert_nodes(self, nodes: List):
        """插入节点到索引并更新查询引擎"""
        self._ensure_index_initialized()
        self.index.insert_nodes(nodes)
        self.documents.extend(nodes)
        self.query_engine = self._create_query_engine()
    
    def _process_document_embedding(self, document: Document, force: bool = False) -> Dict[str, Any]:
        """
        通用的文档嵌入处理逻辑（支持增量更新）。
        
        Args:
            document: 要处理的文档
            force: 是否强制重新嵌入（忽略文档 frontmatter 的 force 标签）
            
        Returns:
            包含处理结果的字典
        """
        from .db import check_document_exists, delete_document_by_id
        
        doc_id = document.doc_id
        doc_title = document.metadata.get('title', doc_id)
        
        # 检查文档是否已存在
        exists = check_document_exists(
            config.KNOWLEDGE_BASE_PATH,
            config.CHROMA_COLLECTION_NAME,
            doc_id
        )
        
        # 决定是否需要处理
        should_process = False
        reason = ""
        
        if force:
            # 命令行指定了 force，强制重新嵌入
            should_process = True
            reason = "命令行指定--force参数"
        elif not exists:
            # 文档不存在，需要嵌入
            should_process = True
            reason = "文档不存在于知识库"
        else:
            # 文档已存在，检查元数据中的 force 标签
            doc_force = document.metadata.get('force', False)
            if doc_force:
                should_process = True
                reason = "文档元数据force=true"
            else:
                should_process = False
                reason = "文档已存在且force=false"
        
        if not should_process:
            logging.info(f"跳过文档: {doc_title} ({doc_id}) - {reason}")
            return {
                "status": "skipped",
                "doc_id": doc_id,
                "doc_title": doc_title,
                "reason": reason,
                "updated": False
            }
        
        # 如果文档已存在且需要重新嵌入，先删除旧数据
        if exists:
            logging.info(f"删除旧数据: {doc_title} ({doc_id})")
            deleted_count = delete_document_by_id(
                config.KNOWLEDGE_BASE_PATH,
                config.CHROMA_COLLECTION_NAME,
                doc_id
            )
            logging.info(f"已删除 {deleted_count} 个节点")
        
        # 解析文档为节点
        nodes = self.parser.parse_documents([document])
        
        if not nodes:
            logging.warning(f"文档解析后没有生成节点: {doc_title}")
            return {
                "status": "error",
                "doc_id": doc_id,
                "doc_title": doc_title,
                "message": "文档解析后没有生成节点",
                "updated": False
            }
        
        # 插入节点到索引（复用通用方法）
        logging.info(f"嵌入文档: {doc_title} ({doc_id}) - 共 {len(nodes)} 个节点")
        self._insert_nodes(nodes)
        
        logging.info(f"文档嵌入成功: {doc_title} ({doc_id})")
        
        return {
            "status": "success",
            "doc_id": doc_id,
            "doc_title": doc_title,
            "nodes_count": len(nodes),
            "reason": reason,
            "updated": exists  # 是否是更新操作
        }
    
    def embed_single_document(self, file_path: str, force: bool = False) -> Dict[str, Any]:
        """
        嵌入单个文档到知识库。
        
        Args:
            file_path: 文档文件路径
            force: 是否强制重新嵌入（忽略文档中的force标签）
            
        Returns:
            包含操作结果的字典
        """
        import os
        
        try:
            # 验证文件路径
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"文件不存在: {file_path}")
            
            if not file_path.endswith('.md'):
                raise ValueError(f"只支持.md文件: {file_path}")
            
            # 使用统一的加载逻辑：加载文件所在目录，然后过滤出目标文档
            documents = self.parser.load_documents(os.path.dirname(file_path))
            document = next((d for d in documents if d.metadata.get('file_path') == file_path), None)
            
            if not document:
                raise ValueError(f"无法加载文档: {file_path}")
            
            # 复用通用的文档嵌入逻辑
            return self._process_document_embedding(document, force=force)
            
        except Exception as e:
            logging.error(f"嵌入文档失败: {e}", exc_info=True)
            return {
                "status": "error",
                "message": str(e)
            }

    def _create_query_engine(self) -> Optional[BaseQueryEngine]:
        """根据配置创建查询引擎"""
        if not self.index:
            logging.warning("索引未加载，无法创建查询引擎。")
            return None

        # 根据配置选择检索策略
        if config.RAG_STRATEGY == RAGStrategy.HYBRID:
            return self._create_hybrid_query_engine()
        else:
            # 默认使用向量检索，添加相似度阈值过滤
            return self.index.as_query_engine(
                similarity_top_k=config.TOP_K,
                similarity_cutoff=config.SIMILARITY_THRESHOLD
            )

    def _create_hybrid_query_engine(self) -> Optional[BaseQueryEngine]:
        """创建混合检索查询引擎"""
        if not self.index:
            logging.warning("索引未加载，无法创建混合查询引擎。")
            return None

        if not self.documents:
            logging.warning("文档节点未加载，无法创建混合查询引擎。")
            return None

        try:
            # 创建向量检索器
            vector_retriever = self.index.as_retriever(
                similarity_top_k=config.VECTOR_TOP_K,
                similarity_cutoff=config.SIMILARITY_THRESHOLD
            )

            # 创建BM25检索器
            bm25_retriever = BM25Retriever.from_defaults(
                documents=self.documents,
                similarity_top_k=config.BM25_TOP_K
            )

            # 创建混合检索器
            hybrid_retriever = QueryFusionRetriever(
                retrievers=[vector_retriever, bm25_retriever],
                similarity_top_k=config.TOP_K,
                mode=config.FUSION_MODE,
                num_queries=1  # 不进行查询扩展，只使用原始查询
            )

            # 基于混合检索器创建查询引擎
            from llama_index.core.query_engine import RetrieverQueryEngine
            query_engine = RetrieverQueryEngine.from_args(
                retriever=hybrid_retriever
            )

            logging.info(f"混合检索查询引擎创建成功，融合模式: {config.FUSION_MODE}")
            return query_engine

        except Exception as e:
            logging.error(f"创建混合检索查询引擎失败: {e}")
            logging.info("回退到向量检索模式")
            return self.index.as_query_engine(
                similarity_top_k=config.TOP_K,
                similarity_cutoff=config.SIMILARITY_THRESHOLD
            )
    def retrieve(
        self,
        question: str,
        embed_model: Optional[BaseEmbedding] = None
    ) -> Dict[str, Any]:
        """
        检索相关文档（不生成答案）

        Args:
            question: 查询问题
            embed_model: 可选的嵌入模型，如果不提供则使用默认配置

        Returns:
            包含检索结果的字典
        """
        if not self.index:
            return self._format_error_response(question, "索引未初始化。请先构建知识库。")

        # 使用提供的嵌入模型或默认配置
        retriever_embed_model = embed_model if embed_model is not None else LlamaSettings.embed_model

        logging.info(f"开始检索: {question}")

        # 创建向量检索器
        retriever = self.index.as_retriever(
            similarity_top_k=config.TOP_K,
            similarity_cutoff=config.SIMILARITY_THRESHOLD,
            embed_model=retriever_embed_model
        )

        nodes = retriever.retrieve(question)
        
        logging.info(f"检索完成，找到 {len(nodes)} 个相关文档")

        return self._format_response(question, "仅检索", nodes)

    def query_llm(
        self,
        question: str,
        context_nodes: List,
        llm: Optional[OpenAILike] = None
    ) -> Dict[str, Any]:
        """
        使用 LLM 生成答案

        Args:
            question: 查询问题
            context_nodes: 检索到的文档节点
            llm: 可选的 LLM 模型，如果不提供则使用默认配置

        Returns:
            LLM 生成的答案
        """
        from llama_index.core.response_synthesizers import get_response_synthesizer

        # 使用提供的 LLM 或默认 LLM
        target_llm = llm if llm is not None else LlamaSettings.llm

        # 重置 token 计数器
        self.token_counter.reset_counts()
        
        # 临时设置全局 callback manager
        original_callback_manager = LlamaSettings.callback_manager
        LlamaSettings.callback_manager = CallbackManager([self.token_counter])
        
        try:
            # 创建响应合成器，使用 simple_summarize 模式避免多轮调用
            # simple_summarize: 将所有上下文一次性传给 LLM，只调用一次
            synthesizer = get_response_synthesizer(
                response_mode="simple_summarize",
                llm=target_llm
            )

            # 合成响应
            response = synthesizer.synthesize(
                query=question,
                nodes=context_nodes
            )

            answer = response.response if hasattr(response, 'response') else str(response)

            # 只获取 completion tokens（LLM 输出的 token 数量）
            completion_tokens = self.token_counter.completion_llm_token_count
            
            logging.info(f"LLM 响应生成完成，completion tokens: {completion_tokens}")

            return {
                "answer": answer,
                "tokens": completion_tokens,  # 只返回输出的 tokens
                "response": response
            }
        finally:
            # 恢复原来的 callback manager
            LlamaSettings.callback_manager = original_callback_manager

    def query(
        self,
        question: str,
        include_answer: bool = True,
        embed_model: Optional[BaseEmbedding] = None,
        llm: Optional[OpenAILike] = None
    ) -> Dict[str, Any]:
        """
        执行查询（检索+可选的 LLM 生成答案）

        Args:
            question: 查询问题
            include_answer: 是否生成答案
            embed_model: 可选的嵌入模型
            llm: 可选的 LLM 模型

        Returns:
            包含答案和来源的字典
        """
        if not self.index:
            return self._format_error_response(question, "索引未初始化。请先构建知识库。")

        # 使用提供的嵌入模型或默认配置
        retriever_embed_model = embed_model if embed_model is not None else LlamaSettings.embed_model

        logging.info(f"开始查询: {question}")

        # 创建检索器
        retriever = self.index.as_retriever(
            similarity_top_k=config.TOP_K,
            similarity_cutoff=config.SIMILARITY_THRESHOLD,
            embed_model=retriever_embed_model
        )

        # 检索相关文档
        nodes = retriever.retrieve(question)
        
        logging.info(f"检索完成，找到 {len(nodes)} 个相关文档")

        # 如果不需要答案，只返回检索结果
        if not include_answer:
            return self._format_response(
                question, 
                "仅检索", 
                nodes
            )

        # 使用 LLM 生成答案
        logging.info("开始生成答案...")
        llm_result = self.query_llm(question, nodes, llm)
        answer = llm_result["answer"]
        completion_tokens = llm_result.get("tokens", 0)  # tokens 就是 completion_tokens
        logging.info("答案生成完成")

        return self._format_response(
            question, 
            answer, 
            nodes, 
            completion_tokens=completion_tokens
        )

    def _format_response(
        self,
        question: str,
        answer: str,
        source_nodes,
        completion_tokens: int = 0,
        response=None
    ) -> Dict[str, Any]:
        """格式化最终的响应"""
        sources = []
        if source_nodes:
            for node in source_nodes:
                sources.append({
                    "title": node.metadata.get("file_name", "未知文档"),
                    "doc_id": node.metadata.get("doc_id", ""),
                    "similarity": node.score or 0.0,
                    "text_snippet": node.get_text()[:200] + "..."
                })

        return {
            "question": question,
            "answer": answer,
            "sources": sources,
            "stats": {
                "search_results": len(sources),
                "answer_generated": bool(answer != "仅检索"),
                "completion_tokens": completion_tokens,  # LLM 输出的 token 数量
            }
        }

    def _format_error_response(self, question: str, error_message: str) -> Dict[str, Any]:
        """格式化错误响应"""
        return {
            "question": question,
            "answer": error_message,
            "sources": [],
            "stats": {"error": error_message}
        }

def create_rag_engine() -> RAGEngine:
    return RAGEngine()