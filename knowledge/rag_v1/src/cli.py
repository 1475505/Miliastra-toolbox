"""
命令行工具
"""
import click
import sys
from .api import get_rag_api


def _print_source(source, index):
    """打印检索来源。"""
    click.echo(f"{index}. {source.get('title', 'N/A')}")

    h1_title = source.get('h1_title')
    if h1_title:
        click.echo(f"   章节: {h1_title}")

    doc_id = source.get('doc_id')
    if doc_id:
        click.echo(f"   文档ID: {doc_id}")

    url = source.get('url')
    if url:
        click.echo(f"   URL: {url}")

    crawled_at = source.get('crawledAt')
    if crawled_at:
        click.echo(f"   CrawledAt: {crawled_at}")

    chunk_index = source.get('chunk_index')
    if chunk_index is not None:
        subchunk_index = source.get('subchunk_index')
        subchunk_count = source.get('subchunk_count')
        if subchunk_index is not None and subchunk_count not in (None, 1):
            click.echo(f"   Chunk: {chunk_index}.{subchunk_index}/{subchunk_count}")
        else:
            click.echo(f"   Chunk: {chunk_index}")

    click.echo(f"   相似度: {source.get('similarity', 0.0):.3f}")
    click.echo(f"   片段: {source.get('text_snippet', 'N/A')}")
    click.echo("-" * 20)

@click.group()
def cli():
    """RAG原子能力应用命令行工具"""
    pass

@cli.command()
@click.option('--force', '-f', is_flag=True, help='清空集合并重新嵌入所有文档')
@click.option('--source-dirs', '-d', multiple=True, help='指定要处理的源目录，可多次使用')
def init(force, source_dirs):
    """初始化或更新知识库（支持增量更新）"""
    if force:
        click.echo("🚀 强制模式：将清空集合并重新嵌入所有文档...")
    else:
        click.echo("🚀 开始处理知识库（增量模式）...")
    
    api = get_rag_api()
    
    source_directories = list(source_dirs) if source_dirs else None
    
    result = api.init_knowledge_base(
        force_rebuild=force,
        source_directories=source_directories
    )

    if result["success"]:
        data = result.get('data', {})
        summary = data.get('summary', {})
        
        click.echo("\n✅ 知识库处理完成!")
        click.echo(f"\n📊 处理摘要:")
        click.echo(f"  - 总文档数: {summary.get('total_documents', 0)}")
        click.echo(f"  - 已处理: {summary.get('processed', 0)}")
        click.echo(f"  - 已更新: {summary.get('updated', 0)}")
        click.echo(f"  - 已跳过: {summary.get('skipped', 0)}")
        click.echo(f"  - 失败: {summary.get('errors', 0)}")
        
        stats = data.get('stats', {})
        click.echo(f"\n📈 知识库状态:")
        click.echo(f"  - 总节点数: {stats.get('total_documents', 0)}")
    else:
        click.echo(f"❌ 处理失败: {result.get('message', '未知错误')}")
        sys.exit(1)

@cli.command()
@click.argument('question')
def retrieve(question):
    """检索相关文档（不生成答案）"""
    click.echo(f"🔍 检索: {question}")
    api = get_rag_api()

    result = api.retrieve(question=question)

    if not result.get("success"):
        click.echo(f"❌ 检索失败: {result.get('message', '未知错误')}")
        sys.exit(1)

    data = result.get("data", {})

    click.echo("\n📖 相关来源:")
    if data.get("sources"):
        for i, source in enumerate(data["sources"], 1):
            _print_source(source, i)
    else:
        click.echo("未找到相关来源。")

@cli.command()
@click.argument('question')
def query(question):
    """执行RAG查询"""
    click.echo(f"🔍 查询: {question}")
    api = get_rag_api()

    result = api.query(question=question)

    if not result.get("success"):
        click.echo(f"❌ 查询失败: {result.get('message', '未知错误')}")
        sys.exit(1)

    data = result.get("data", {})

    if data.get("answer"):
        click.echo("\n💡 答案:")
        click.echo(data["answer"])

    click.echo("\n📖 相关来源:")
    if data.get("sources"):
        for i, source in enumerate(data["sources"], 1):
            _print_source(source, i)
    else:
        click.echo("未找到相关来源。")

@cli.command()
def status():
    """查看知识库状态"""
    click.echo("📊 检查知识库状态...")
    api = get_rag_api()
    result = api.get_knowledge_base_status()

    if result.get("success"):
        data = result.get("data", {})
        click.echo(f"  - 总文档数: {data.get('total_documents', 0)}")
        click.echo(f"  - 集合名称: {data.get('collection_name', 'N/A')}")
        click.echo(f"  - 存储路径: {data.get('persist_directory', 'N/A')}")
    else:
        click.echo(f"❌ 获取状态失败: {result.get('message', '未知错误')}")
        sys.exit(1)

@cli.command()
@click.argument('doc_id')
def check(doc_id):
    """检查文档ID是否已经嵌入到知识库"""
    click.echo(f"🔍 检查文档ID: {doc_id}")
    api = get_rag_api()
    result = api.check_document(doc_id)

    if not result.get("success"):
        click.echo(f"❌ 检查失败: {result.get('message', '未知错误')}")
        sys.exit(1)

    data = result.get("data", {})
    exists = data.get("exists", False)

    if exists:
        click.echo(f"✅ 文档ID '{doc_id}' 已存在于知识库中")
    else:
        click.echo(f"❌ 文档ID '{doc_id}' 不存在于知识库中")

@cli.command()
@click.option('--doc', '-d', 'doc_path', required=True, help='文档文件路径')
@click.option('--force', '-f', is_flag=True, help='强制重新嵌入（忽略文档元数据的force标签）')
def embed(doc_path, force):
    """嵌入单个文档到知识库"""
    click.echo(f"📄 准备嵌入文档: {doc_path}")
    if force:
        click.echo("⚠️  强制模式：将忽略文档元数据的force标签")
    
    api = get_rag_api()
    result = api.embed_document(doc_path, force)

    if not result.get("success"):
        click.echo(f"❌ 嵌入失败: {result.get('message', '未知错误')}")
        sys.exit(1)

    data = result.get("data", {})
    status = data.get("status")
    doc_id = data.get("doc_id", "N/A")
    doc_title = data.get("doc_title", "N/A")
    reason = data.get("reason", "")

    if status == "success":
        nodes_count = data.get("nodes_count", 0)
        click.echo(f"✅ 文档嵌入成功!")
        click.echo(f"  - 文档ID: {doc_id}")
        click.echo(f"  - 标题: {doc_title}")
        click.echo(f"  - 节点数: {nodes_count}")
        click.echo(f"  - 原因: {reason}")
    elif status == "skipped":
        click.echo(f"⏭️  文档已跳过")
        click.echo(f"  - 文档ID: {doc_id}")
        click.echo(f"  - 标题: {doc_title}")
        click.echo(f"  - 原因: {reason}")
    else:
        click.echo(f"❌ 处理失败: {data.get('message', '未知错误')}")
        sys.exit(1)

if __name__ == '__main__':
    cli()