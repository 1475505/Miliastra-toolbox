"""
原子能力API接口
"""
# 抑制 transformers 库的框架警告（必须在其他导入之前）
import os
os.environ['TRANSFORMERS_NO_ADVISORY_WARNINGS'] = '1'

import logging
from typing import List, Dict, Any, Optional
from .rag_engine import create_rag_engine
from .db import get_collection_stats
from .config import config

class RAGAPI:
    """RAG原子能力API"""

    def __init__(self):
        self.rag_engine = create_rag_engine()
        # 配置根日志记录器
        logging.basicConfig(
            level=getattr(logging, config.LOG_LEVEL.upper(), logging.INFO),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        # 创建专门的logger
        self.logger = logging.getLogger(__name__)
        # 设置logger的级别
        self.logger.setLevel(getattr(logging, config.LOG_LEVEL.upper(), logging.INFO))

    def init_knowledge_base(
        self,
        force_rebuild: bool = False,
        source_directories: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        初始化或重建知识库。
        """
        try:
            result = self.rag_engine.build_knowledge_base(
                force_rebuild=force_rebuild,
                source_directories=source_directories
            )
            return {"success": True, "data": result}
        except Exception as e:
            self.logger.error(f"初始化知识库失败: {e}", exc_info=True)
            return {"success": False, "message": str(e)}

    def retrieve(
        self,
        question: str
    ) -> Dict[str, Any]:
        """
        检索相关文档（不生成答案）。
        """
        try:
            result = self.rag_engine.retrieve(question)
            return {"success": True, "data": result}
        except Exception as e:
            self.logger.error(f"检索失败: {e}", exc_info=True)
            return {"success": False, "message": str(e)}

    def query_llm(
        self,
        question: str,
        context_nodes: List
    ) -> Dict[str, Any]:
        """
        使用 LLM 生成答案。
        """
        try:
            answer = self.rag_engine.query_llm(question, context_nodes)
            return {"success": True, "data": {"question": question, "answer": answer}}
        except Exception as e:
            self.logger.error(f"LLM 生成答案失败: {e}", exc_info=True)
            return {"success": False, "message": str(e)}

    def query(
        self,
        question: str
    ) -> Dict[str, Any]:
        """
        执行查询（检索+LLM生成答案）。
        """
        try:
            result = self.rag_engine.query(question)
            return {"success": True, "data": result}
        except Exception as e:
            self.logger.error(f"查询失败: {e}", exc_info=True)
            return {"success": False, "message": str(e)}

    def batch_query(
        self,
        questions: List[str],
        include_answer: bool = True
    ) -> Dict[str, Any]:
        """
        批量查询。
        """
        try:
            results = [self.rag_engine.query(q, include_answer) for q in questions]
            return {"success": True, "data": {"results": results, "total": len(results)}}
        except Exception as e:
            self.logger.error(f"批量查询失败: {e}", exc_info=True)
            return {"success": False, "message": str(e)}

    def get_knowledge_base_status(self) -> Dict[str, Any]:
        """
        获取知识库状态。
        """
        try:
            stats = get_collection_stats(config.KNOWLEDGE_BASE_PATH, config.CHROMA_COLLECTION_NAME)
            stats["collection_name"] = config.CHROMA_COLLECTION_NAME
            stats["persist_directory"] = config.KNOWLEDGE_BASE_PATH
            return {"success": True, "data": stats}
        except Exception as e:
            self.logger.error(f"获取知识库状态失败: {e}", exc_info=True)
            return {"success": False, "message": str(e)}
    
    def check_document(self, doc_id: str) -> Dict[str, Any]:
        """
        检查文档ID是否已经嵌入到知识库。
        
        Args:
            doc_id: 文档ID
            
        Returns:
            包含检查结果的字典
        """
        try:
            from .db import check_document_exists
            exists = check_document_exists(
                config.KNOWLEDGE_BASE_PATH,
                config.CHROMA_COLLECTION_NAME,
                doc_id
            )
            return {
                "success": True,
                "data": {
                    "doc_id": doc_id,
                    "exists": exists
                }
            }
        except Exception as e:
            self.logger.error(f"检查文档失败: {e}", exc_info=True)
            return {"success": False, "message": str(e)}
    
    def embed_document(
        self,
        file_path: str,
        force: bool = False
    ) -> Dict[str, Any]:
        """
        嵌入单个文档到知识库。
        
        Args:
            file_path: 文档文件路径
            force: 是否强制重新嵌入
            
        Returns:
            包含操作结果的字典
        """
        try:
            result = self.rag_engine.embed_single_document(file_path, force)
            return {"success": True, "data": result}
        except Exception as e:
            self.logger.error(f"嵌入文档失败: {e}", exc_info=True)
            return {"success": False, "message": str(e)}

_api_instance: Optional[RAGAPI] = None

def get_rag_api() -> RAGAPI:
    """获取RAG API的单例。"""
    global _api_instance
    if _api_instance is None:
        _api_instance = RAGAPI()
    return _api_instance