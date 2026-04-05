import os
import argparse
import shutil
from dotenv import load_dotenv
from src.parser import DocumentParser
from src.api import get_rag_api
from src.config import config

def run_parse_test(doc_path: str):
    """测试单个文档的分块功能"""
    print(f"==============\n▶️  Running Parse Test: {doc_path}\n==============")
    if not os.path.exists(doc_path):
        print(f"❌ FAILED: Document not found at '{doc_path}'")
        return

    parser = DocumentParser(
        chunk_size=config.MAX_CHUNK_SIZE,
        chunk_overlap=config.CHUNK_OVERLAP,
        use_h1_only=config.USE_H1_ONLY
    )
    
    docs = parser.load_documents(os.path.dirname(doc_path))
    # 找到我们关心的那一个文档
    abs_doc_path = os.path.abspath(doc_path)
    target_doc = next((d for d in docs if os.path.abspath(d.metadata.get("file_path")) == abs_doc_path), None)

    if not target_doc:
        print(f"❌ FAILED: Could not load the specific document from its directory.")
        return

    nodes = parser.parse_documents([target_doc])

    print(f"✅ Document parsed into {len(nodes)} chunks.\n")
    for i, node in enumerate(nodes):
        print(f"--- Chunk {i+1} (Length: {len(node.get_text())}) ---")
        print(node.get_text())
        print("-" * 20 + "\n")

def run_retrieve_test(keyword: str):
    """测试纯检索功能（只使用嵌入模型，不初始化 LLM）"""
    print(f"==============\n▶️  Running Retrieve Test with keyword '{keyword}'\n==============")
    
    # 检查知识库是否存在
    from src.db import get_collection_stats, get_storage_context, get_vector_store_index
    stats = get_collection_stats(config.KNOWLEDGE_BASE_PATH, config.CHROMA_COLLECTION_NAME)
    
    if stats.get("total_documents", 0) == 0:
        print("❌ 知识库未初始化或为空！")
        print("\n请先运行以下命令添加文档：")
        print("  python3 test_rag.py embed --doc /path/to/document.md")
        print("\n或批量初始化：")
        print("  python3 rag_cli.py init")
        return
    
    print(f"✅ 知识库已加载，共 {stats['total_documents']} 个文档\n")
    
    try:
        from llama_index.embeddings.openai import OpenAIEmbedding
        
        # 只配置嵌入模型（不需要 LLM）
        embed_model = OpenAIEmbedding(
            api_key=config.OPENAI_API_KEY,
            api_base=config.OPENAI_BASE_URL,
            model_name=config.EMBEDDING_MODEL,
            embed_batch_size=32
        )
        
        # 加载索引
        storage_context = get_storage_context(
            persist_dir=config.KNOWLEDGE_BASE_PATH,
            collection_name=config.CHROMA_COLLECTION_NAME
        )
        index = get_vector_store_index(storage_context, embed_model=embed_model)
        
        # 创建检索器（不需要 LLM）
        retriever = index.as_retriever(similarity_top_k=config.TOP_K)
        
        # 执行检索
        nodes = retriever.retrieve(keyword)
        
        print(f"✅ Found {len(nodes)} sources.")
        for i, node in enumerate(nodes, 1):
            print(f"\n--- Source {i} (Similarity: {node.score:.3f}) ---")
            print(f"Title: {node.metadata.get('title', node.metadata.get('file_name', '未知'))}")
            print(f"Doc ID: {node.ref_doc_id or 'N/A'}")
            print(f"H1 Title: {node.metadata.get('h1_title', 'N/A')}")
            print(f"Chunk: {node.metadata.get('chunk_index', 'N/A')}")
            print(f"Subchunk: {node.metadata.get('subchunk_index', 'N/A')}/{node.metadata.get('subchunk_count', 'N/A')}")
            text = node.get_text()
            print(f"Snippet: {text[:200]}...")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

