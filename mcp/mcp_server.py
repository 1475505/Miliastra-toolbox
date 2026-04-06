"""
Miliastra 知识库 MCP Server

提供四个工具：
1. get_node_info    - 按节点名称查询节点说明（模糊匹配，支持批量）
2. list_documents   - 列出文档标题和路径（可选模糊过滤）
3. get_document     - 按文档标题获取完整文档内容（模糊匹配）
4. rag_search       - 知识库向量检索（直接查询 ChromaDB）
"""

import argparse
import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

import chromadb
import httpx
from mcp.server.fastmcp import FastMCP

# ── 路径常量 ────────────────────────────────────────────────
TOOLBOX_DIR = Path(__file__).resolve().parent.parent
KNOWLEDGE_DIR = TOOLBOX_DIR / "knowledge" / "Miliastra-knowledge"
DERIVED_DIR = KNOWLEDGE_DIR / "derived"
NODE_DIR = DERIVED_DIR / "node"
INDEX_PATH = DERIVED_DIR / "index.json"
OFFICIAL_DIR = KNOWLEDGE_DIR / "official"
RAG_DB_DIR = TOOLBOX_DIR / "knowledge" / "rag_v1" / "db"
RAG_ENV_PATH = TOOLBOX_DIR / "knowledge" / "rag_v1" / ".env"

_SEPARATOR = "___"


# ── 带缓存的数据加载 ────────────────────────────────────────
@lru_cache(maxsize=1)
def _load_index() -> tuple[dict[str, str], ...]:
    data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    return tuple(data.get("entries", []))


@lru_cache(maxsize=1)
def _load_rag_env() -> tuple[tuple[str, str], ...]:
    pairs: list[tuple[str, str]] = []
    if RAG_ENV_PATH.exists():
        for line in RAG_ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                pairs.append((k.strip(), v.strip()))
    return tuple(pairs)


@lru_cache(maxsize=1)
def _load_node_chunks() -> dict[str, dict[str, str]]:
    cache: dict[str, dict[str, str]] = {}
    for md_file in sorted(NODE_DIR.glob("*.md")):
        cache[md_file.name] = _parse_chunks_from_md(md_file)
    return cache


# ── 工具函数 ────────────────────────────────────────────────
def _fuzzy_match(query: str, target: str) -> bool:
    q, t = query.lower(), target.lower()
    if q in t:
        return True
    qi = 0
    for ch in t:
        if qi < len(q) and ch == q[qi]:
            qi += 1
    return qi == len(q)


def _parse_chunks_from_md(file_path: Path) -> dict[str, str]:
    text = file_path.read_text(encoding="utf-8")
    chunks: dict[str, str] = {}
    title = ""
    lines: list[str] = []
    for line in text.splitlines():
        if line.strip() == _SEPARATOR:
            if title:
                chunks[title] = "\n".join(lines).strip()
            title, lines = "", []
        elif line.startswith("# ") and not lines:
            title = line[2:].strip()
        elif title:
            lines.append(line)
    if title:
        chunks[title] = "\n".join(lines).strip()
    return chunks


def _extract_title(md_file: Path) -> str:
    try:
        text = md_file.read_text(encoding="utf-8")
    except Exception:
        return md_file.stem
    if not text.startswith("---\n"):
        return md_file.stem
    parts = text.split("\n---\n", 1)
    if len(parts) != 2:
        return md_file.stem
    for line in parts[0].splitlines()[1:]:
        if line.startswith("title:"):
            return line.split(":", 1)[1].strip()
    return md_file.stem


def _lookup_node_matches(name: str) -> list[dict[str, str]]:
    entries = _load_index()
    chunk_cache = _load_node_chunks()
    matched: list[dict[str, str]] = []
    for entry in entries:
        if "node/" not in entry.get("output_file", ""):
            continue
        if not _fuzzy_match(name, entry["title"]):
            continue
        md_name = Path(entry["output_file"]).name
        content = chunk_cache.get(md_name, {}).get(entry["title"], "")
        matched.append({
            "title": entry["title"],
            "main_title": entry["main_title"],
            "source_doc_title": entry["source_doc_title"],
            "local_path": entry["local_path"],
            "output_file": entry["output_file"],
            "content": content,
        })
    return matched


