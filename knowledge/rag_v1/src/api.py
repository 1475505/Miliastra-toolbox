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
        logging.basicConfig(level=config.LOG_LEVEL)
        self.logger = logging.getLogger(__name__)

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

    def query(
        self,
        question: str,
        include_answer: bool = True
    ) -> Dict[str, Any]:
        """
        执行查询（可选择是否生成答案）。
        """
        try:
            result = self.rag_engine.query(question, include_answer=include_answer)
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

_api_instance: Optional[RAGAPI] = None

def get_rag_api() -> RAGAPI:
    """获取RAG API的单例。"""
    global _api_instance
    if _api_instance is None:
        _api_instance = RAGAPI()
    return _api_instance