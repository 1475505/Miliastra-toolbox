"""Miliastra knowledge skill shared service."""

import json
from functools import lru_cache
from pathlib import Path
from typing import TypedDict

import chromadb
import httpx

TOOLBOX_DIR = Path(__file__).resolve().parent.parent.parent
KNOWLEDGE_DIR = TOOLBOX_DIR / "knowledge" / "Miliastra-knowledge"
DERIVED_DIR = KNOWLEDGE_DIR / "derived"
NODE_DIR = DERIVED_DIR / "node"
INDEX_PATH = DERIVED_DIR / "index.json"
OFFICIAL_DIR = KNOWLEDGE_DIR / "official"
RAG_DB_DIR = TOOLBOX_DIR / "knowledge" / "rag_v1" / "db"
RAG_ENV_PATH = TOOLBOX_DIR / "knowledge" / "rag_v1" / ".env"
SKILL_MARKDOWN_PATH = TOOLBOX_DIR / "mcp" / "SKILL.md"

_SEPARATOR = "___"
SKILL_ID = "miliastra-knowledge"
SKILL_VERSION = "1.0.0"


class NodeMatch(TypedDict):
    title: str
    main_title: str
    source_doc_title: str
    local_path: str
    output_file: str
    content: str


class NodeQueryResult(TypedDict, total=False):
    query: str
    matches: list[NodeMatch]
    message: str


class DocumentEntry(TypedDict):
    title: str
    file: str


class ListDocumentsResult(TypedDict):
    total: int
    documents: list[DocumentEntry]


class FilteredDocumentsResult(TypedDict):
    keyword: str
    total: int
    documents: list[DocumentEntry]


class DocumentMatch(TypedDict):
    title: str
    file: str
    content: str
    related_nodes: list[NodeMatch]


class DocumentSummary(TypedDict):
    title: str
    file: str


class DocumentQueryResult(TypedDict, total=False):
    query: str
    status: str
    message: str
    documents: list[DocumentMatch]
    matches: list[DocumentSummary]
    available_titles_sample: list[str]
    related_nodes: list[NodeMatch]


class RagSearchResultItem(TypedDict):
    title: str
    h1_title: str
    file_name: str
    similarity: float
    text_snippet: str


class RagSearchQueryResult(TypedDict):
    query: str
    total_results: int
    results: list[RagSearchResultItem]


class RagErrorResult(TypedDict):
    error: str


@lru_cache(maxsize=1)
def _load_index() -> tuple[dict[str, str], ...]:
    data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    entries = data.get("entries", [])
    return tuple(entries)


@lru_cache(maxsize=1)
def _load_rag_env() -> tuple[tuple[str, str], ...]:
    pairs: list[tuple[str, str]] = []
    if RAG_ENV_PATH.exists():
        for line in RAG_ENV_PATH.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("#") and "=" in stripped:
                key, value = stripped.split("=", 1)
                pairs.append((key.strip(), value.strip()))
    return tuple(pairs)


@lru_cache(maxsize=1)
def _load_node_chunks() -> dict[str, dict[str, str]]:
    cache: dict[str, dict[str, str]] = {}
    for md_file in sorted(NODE_DIR.glob("*.md")):
        cache[md_file.name] = _parse_chunks_from_md(md_file)
    return cache


@lru_cache(maxsize=1)
def read_skill_markdown() -> str:
    return SKILL_MARKDOWN_PATH.read_text(encoding="utf-8")


def _fuzzy_match(query: str, target: str) -> bool:
    lowered_query = query.lower()
    lowered_target = target.lower()
    if lowered_query in lowered_target:
        return True
    query_index = 0
    for char in lowered_target:
        if query_index < len(lowered_query) and char == lowered_query[query_index]:
            query_index += 1
    return query_index == len(lowered_query)


def _parse_chunks_from_md(file_path: Path) -> dict[str, str]:
    text = file_path.read_text(encoding="utf-8")
    chunks: dict[str, str] = {}
    title = ""
    lines: list[str] = []
    for line in text.splitlines():
        if line.strip() == _SEPARATOR:
            if title:
                chunks[title] = "\n".join(lines).strip()
            title = ""
            lines = []
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
    except OSError:
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


def _lookup_node_matches(name: str) -> list[NodeMatch]:
    entries = _load_index()
    chunk_cache = _load_node_chunks()
    matched: list[NodeMatch] = []
    for entry in entries:
        output_file = entry.get("output_file", "")
        title = entry.get("title", "")
        if "node/" not in output_file:
            continue
        if not _fuzzy_match(name, title):
            continue
        md_name = Path(output_file).name
        content = chunk_cache.get(md_name, {}).get(title, "")
        matched.append({
            "title": title,
            "main_title": entry.get("main_title", ""),
            "source_doc_title": entry.get("source_doc_title", ""),
            "local_path": entry.get("local_path", ""),
            "output_file": output_file,
            "content": content,
        })
    return matched


def _get_query_embedding(text: str, env: dict[str, str]) -> list[float]:
    api_key = env.get("OPENAI_API_KEY", "")
    base_url = env.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = env.get("EMBEDDING_MODEL", "BAAI/bge-m3")
    response = httpx.post(
        f"{base_url}/embeddings",
        headers={"Authorization": f"Bearer {api_key}"},
        json={"model": model, "input": text},
        timeout=30.0,
    )
    response.raise_for_status()
    payload = response.json()
    return payload["data"][0]["embedding"]


