"""
Miliastra 知识库 MCP Server

提供四个工具：
1. get_node_info    - 按节点名称查询节点说明（模糊匹配，支持批量）
2. list_documents   - 列出文档标题和路径（可选模糊过滤）
3. get_document     - 按文档标题获取完整文档内容（模糊匹配）
4. rag_search       - 知识库向量检索（直接查询 ChromaDB）
"""

import argparse
import sys
from pathlib import Path
from typing import Literal

from mcp.server.fastmcp import FastMCP

TOOLBOX_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = TOOLBOX_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from skill.service import get_document_json, get_node_info_json, list_documents_json, rag_search_json


# ── MCP Server ──────────────────────────────────────────────
mcp = FastMCP(
    name="miliastra-knowledge",
    instructions="千星沙箱（Miliastra）知识库工具集，提供节点查询、文档列表、文档获取、RAG 检索四种能力。",
    host="0.0.0.0",
    port=8818,
)


@mcp.tool(
    name="get_node_info",
    description=(
        "根据节点名称查询节点说明和所在文档信息。支持模糊匹配、批量查询。"
        "输入一个或多个节点名称，返回每个节点的说明内容和来源文档信息。"
    ),
)
def get_node_info(names: list[str]) -> str:
    return get_node_info_json(names)


@mcp.tool(
    name="list_documents",
    description=(
        "列出知识库中的文档标题和路径。支持批量关键词过滤。"
        "传入一个或多个关键词时，逐个返回各关键词的匹配结果；"
        "不传关键词（空列表）时返回全部文档列表。用于浏览可用文档或确认文档名称。"
    ),
)
def list_documents(keywords: list[str] = []) -> str:
    return list_documents_json(keywords)


@mcp.tool(
    name="get_document",
    description=(
        "根据文档标题获取完整的文档内容（official/ 目录）。支持模糊匹配、批量查询。"
        "同时按同关键词查找节点信息，若命中则一并返回 related_nodes。"
    ),
)
def get_document(titles: list[str]) -> str:
    return get_document_json(titles)


@mcp.tool(
    name="rag_search",
    description=(
        "使用向量检索在知识库中搜索相关内容。支持批量查询。"
        "适用于不确定具体节点或文档名称时的语义搜索。"
        "返回相关文档片段和相似度分数。"
    ),
)
def rag_search(queries: list[str], top_k: int = 5) -> str:
    return rag_search_json(queries, top_k=top_k)


# ── 入口 ────────────────────────────────────────────────────
def _parse_transport() -> Literal["stdio", "sse", "streamable-http"]:
    parser = argparse.ArgumentParser(description="Miliastra Knowledge MCP Server")
    parser.add_argument("--transport", choices=["stdio", "sse", "streamable-http"],
                        default="streamable-http")
    parser.add_argument("--port", type=int, default=8818)
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()
    mcp.settings.host = args.host
    mcp.settings.port = args.port
    return args.transport


if __name__ == "__main__":
    mcp.run(transport=_parse_transport())