def run_query_test(question: str):
    """测试完整查询功能，使用现有知识库"""
    print(f"==============\n▶️  Running Query Test with question '{question}'\n==============")

    # 检查知识库是否存在
    from src.db import get_collection_stats
    stats = get_collection_stats(config.KNOWLEDGE_BASE_PATH, config.CHROMA_COLLECTION_NAME)
    
    if stats.get("total_documents", 0) == 0:
        print("❌ 知识库未初始化或为空！")
        print("\n请先运行以下命令初始化知识库：")
        print("  python3 rag_cli.py init")
        print("\n或使用 embed 命令测试单个文档：")
        print("  python3 test_rag.py embed --doc /path/to/document.md")
        return
    
    print(f"✅ 知识库已加载，共 {stats['total_documents']} 个文档\n")

    try:
        api = get_rag_api()
        
        result = api.query(question=question, include_answer=True)
        
        if not result.get("success"):
            print("❌ FAILED: Full query failed.")
            print(f"Error: {result.get('error', 'Unknown error')}")
            return
            
        data = result.get("data", {})
        print(f"\n💡 Answer:\n{data.get('answer')}")
        print("\n📚 Sources:")
        for i, source in enumerate(data.get('sources', []), 1):
            print(f"  - Source {i}: {source.get('title')} (Similarity: {source.get('similarity', 0.0):.3f})")
    except Exception as e:
        print(f"❌ Error: {e}")

