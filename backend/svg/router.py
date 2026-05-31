"""
SVG 一图流文档 API
提供 svg_index.md 解析与 SVG 文件服务
"""
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()

_BASE = Path(__file__).resolve().parent.parent.parent
_SVG_DIR = _BASE / "knowledge" / "Miliastra-knowledge" / "derived" / "svg"
_SVG_INDEX_FILE = _BASE / "knowledge" / "Miliastra-knowledge" / "derived" / "svg_index.md"


def _get_available_files() -> dict[str, str]:
    """返回从数字前缀（如 '02'）到文件名的映射。"""
    result: dict[str, str] = {}
    if not _SVG_DIR.exists():
        return result
    for f in _SVG_DIR.iterdir():
        if f.suffix == ".svg":
            m = re.match(r"^(\d+)-", f.name)
            if m:
                result[m.group(1)] = f.name
    return result


def _parse_index() -> list[dict]:
    """解析 svg_index.md，返回结构化目录数据。"""
    if not _SVG_INDEX_FILE.exists():
        return []

    available = _get_available_files()
    sections: list[dict] = []
    current_section: dict | None = None

    with open(_SVG_INDEX_FILE, encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.rstrip("\n").strip()
            if line.startswith("## "):
                if current_section is not None:
                    sections.append(current_section)
                current_section = {"title": line[3:], "level": 2, "items": []}
            elif line.startswith("# "):
                if current_section is not None:
                    sections.append(current_section)
                current_section = {"title": line[2:], "level": 1, "items": []}
            elif line and current_section is not None:
                m = re.match(r"^(\d+)-", line)
                if m:
                    prefix = m.group(1)
                    current_section["items"].append(
                        {
                            "number": prefix,
                            "title": line,
                            "filename": available.get(prefix),
                        }
                    )

    if current_section is not None:
        sections.append(current_section)

    # 过滤掉无条目的空分区（如文件顶部的 # 标题行）
    return [s for s in sections if s["items"]]


@router.get("/index")
async def get_svg_index() -> dict:
    """返回解析后的 SVG 目录结构。"""
    return {"sections": _parse_index()}


@router.get("/file/{filename}")
async def get_svg_file(filename: str) -> FileResponse:
    """按文件名返回 SVG 文件。"""
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="非法文件名")
    if not filename.endswith(".svg"):
        raise HTTPException(status_code=400, detail="仅支持 .svg 文件")

    file_path = _SVG_DIR / filename
    # 防止路径穿越
    try:
        file_path.resolve().relative_to(_SVG_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="非法路径")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    return FileResponse(str(file_path), media_type="image/svg+xml")
