"""
知识库存储模块。
"""
from typing import Optional
import chromadb
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.core import StorageContext, VectorStoreIndex, Settings
from llama_index.core.embeddings import BaseEmbedding

from .config import config

def get_storage_context(persist_dir: str, collection_name: str) -> StorageContext:
    """
    获取或创建StorageContext。
    确保collection在使用前已正确创建。
    """
    db = chromadb.PersistentClient(path=persist_dir)
    
    # 先尝试获取collection，如果不存在则创建
    try:
        chroma_collection = db.get_collection(collection_name)
    except Exception:
        # Collection不存在，创建新的
        chroma_collection = db.create_collection(collection_name)
    
    vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
    return StorageContext.from_defaults(vector_store=vector_store)

def get_vector_store_index(
    storage_context: StorageContext,
    embed_model: Optional[BaseEmbedding] = None
) -> VectorStoreIndex:
    """
    从StorageContext获取VectorStoreIndex。
    如果embed_model提供了，则Settings会被临时修改。

    Args:
        storage_context (StorageContext): 存储上下文。
        embed_model (Optional[BaseEmbedding]): 嵌入模型。

    Returns:
        VectorStoreIndex: 向量存储索引。
    """
    original_embed_model = Settings.embed_model
    try:
        if embed_model:
            Settings.embed_model = embed_model
        # 从存储上下文加载索引
        index = VectorStoreIndex.from_vector_store(
            vector_store=storage_context.vector_store,
        )
    finally:
        # 恢复原始嵌入模型
        Settings.embed_model = original_embed_model
    return index

def clear_collection(persist_dir: str, collection_name: str):
    """
    清空指定的集合。
    """
    db = chromadb.PersistentClient(path=persist_dir)
    # 这将删除集合及其所有数据
    db.delete_collection(name=collection_name)

def get_collection_stats(persist_dir: str, collection_name: str) -> dict:
    """
    获取集合的统计信息。
    """
    try:
        db = chromadb.PersistentClient(path=persist_dir)
        # 使用get_or_create_collection确保collection存在
        collection = db.get_or_create_collection(name=collection_name)
        count = collection.count()
        return {"total_documents": count}
    except Exception as e:
        # 如果集合不存在或其他错误，返回0
        return {"total_documents": 0}

def get_collection_data(persist_dir: str, collection_name: str, limit: int = 10) -> dict:
    """
    直接从数据库获取集合数据，包括文档和元数据。
    
    Args:
        persist_dir: 数据库目录
        collection_name: 集合名称
        limit: 返回的最大文档数量
        
    Returns:
        包含文档ID、文本和元数据的字典
    """
    try:
        db = chromadb.PersistentClient(path=persist_dir)
        collection = db.get_collection(name=collection_name)
        
        # 获取集合中的数据
        results = collection.get(
            limit=limit,
            include=['documents', 'metadatas', 'embeddings']
        )
        
        return {
            "count": len(results['ids']),
            "ids": results['ids'],
            "documents": results['documents'],
            "metadatas": results['metadatas'],
            "has_embeddings": results['embeddings'] is not None
        }
    except Exception as e:
        return {"error": str(e), "count": 0}