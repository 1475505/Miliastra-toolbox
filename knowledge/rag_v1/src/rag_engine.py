"""
RAG引擎核心模块
"""
import logging
from typing import List, Dict, Any, Optional

from .config import config
from .parser import DocumentParser
from .db import get_storage_context, get_vector_store_index, clear_collection, get_collection_stats

from llama_index.core import Settings as LlamaSettings
from llama_index.core.query_engine import BaseQueryEngine
from llama_index.core.retrievers import BaseRetriever
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai_like import OpenAILike
from llama_index.retrievers.bm25 import BM25Retriever
from llama_index.core.retrievers import QueryFusionRetriever

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
        if self.index and not force_rebuild:
            logging.warning("知识库已存在。使用 'force_rebuild=True' 强制重建。")
            return {"status": "skipped", "reason": "知识库已存在。"}

        if force_rebuild:
            logging.info("强制重建：清空现有集合...")
            clear_collection(config.KNOWLEDGE_BASE_PATH, config.CHROMA_COLLECTION_NAME)
            self.index = None
            self.documents = []  # 清空文档节点
            # 重新创建 storage_context 以确保使用新的 collection
            self.storage_context = get_storage_context(
                persist_dir=config.KNOWLEDGE_BASE_PATH,
                collection_name=config.CHROMA_COLLECTION_NAME
            )

        source_dirs = source_directories or config.KNOWLEDGE_SOURCE_DIRS
        all_nodes = []
        for directory in source_dirs:
            logging.info(f"解析目录: {directory}")
            nodes = self.parser.load_and_parse(directory)
            all_nodes.extend(nodes)

        if not all_nodes:
            logging.error("在指定目录中未找到可处理的文档。")
            return {"status": "error", "message": "未找到文档。"}

        logging.info(f"开始构建新索引，共 {len(all_nodes)} 个节点...")
        self.index = get_vector_store_index(self.storage_context, embed_model=LlamaSettings.embed_model)
        self.index.insert_nodes(all_nodes)

        # 保存文档节点用于BM25检索
        self.documents = all_nodes

        # 索引持久化由ChromaDB自动处理
        self.query_engine = self._create_query_engine()
        logging.info("知识库构建成功并且查询引擎已更新。")

        stats = get_collection_stats(config.KNOWLEDGE_BASE_PATH, config.CHROMA_COLLECTION_NAME)
        return {"status": "success", "stats": stats}

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
                retriever=hybrid_retriever,
                llm=LlamaSettings.llm
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
    
    def query(self, question: str, include_answer: bool = True) -> Dict[str, Any]:
        if not self.query_engine:
            return self._format_error_response(question, "查询引擎未初始化。请先构建知识库。")

        if not include_answer:
            # 只检索，不生成答案
            nodes = self.query_engine.retrieve(question)
            return self._format_response(question, "仅检索", nodes)

        response = self.query_engine.query(question)
        return self._format_response(question, response.response, response.source_nodes)

    def _format_response(self, question: str, answer: str, source_nodes) -> Dict[str, Any]:
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