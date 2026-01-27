"""
配置管理模块
"""

import os
from typing import Optional, List
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

class Config:
    """应用配置类"""
    
    # OpenAI API 配置
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    
    # ChromaDB 配置（嵌入式模式）
    CHROMA_COLLECTION_NAME: str = os.getenv("CHROMA_COLLECTION_NAME", "guide_docs")
    
    # 应用配置
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    # RAG 配置 - 针对中文技术文档优化（按一级标题分块）
    TOP_K: int = int(os.getenv("TOP_K", "5"))  # 增加检索结果数量，获取更丰富上下文
    SIMILARITY_THRESHOLD: float = float(os.getenv("SIMILARITY_THRESHOLD", "0.3"))  # 降低阈值，适合技术概念检索
    MAX_CHUNK_SIZE: int = int(os.getenv("MAX_CHUNK_SIZE", "2048"))  # 增大chunk_size以保持一级标题内容完整性
    CHUNK_OVERLAP: int = int(os.getenv("CHUNK_OVERLAP", "200"))  # 增加重叠以保持上下文连贯性
    USE_H1_ONLY: bool = os.getenv("USE_H1_ONLY", "True").lower() == "true"  # 只按一级标题分块

    # 混合检索配置
    RAG_STRATEGY: str = os.getenv("RAG_STRATEGY", "vector")  # 检索策略: "vector" 或 "hybrid"
    FUSION_MODE: str = os.getenv("FUSION_MODE", "reciprocal_rank")  # 融合模式: "reciprocal_rank" 或 "relative_score"
    VECTOR_TOP_K: int = int(os.getenv("VECTOR_TOP_K", "5"))  # 向量检索的top_k
    BM25_TOP_K: int = int(os.getenv("BM25_TOP_K", "5"))  # BM25检索的top_k
    
    # 模型配置
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3")  # 嵌入模型，默认BAAI/bge-m3
    CHAT_MODEL: str = os.getenv("CHAT_MODEL", "gpt-3.5-turbo")  # 对话模型，默认gpt-3.5-turbo
    
    # 文档路径配置 - 指向knowledge/下的多个目录
    KNOWLEDGE_ROOT_PATH: str = os.path.join(os.path.dirname(__file__), "..", "..", "..", "knowledge")
    GUIDE_DOCS_PATH: str = os.path.join(KNOWLEDGE_ROOT_PATH, "guide")
    TUTORIAL_DOCS_PATH: str = os.path.join(KNOWLEDGE_ROOT_PATH, "tutorial")
    OFFICIAL_FAQ_DOCS_PATH: str = os.path.join(KNOWLEDGE_ROOT_PATH, "official_faq")
    
    # 支持的所有知识源目录列表
    KNOWLEDGE_SOURCE_DIRS: List[str] = [
        GUIDE_DOCS_PATH,
        TUTORIAL_DOCS_PATH,
        OFFICIAL_FAQ_DOCS_PATH
    ]
    
    KNOWLEDGE_BASE_PATH: str = os.path.join(os.path.dirname(__file__), "..", "db")
    
    @classmethod
    def validate(cls) -> bool:
        """验证配置是否正确"""
        if not cls.OPENAI_API_KEY:
            raise ValueError("请设置 OPENAI_API_KEY 环境变量")
        return True
    

# 全局配置实例
config = Config()