def get_node_info_data(names: list[str]) -> list[NodeQueryResult]:
    results: list[NodeQueryResult] = []
    for name in names:
        matches = _lookup_node_matches(name)
        if matches:
            results.append({"query": name, "matches": matches})
        else:
            results.append({"query": name, "matches": [], "message": f"未找到匹配「{name}」的节点"})
    return results


def get_node_info_json(names: list[str]) -> str:
    return json.dumps(get_node_info_data(names), ensure_ascii=False, indent=2)


def list_documents_data(keywords: list[str] | None = None) -> ListDocumentsResult | list[FilteredDocumentsResult]:
    candidates: list[DocumentEntry] = []
    for md_file in sorted(OFFICIAL_DIR.rglob("*.md")):
        lower_name = md_file.name.lower()
        if lower_name in ("readme.md", "category.md"):
            continue
        candidates.append({
            "title": _extract_title(md_file),
            "file": md_file.relative_to(KNOWLEDGE_DIR).as_posix(),
        })

    if not keywords:
        return {"total": len(candidates), "documents": candidates}

    results: list[FilteredDocumentsResult] = []
    for keyword in keywords:
        filtered = [
            candidate for candidate in candidates
            if _fuzzy_match(keyword, candidate["title"]) or _fuzzy_match(keyword, Path(candidate["file"]).stem)
        ]
        results.append({"keyword": keyword, "total": len(filtered), "documents": filtered})
    return results


def list_documents_json(keywords: list[str] | None = None) -> str:
    return json.dumps(list_documents_data(keywords), ensure_ascii=False, indent=2)


def get_document_data(titles: list[str]) -> list[DocumentQueryResult]:
    candidates: list[tuple[str, Path]] = []
    for md_file in sorted(OFFICIAL_DIR.rglob("*.md")):
        lower_name = md_file.name.lower()
        if lower_name in ("readme.md", "category.md"):
            continue
        candidates.append((_extract_title(md_file), md_file))

    results: list[DocumentQueryResult] = []
    for title in titles:
        related_nodes = _lookup_node_matches(title)
        matches: list[DocumentMatch] = []
        for doc_title, md_file in candidates:
            if _fuzzy_match(title, doc_title) or _fuzzy_match(title, md_file.stem):
                matches.append({
                    "title": doc_title,
                    "file": md_file.relative_to(KNOWLEDGE_DIR).as_posix(),
                    "content": md_file.read_text(encoding="utf-8"),
                    "related_nodes": related_nodes,
                })

        if not matches:
            results.append({
                "query": title,
                "status": "not_found",
                "message": f"未找到匹配「{title}」的文档",
                "available_titles_sample": [doc_title for doc_title, _ in candidates][:30],
                "related_nodes": related_nodes,
            })
            continue

        if len(matches) > 5:
            summaries: list[DocumentSummary] = [{"title": item["title"], "file": item["file"]} for item in matches]
            results.append({
                "query": title,
                "status": "too_many",
                "message": f"匹配到 {len(matches)} 篇文档，请用更精确的关键词。",
                "matches": summaries,
                "related_nodes": related_nodes,
            })
            continue

        results.append({"query": title, "status": "ok", "documents": matches})

    return results


def get_document_json(titles: list[str]) -> str:
    return json.dumps(get_document_data(titles), ensure_ascii=False, indent=2)


def rag_search_data(queries: list[str], top_k: int = 5) -> list[RagSearchQueryResult] | RagErrorResult:
    try:
        env = dict(_load_rag_env())
        collection_name = env.get("CHROMA_COLLECTION_NAME", "docs")
        threshold = float(env.get("SIMILARITY_THRESHOLD", "0.3"))

        db = chromadb.PersistentClient(path=str(RAG_DB_DIR))
        collection = db.get_collection(collection_name)

        all_results: list[RagSearchQueryResult] = []
        for query in queries:
            embedding = _get_query_embedding(query, env)
            results = collection.query(
                query_embeddings=[embedding],
                n_results=top_k,
                include=["documents", "metadatas", "distances"],
            )

            docs: list[str] = results["documents"][0]
            metadatas: list[dict[str, str]] = results["metadatas"][0]
            distances: list[float] = results["distances"][0]

            sources: list[RagSearchResultItem] = []
            for index, doc in enumerate(docs):
                similarity = max(0.0, 1.0 - distances[index] / 2.0)
                if similarity < threshold:
                    continue
                metadata = metadatas[index]
                snippet = doc[:200] + ("..." if len(doc) > 200 else "")
                sources.append({
                    "title": metadata.get("title", metadata.get("file_name", "未知文档")),
                    "h1_title": metadata.get("h1_title", ""),
                    "file_name": metadata.get("file_name", ""),
                    "similarity": round(similarity, 4),
                    "text_snippet": snippet,
                })

            all_results.append({"query": query, "total_results": len(sources), "results": sources})

        return all_results
    except Exception as exc:
        return {"error": f"RAG 检索异常: {exc}"}


def rag_search_json(queries: list[str], top_k: int = 5) -> str:
    return json.dumps(rag_search_data(queries, top_k=top_k), ensure_ascii=False, indent=2)
