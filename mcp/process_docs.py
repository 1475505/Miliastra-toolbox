import json
import re
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent / "knowledge" / "Miliastra-knowledge"  # Miliastra-knowledge/
KNOWLEDGE_DIR = BASE_DIR
GUIDE_DIR = KNOWLEDGE_DIR / "official" / "guide"
FAQ_DIR = KNOWLEDGE_DIR / "official" / "faq"
DERIVED_DIR = KNOWLEDGE_DIR / "derived"
NODE_DIR = DERIVED_DIR / "node"
FAQ_OUT_DIR = DERIVED_DIR / "faq"
INDEX_PATH = DERIVED_DIR / "index.json"

NODE_GROUPS = ["执行节点", "事件节点", "流程控制节点", "查询节点", "运算节点", "其它节点"]
MARK_RE = re.compile(r"[*_`]+")
LEADING_INDEX_RE = re.compile(r"^(?:\d+[.、]\s*|[（(]?\d+[)）]\s*)+")
QUESTION_PREFIX_RE = re.compile(r"^Q[：:]\s*")
SPACE_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class Chunk:
    title: str
    main_title: str
    source_doc: str
    source_doc_title: str
    local_path: str
    content: str


def ensure_dirs() -> None:
    NODE_DIR.mkdir(parents=True, exist_ok=True)
    FAQ_OUT_DIR.mkdir(parents=True, exist_ok=True)


def clear_files(directory: Path) -> None:
    for path in directory.iterdir():
        if path.is_file():
            path.unlink()


def split_frontmatter(content: str) -> tuple[dict[str, str], str]:
    if not content.startswith("---\n"):
        return {}, content.strip()

    parts = content.split("\n---\n", 1)
    if len(parts) != 2:
        return {}, content.strip()

    header, body = parts
    metadata: dict[str, str] = {}
    for line in header.splitlines()[1:]:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        metadata[key.strip()] = value.strip()
    return metadata, body.strip()


def clean_heading(text: str) -> str:
    text = MARK_RE.sub("", text).strip()
    text = QUESTION_PREFIX_RE.sub("", text)
    text = LEADING_INDEX_RE.sub("", text)
    return SPACE_RE.sub(" ", text).strip()


def normalize_text(text: str) -> str:
    return SPACE_RE.sub(" ", text.replace("\n", " ")).strip()


def trim_lines(lines: list[str]) -> str:
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return "\n".join(lines).strip()


def is_faq_heading(text: str) -> bool:
    plain = MARK_RE.sub("", text).strip()
    return plain.startswith("Q：") or plain.startswith("Q:")


def collect_chunks(file_path: Path, is_faq: bool) -> list[Chunk]:
    metadata, body = split_frontmatter(file_path.read_text(encoding="utf-8"))
    doc_title = metadata.get("title", file_path.stem)
    current_main_title = doc_title
    current_title = ""
    current_lines: list[str] = []
    chunks: list[Chunk] = []

    def flush() -> None:
        nonlocal current_title, current_lines
        content = trim_lines(current_lines)
        if current_title and content:
            chunks.append(Chunk(
                title=current_title,
                main_title=current_main_title,
                source_doc=file_path.stem,
                source_doc_title=doc_title,
                local_path=file_path.relative_to(KNOWLEDGE_DIR).as_posix(),
                content=content,
            ))
        current_title = ""
        current_lines = []

    for line in body.splitlines():
        if line.startswith("# "):
            flush()
            current_main_title = clean_heading(line[2:]) or doc_title
            continue

        if line.startswith("## "):
            heading = line[3:].strip()
            if is_faq and not is_faq_heading(heading):
                continue
            flush()
            current_title = clean_heading(heading)
            continue

        if current_title:
            current_lines.append(line)

    flush()
    return chunks


def dedupe_chunks(chunks: list[Chunk]) -> list[Chunk]:
    unique_chunks: list[Chunk] = []
    seen: set[tuple[str, str]] = set()

    for chunk in chunks:
        key = (chunk.title, normalize_text(chunk.content))
        if key in seen:
            continue
        seen.add(key)
        unique_chunks.append(chunk)

    return unique_chunks


def write_markdown(output_path: Path, title: str, chunks: list[Chunk]) -> None:
    blocks = [f"# {title}", ""]
    for chunk in chunks:
        blocks.extend(["___", "", f"# {chunk.title}", "", chunk.content.strip(), ""])
    output_path.write_text("\n".join(blocks).rstrip() + "\n", encoding="utf-8")


def build_index_entries(output_path: Path, chunks: list[Chunk]) -> list[dict[str, str]]:
    return [{
        "title": chunk.title,
        "main_title": chunk.main_title,
        "source_doc": chunk.source_doc,
        "source_doc_title": chunk.source_doc_title,
        "local_path": chunk.local_path,
        "output_file": output_path.relative_to(KNOWLEDGE_DIR).as_posix(),
    } for chunk in chunks]


def node_group(file_path: Path) -> str:
    for group in NODE_GROUPS:
        if group in file_path.name:
            return group
    raise ValueError(f"Unknown node group: {file_path.name}")


def generate_node_outputs() -> list[dict[str, str]]:
    clear_files(NODE_DIR)
    grouped: dict[str, list[Chunk]] = {group: [] for group in NODE_GROUPS}

    for file_path in sorted(GUIDE_DIR.rglob("*.md")):
        if file_path.name.lower() == "readme.md":
            continue
        if any(group in file_path.name for group in NODE_GROUPS):
            print(f"Processing Node document: {file_path.name}")
            grouped[node_group(file_path)].extend(collect_chunks(file_path, is_faq=False))

    entries: list[dict[str, str]] = []
    total = 0
    for group in NODE_GROUPS:
        chunks = dedupe_chunks(grouped[group])
        total += len(chunks)
        output_path = NODE_DIR / f"{group}.md"
        write_markdown(output_path, group, chunks)
        entries.extend(build_index_entries(output_path, chunks))

    print(f"Node chunks written: {total}")
    return entries


def generate_faq_output() -> list[dict[str, str]]:
    clear_files(FAQ_OUT_DIR)
    chunks: list[Chunk] = []

    for file_path in sorted(FAQ_DIR.rglob("*.md")):
        if file_path.name.lower() == "readme.md":
            continue
        print(f"Processing FAQ document: {file_path.name}")
        chunks.extend(collect_chunks(file_path, is_faq=True))

    unique_chunks = dedupe_chunks(chunks)
    output_path = FAQ_OUT_DIR / "faq.md"
    write_markdown(output_path, "FAQ", unique_chunks)
    print(f"FAQ chunks written: {len(unique_chunks)}")
    return build_index_entries(output_path, unique_chunks)


def write_index(entries: list[dict[str, str]]) -> None:
    payload = {
        "metadata": {
            "generated_from": "mcp/process_docs.py",
            "total_chunks": len(entries),
            "node_files": [f"derived/node/{group}.md" for group in NODE_GROUPS],
            "faq_file": "derived/faq/faq.md",
        },
        "entries": entries,
    }
    INDEX_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    print("Starting document processing...")
    ensure_dirs()
    write_index(generate_node_outputs() + generate_faq_output())
    print("Processing completed. Results saved to:", DERIVED_DIR)


if __name__ == "__main__":
    main()