def run_embed_test(doc_path: str):
    """测试单个文档的嵌入和元数据验证，数据保存到正式知识库"""
    print(f"==============\n▶️  Running Embed Test: {doc_path}\n==============")
    
    if not os.path.exists(doc_path):
        print(f"❌ FAILED: Document not found at '{doc_path}'")
        return
    
    print(f"📦 Using production database: {config.KNOWLEDGE_BASE_PATH}\n")
    
    try:
        # 1. 解析文档
        parser = DocumentParser(
            chunk_size=config.MAX_CHUNK_SIZE,
            chunk_overlap=config.CHUNK_OVERLAP,
            use_h1_only=config.USE_H1_ONLY
        )
        
        docs = parser.load_documents(os.path.dirname(doc_path))
        abs_doc_path = os.path.abspath(doc_path)
        target_doc = next((d for d in docs if os.path.abspath(d.metadata.get("file_path")) == abs_doc_path), None)
        
        if not target_doc:
            print(f"❌ FAILED: Could not load the specific document.")
            return
        
        print(f"✅ Document loaded successfully.\n")
        print(f"📋 Original Document Metadata (from YAML frontmatter):")
        for key, value in target_doc.metadata.items():
            print(f"  - {key}: {value}")
        
        # 2. 解析为节点
        nodes = parser.parse_documents([target_doc])
        print(f"\n✅ Document parsed into {len(nodes)} chunks.\n")
        
        # 3. 显示第一个节点的详细信息
        if nodes:
            first_node = nodes[0]
            print(f"{'=' * 80}")
            print(f"📄 First Chunk Details")
            print(f"{'=' * 80}")
            print(f"\n📋 Node Metadata:")
            for key, value in first_node.metadata.items():
                print(f"  - {key}: {value}")
            
            print(f"\n📝 Node Text (first 300 chars):")
            print(f"{'-' * 80}")
            text = first_node.get_text()
            print(text[:300] + "..." if len(text) > 300 else text)
            print(f"{'-' * 80}")
        
        # 4. 创建向量索引并保存到数据库
        print(f"\n{'=' * 80}")
        print(f"🔄 Creating vector index and saving to database...")
        print(f"{'=' * 80}\n")
        
        from llama_index.core import Settings as LlamaSettings
        from llama_index.embeddings.openai import OpenAIEmbedding
        from src.db import get_storage_context, get_vector_store_index
        
        # 配置嵌入模型（只需要嵌入，不需要 LLM）
        embed_model = OpenAIEmbedding(
            api_key=config.OPENAI_API_KEY,
            api_base=config.OPENAI_BASE_URL,
            model_name=config.EMBEDDING_MODEL,
            embed_batch_size=32
        )
        
        # 获取存储上下文
        storage_context = get_storage_context(
            persist_dir=config.KNOWLEDGE_BASE_PATH,
            collection_name=config.CHROMA_COLLECTION_NAME
        )
        
        # 创建或获取索引
        index = get_vector_store_index(storage_context, embed_model=embed_model)
        
        # 插入节点
        index.insert_nodes(nodes)
        
        print(f"✅ Successfully embedded and saved {len(nodes)} chunks to database.")
        
        # 5. 直接查询数据库验证数据和元数据
        print(f"\n{'=' * 80}")
        print(f"🔍 Querying database directly to verify data...")
        print(f"{'=' * 80}\n")
        
        from src.db import get_collection_data, get_collection_stats
        
        # 先检查统计信息
        stats = get_collection_stats(config.KNOWLEDGE_BASE_PATH, config.CHROMA_COLLECTION_NAME)
        print(f"📊 Database Statistics:")
        print(f"  - Total documents in DB: {stats.get('total_documents', 0)}")
        
        if stats.get('total_documents', 0) == 0:
            print("\n⚠️  Warning: No documents found in database. Data may not have been persisted correctly.")
            print(f"💾 Data should be persisted to: {config.KNOWLEDGE_BASE_PATH}")
            return
        
        # 查询数据库内容
        db_data = get_collection_data(config.KNOWLEDGE_BASE_PATH, config.CHROMA_COLLECTION_NAME, limit=min(len(nodes), 10))
        
        if 'error' in db_data:
            print(f"❌ Error querying database: {db_data['error']}")
        else:
            print(f"  - Documents retrieved: {db_data['count']}")
            print(f"  - Has embeddings: {db_data['has_embeddings']}")
            
            # 显示第一个文档的详细信息
            if db_data['count'] > 0:
                print(f"\n{'=' * 80}")
                print(f"📄 First Document in Database")
                print(f"{'=' * 80}")
                print(f"\nDocument ID: {db_data['ids'][0]}")
                
                print(f"\n📋 Stored Metadata:")
                for key, value in db_data['metadatas'][0].items():
                    # 截断过长的值
                    display_value = str(value)
                    if len(display_value) > 100:
                        display_value = display_value[:100] + "..."
                    print(f"  - {key}: {display_value}")
                
                print(f"\n📝 Stored Text (first 300 chars):")
                print(f"{'-' * 80}")
                doc_text = db_data['documents'][0]
                print(doc_text[:300] + "..." if len(doc_text) > 300 else doc_text)
                print(f"{'-' * 80}")
                
                # 验证关键元数据字段
                print(f"\n✅ Metadata Verification:")
                metadata = db_data['metadatas'][0]
                checks = [
                    ("YAML 'id' field", 'id' in metadata),
                    ("YAML 'title' field", 'title' in metadata),
                    ("YAML 'url' field", 'url' in metadata),
                    ("One-level heading 'h1_title'", 'h1_title' in metadata),
                    ("Chunk index", 'chunk_index' in metadata),
                    ("Subchunk index", 'subchunk_index' in metadata),
                    ("Subchunk count", 'subchunk_count' in metadata),
                    ("File name", 'file_name' in metadata),
                ]
                
                for check_name, check_result in checks:
                    status = "✓" if check_result else "✗"
                    print(f"  {status} {check_name}")
        
        print(f"\n✨ Embed test completed successfully!\n")
        
        print(f"\n💾 Data persisted to: {config.KNOWLEDGE_BASE_PATH}")
        
    except Exception as e:
        print(f"❌ Error during embed test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
    
    default_doc = os.path.join(config.GUIDE_DOCS_PATH, 'mh0pppib5eyc_小地图标识.md')

    parser = argparse.ArgumentParser(description="RAG Pipeline Debugging Tool")
    subparsers = parser.add_subparsers(dest='command', required=True)

    # Parser command
    parse_parser = subparsers.add_parser('parse', help='Test document chunking.')
    parse_parser.add_argument('--doc', type=str, default=default_doc, help='Path to the document to parse.')

    # Retrieve command
    retrieve_parser = subparsers.add_parser('retrieve', help='Test keyword retrieval using existing knowledge base.')
    retrieve_parser.add_argument('keyword', type=str, help='Keyword to retrieve.')
    
    # Query command
    query_parser = subparsers.add_parser('query', help='Test full RAG query using existing knowledge base.')
    query_parser.add_argument('question', type=str, help='Question to ask.')
    
    # Embed command
    embed_parser = subparsers.add_parser('embed', help='Test embedding and metadata verification (saves to production DB).')
    embed_parser.add_argument('--doc', type=str, default=default_doc, help='Path to the document to embed.')

    args = parser.parse_args()

    if args.command == 'parse':
        run_parse_test(args.doc)
    elif args.command == 'retrieve':
        run_retrieve_test(args.keyword)
    elif args.command == 'query':
        run_query_test(args.question)
    elif args.command == 'embed':
        run_embed_test(args.doc)