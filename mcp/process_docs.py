import json
import re
from dataclasses import dataclass, replace
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent / "knowledge" / "Miliastra-knowledge"  # Miliastra-knowledge/
KNOWLEDGE_DIR = BASE_DIR
GUIDE_DIR = KNOWLEDGE_DIR / "official" / "guide"
FAQ_DIR = KNOWLEDGE_DIR / "official" / "faq"
DERIVED_DIR = KNOWLEDGE_DIR / "derived"
NODE_DIR = DERIVED_DIR / "node"
FAQ_OUT_DIR = DERIVED_DIR / "faq"
INDEX_PATH = DERIVED_DIR / "index.json"
SIDE_MAP_PATH = Path(__file__).resolve().parent / "node_side_map.json"  # mcp/node_side_map.json

NODE_GROUPS = ["执行节点", "事件节点", "流程控制节点", "查询节点", "运算节点", "其它节点"]
MARK_RE = re.compile(r"[*_`]+")
LEADING_INDEX_RE = re.compile(r"^(?:\d+[.、]\s*|[（(]?\d+[)）]\s*)+")
QUESTION_PREFIX_RE = re.compile(r"^Q[：:]\s*")
SPACE_RE = re.compile(r"\s+")

# 端归属标签
SIDE_LABEL = {"server": "服务端", "client": "客户端", "both": "双端"}

# 未登记到 sidecar 的节点文档 fallback 启发式：章节名标志段
CLIENT_SECTION_MARKERS = {
    "角色技能", "造物技能", "战术", "预瞄准", "操控运动器",
    "光标", "扫描", "挂接点", "射线", "过滤器",
}
SERVER_SECTION_MARKERS = {
    "实体相关", "关卡相关", "碰撞", "战斗", "铭牌", "商店", "小地图标识组件",
    "造物巡逻", "排行榜", "段位", "寻路阻挡", "关卡任务", "光源组件", "实体布设组",
    "聊天频道", "奇域礼盒相关", "造物预设状态", "悬浮交互页", "命中判定", "文本气泡",
    "卡牌选择器", "作者订阅", "碰撞触发器", "碰撞触发源", "角色扰动装置",
}


@dataclass(frozen=True)
class Chunk:
    title: str
    main_title: str
    source_doc: str
    source_doc_title: str
    local_path: str
    content: str
    side: str  # server | client | both


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


def load_side_map() -> dict[str, dict[str, str]]:
    if not SIDE_MAP_PATH.exists():
        return {}
    data = json.loads(SIDE_MAP_PATH.read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if k.startswith("mh")}


def merge_sides(sides: set[str]) -> str:
    real = {s for s in sides if s}
    if not real:
        return ""  # 无端归属概念（如 FAQ）
    if "both" in real or ("server" in real and "client" in real):
        return "both"
    if "server" in real:
        return "server"
    if "client" in real:
        return "client"
    return "both"


def resolve_side(metadata: dict[str, str], sections: set[str], side_map: dict[str, dict[str, str]], file_name: str) -> str:
    mid = metadata.get("id", "")
    if mid and mid in side_map:
        return side_map[mid]["side"]
    # fallback 启发式（仅用于 sidecar 未登记的新增节点文档）
    if sections & CLIENT_SECTION_MARKERS:
        print(f"  警告：{file_name}（id={mid}）未登记到 node_side_map.json，启发式判定为 client，请确认后补登记")
        return "client"
    if sections & SERVER_SECTION_MARKERS:
        print(f"  警告：{file_name}（id={mid}）未登记到 node_side_map.json，启发式判定为 server，请确认后补登记")
        return "server"
    print(f"  警告：{file_name}（id={mid}）未登记到 node_side_map.json，无法判定端归属，暂记为 both，请确认后补登记")
    return "both"


def collect_chunks(file_path: Path, is_faq: bool, side_map: dict[str, dict[str, str]]) -> list[Chunk]:
    metadata, body = split_frontmatter(file_path.read_text(encoding="utf-8"))
    doc_title = metadata.get("title", file_path.stem)
    current_main_title = doc_title
    current_title = ""
    current_lines: list[str] = []
    chunks: list[Chunk] = []
    sections: set[str] = set()

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
                side="",  # 占位，文件级 side 在解析完成后统一赋值
            ))
        current_title = ""
        current_lines = []

    for line in body.splitlines():
        if line.startswith("# "):
            sections.add(clean_heading(line[2:]))
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

    # 文件级端归属：FAQ 无端概念；节点文档 sidecar 优先，否则启发式
    file_side = "" if is_faq else resolve_side(metadata, sections, side_map, file_path.name)
    return [replace(c, side=file_side) for c in chunks]