def _get_query_embedding(text: str, env: dict[str, str]) -> list[float]:
    api_key = env.get("OPENAI_API_KEY", "")
    base_url = env.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = env.get("EMBEDDING_MODEL", "BAAI/bge-m3")
    resp = httpx.post(
        f"{base_url}/embeddings",
        headers={"Authorization": f"Bearer {api_key}"},
        json={"model": model, "input": text},
        timeout=30.0,
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


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
    """
    Args:
        names: 要查询的节点名称列表，支持模糊匹配。
    """
    results: list[dict[str, str | list[dict[str, str]]]] = []
    for name in names:
        matched = _lookup_node_matches(name)
        if matched:
            results.append({"query": name, "matches": matched})
        else:
            results.append({"query": name, "matches": [], "message": f"未找到匹配「{name}」的节点"})
    return json.dumps(results, ensure_ascii=False, indent=2)


@mcp.tool(
    name="list_documents",
    description=(
        "列出知识库中的文档标题和路径。支持批量关键词过滤。"
        "传入一个或多个关键词时，逐个返回各关键词的匹配结果；"
        "不传关键词（空列表）时返回全部文档列表。用于浏览可用文档或确认文档名称。"
    ),
)
def list_documents(keywords: list[str] = []) -> str:
    """
    Args:
        keywords: 可选的过滤关键词列表，支持模糊匹配。为空时返回全部文档。
    """
    candidates: list[dict[str, str]] = []
    for md_file in sorted(OFFICIAL_DIR.rglob("*.md")):
        if md_file.name.lower() in ("readme.md", "category.md"):
            continue
        doc_title = _extract_title(md_file)
        rel_path = md_file.relative_to(KNOWLEDGE_DIR).as_posix()
        candidates.append({"title": doc_title, "file": rel_path})

    if not keywords:
        return json.dumps({
            "total": len(candidates),
            "documents": candidates,
        }, ensure_ascii=False, indent=2)

    results: list[dict[str, str | int | list[dict[str, str]]]] = []
    for keyword in keywords:
        filtered = [c for c in candidates
                    if _fuzzy_match(keyword, c["title"]) or _fuzzy_match(keyword, Path(c["file"]).stem)]
        results.append({
            "keyword": keyword,
            "total": len(filtered),
            "documents": filtered,
        })
    return json.dumps(results, ensure_ascii=False, indent=2)


@mcp.tool(
    name="get_document",
    description=(
        "根据文档标题获取完整的文档内容（official/ 目录）。支持模糊匹配、批量查询。"
        "同时按同关键词查找节点信息，若命中则一并返回 related_nodes。"
    ),
)
def get_document(titles: list[str]) -> str:
    """
    Args:
        titles: 文档标题或文件名关键词列表，支持模糊匹配，可批量传入。
    """
    candidates: list[tuple[str, Path]] = []
    for md_file in sorted(OFFICIAL_DIR.rglob("*.md")):
        if md_file.name.lower() in ("readme.md", "category.md"):
            continue
        candidates.append((_extract_title(md_file), md_file))

    results: list[dict[str, str | list[dict[str, str | list[dict[str, str]]]]]] = []
    for title in titles:
        related_nodes = _lookup_node_matches(title)

        matched: list[dict[str, str | list[dict[str, str]]]] = []
        for doc_title, md_file in candidates:
            if _fuzzy_match(title, doc_title) or _fuzzy_match(title, md_file.stem):
                matched.append({
                    "title": doc_title,
                    "file": md_file.relative_to(KNOWLEDGE_DIR).as_posix(),
                    "content": md_file.read_text(encoding="utf-8"),
                    "related_nodes": related_nodes,
                })

        if not matched:
            results.append({
                "query": title,
                "status": "not_found",
                "message": f"未找到匹配「{title}」的文档",
                "available_titles_sample": [t for t, _ in candidates][:30],
                "related_nodes": related_nodes,
            })
        elif len(matched) > 5:
            results.append({
                "query": title,
                "status": "too_many",
                "message": f"匹配到 {len(matched)} 篇文档，请用更精确的关键词。",
                "matches": [{"title": m["title"], "file": m["file"]} for m in matched],
                "related_nodes": related_nodes,
            })
        else:
            results.append({
                "query": title,
                "status": "ok",
                "documents": matched,
            })

    return json.dumps(results, ensure_ascii=False, indent=2)


@mcp.tool(
    name="rag_search",
    description=(
        "使用向量检索在知识库中搜索相关内容。支持批量查询。"
        "适用于不确定具体节点或文档名称时的语义搜索。"
        "返回相关文档片段和相似度分数。"
    ),
)
def rag_search(queries: list[str], top_k: int = 5) -> str:
    """
    Args:
        queries: 自然语言查询问题列表，支持批量传入。
        top_k: 每个查询返回的最大结果数量，默认 5。
    """
    try:
        env = dict(_load_rag_env())
        collection_name = env.get("CHROMA_COLLECTION_NAME", "docs")
        threshold = float(env.get("SIMILARITY_THRESHOLD", "0.3"))

        db = chromadb.PersistentClient(path=str(RAG_DB_DIR))
        collection = db.get_collection(collection_name)

        all_results: list[dict[str, str | int | list[dict[str, str | float]]]] = []
        for query in queries:
            embedding = _get_query_embedding(query, env)
            results = collection.query(
                query_embeddings=[embedding],
                n_results=top_k,
                include=["documents", "metadatas", "distances"],
            )

            docs = results["documents"][0]
            metas = results["metadatas"][0]
            dists = results["distances"][0]

            sources: list[dict[str, str | float]] = []
            for i in range(len(docs)):
                sim = max(0.0, 1.0 - dists[i] / 2.0)
                if sim < threshold:
                    continue
                meta = metas[i]
                text = docs[i] or ""
                sources.append({
                    "title": meta.get("title", meta.get("file_name", "未知文档")),
                    "h1_title": meta.get("h1_title", ""),
                    "file_name": meta.get("file_name", ""),
                    "similarity": round(sim, 4),
                    "text_snippet": text[:200] + ("..." if len(text) > 200 else ""),
                })

            all_results.append({
                "query": query,
                "total_results": len(sources),
                "results": sources,
            })

        return json.dumps(all_results, ensure_ascii=False, indent=2)

    except Exception as e:
        return json.dumps({"error": f"RAG 检索异常: {e}"}, ensure_ascii=False)


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
