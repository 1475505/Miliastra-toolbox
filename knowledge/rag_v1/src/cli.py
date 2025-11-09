"""
命令行工具
"""
import click
import sys
from .api import get_rag_api

@click.group()
def cli():
    """RAG原子能力应用命令行工具"""
    pass

@cli.command()
@click.option('--force', '-f', is_flag=True, help='强制重建知识库')
@click.option('--source-dirs', '-d', multiple=True, help='指定要处理的源目录，可多次使用')
def init(force, source_dirs):
    """初始化或重建知识库"""
    click.echo("🚀 开始初始化RAG知识库...")
    api = get_rag_api()
    
    source_directories = list(source_dirs) if source_dirs else None
    
    result = api.init_knowledge_base(
        force_rebuild=force,
        source_directories=source_directories
    )

    if result["success"]:
        click.echo("✅ 知识库处理成功!")
        click.echo(f"📊 状态: {result['data']}")
    else:
        click.echo(f"❌ 初始化失败: {result.get('message', '未知错误')}")
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
            click.echo(f"{i}. {source.get('title', 'N/A')}")
            click.echo(f"   相似度: {source.get('similarity', 0.0):.3f}")
            click.echo(f"   片段: {source.get('text_snippet', 'N/A')}")
            click.echo("-" * 20)
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
            click.echo(f"{i}. {source.get('title', 'N/A')}")
            click.echo(f"   相似度: {source.get('similarity', 0.0):.3f}")
            click.echo(f"   片段: {source.get('text_snippet', 'N/A')}")
            click.echo("-" * 20)
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

if __name__ == '__main__':
    cli()