def dedupe_chunks(chunks: list[Chunk]) -> list[Chunk]:
    """按 (title, content) 聚合去重，合并各来源的端归属（并集）。

    一个节点若同时出现在服务端与客户端节点图文档中，其 side 合并为 both。
    """
    merged: dict[tuple[str, str], tuple[Chunk, set[str]]] = {}
    order: list[tuple[str, str]] = []
    for chunk in chunks:
        key = (chunk.title, normalize_text(chunk.content))
        if key not in merged:
            merged[key] = (chunk, set())
            order.append(key)
        merged[key][1].add(chunk.side)

    result: list[Chunk] = []
    for key in order:
        chunk, sides = merged[key]
        side = merge_sides(sides)
        result.append(replace(chunk, side=side))
    return result


def write_markdown(output_path: Path, title: str, chunks: list[Chunk]) -> None:
    blocks = [f"# {title}", ""]
    for chunk in chunks:
        side_label = SIDE_LABEL.get(chunk.side, "")
        block = ["___", "", f"# {chunk.title}", ""]
        if side_label:
            block.append(f"**归属端**：{side_label}")
            block.append("")
        block.append(chunk.content.strip())
        block.append("")
        blocks.extend(block)
    output_path.write_text("\n".join(blocks).rstrip() + "\n", encoding="utf-8")


def build_index_entries(output_path: Path, chunks: list[Chunk]) -> list[dict[str, str]]:
    return [{
        "title": chunk.title,
        "main_title": chunk.main_title,
        "side": chunk.side,
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


def generate_node_outputs(side_map: dict[str, dict[str, str]]) -> list[dict[str, str]]:
    clear_files(NODE_DIR)
    grouped: dict[str, list[Chunk]] = {group: [] for group in NODE_GROUPS}

    for file_path in sorted(GUIDE_DIR.rglob("*.md")):
        if file_path.name.lower() == "readme.md":
            continue
        if any(group in file_path.name for group in NODE_GROUPS):
            print(f"Processing Node document: {file_path.name}")
            grouped[node_group(file_path)].extend(collect_chunks(file_path, is_faq=False, side_map=side_map))

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


def generate_faq_output(side_map: dict[str, dict[str, str]]) -> list[dict[str, str]]:
    clear_files(FAQ_OUT_DIR)
    chunks: list[Chunk] = []

    for file_path in sorted(FAQ_DIR.rglob("*.md")):
        if file_path.name.lower() == "readme.md":
            continue
        print(f"Processing FAQ document: {file_path.name}")
        chunks.extend(collect_chunks(file_path, is_faq=True, side_map=side_map))

    unique_chunks = dedupe_chunks(chunks)
    output_path = FAQ_OUT_DIR / "faq.md"
    write_markdown(output_path, "FAQ", unique_chunks)
    print(f"FAQ chunks written: {len(unique_chunks)}")
    return build_index_entries(output_path, unique_chunks)


def write_index(entries: list[dict[str, str]]) -> None:
    from collections import Counter
    node_entries = [e for e in entries if "node/" in e.get("output_file", "")]
    side_counter = Counter(e.get("side", "both") for e in node_entries)
    payload = {
        "metadata": {
            "generated_from": "mcp/process_docs.py",
            "total_chunks": len(entries),
            "node_files": [f"derived/node/{group}.md" for group in NODE_GROUPS],
            "faq_file": "derived/faq/faq.md",
            "node_side_summary": {
                SIDE_LABEL.get(k, k): v for k, v in sorted(side_counter.items())
            },
        },
        "entries": entries,
    }
    INDEX_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    print("Starting document processing...")
    side_map = load_side_map()
    print(f"Loaded side map: {len(side_map)} entries from {SIDE_MAP_PATH.name}")
    ensure_dirs()
    write_index(generate_node_outputs(side_map) + generate_faq_output(side_map))
    print("Processing completed. Results saved to:", DERIVED_DIR)


if __name__ == "__main__":
    main()
