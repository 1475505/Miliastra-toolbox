"""
SVG 一图流文档 API
提供 svg_index.md 解析与 SVG 文件服务
"""
import io
import re
import threading
from pathlib import Path
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response

router = APIRouter()

_RENDER_CONCURRENCY = int(__import__("os").getenv("SVG_RENDER_CONCURRENCY", "2"))
_RENDER_SEM = threading.Semaphore(_RENDER_CONCURRENCY)

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


def _search_file(name: str) -> str | None:
    """
    在所有已有文件中搜索名称包含/被包含关系，返回第一个匹配的文件名。
    忽略大小写及数字编号前缀。
    """
    query = name.strip().lower()
    available = _get_available_files()
    for filename in sorted(available.values()):  # 按文件名排序保证结果稳定
        # 去掉编号前缀后的名称，如 "02-地形编辑.svg" → "地形编辑"
        stem = re.sub(r"^\d+-", "", Path(filename).stem).lower()
        if query in stem or stem in query:
            return filename
    return None



def _svg_to_png(svg_path: Path, scale: float = 2.0) -> bytes:
    """将 SVG 文件渲染为 PNG 字节流。"""
    import cairosvg  # lazy import，仅在需要时加载

    # 限制并发渲染数量，防止多个大 SVG 同时渲染撑爆内存
    with _RENDER_SEM:
        buf = io.BytesIO()
        cairosvg.svg2png(url=str(svg_path), write_to=buf, scale=scale)
        return buf.getvalue()



def _validate_and_resolve(filename: str) -> Path:
    """校验文件名并返回安全的绝对路径，不合法时抛出 HTTPException。"""
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="非法文件名")
    if not filename.endswith(".svg"):
        raise HTTPException(status_code=400, detail="仅支持 .svg 文件")
    file_path = _SVG_DIR / filename
    try:
        file_path.resolve().relative_to(_SVG_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="非法路径")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    return file_path


@router.get("/index")
async def get_svg_index() -> dict:
    """返回解析后的 SVG 目录结构。"""
    return {"sections": _parse_index()}


@router.get("/search")
async def search_svg(
    name: str = Query(..., description="搜索关键词，支持包含/被包含模糊匹配"),
    png: bool = Query(False, description="是否渲染为 PNG（默认返回 SVG）"),
    scale: float = Query(2.0, ge=0.5, le=4.0, description="PNG 渲染缩放倍数（仅 png=true 时有效）"),
) -> Response:
    """
    按名称搜索并返回第一个匹配的图表文件。

    - **name**：搜索关键词，忽略大小写，采用包含/被包含匹配（如 "技能" 可匹配 "31-技能.svg"）
    - **png**：设为 `true` 时将 SVG 渲染为 PNG 后返回
    - **scale**：PNG 渲染分辨率缩放（默认 2.0，即 2×）
    """
    filename = _search_file(name)
    if filename is None:
        raise HTTPException(status_code=404, detail=f"未找到与 '{name}' 匹配的图表")

    file_path = _validate_and_resolve(filename)

    if png:
        png_bytes = _svg_to_png(file_path, scale=scale)
        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={
                "X-Svg-Filename": quote(filename),
                "X-Page-Url": quote(f"/svg/{Path(filename).stem}", safe="/"),
            },
        )

    return FileResponse(
        str(file_path),
        media_type="image/svg+xml",
        headers={
            "X-Svg-Filename": quote(filename),
            "X-Page-Url": quote(f"/svg/{Path(filename).stem}", safe="/"),
        },
    )


@router.get("/raw/{filename}")
async def get_svg_raw(
    filename: str,
    png: bool = Query(False, description="是否渲染为 PNG（默认返回 SVG）"),
    scale: float = Query(2.0, ge=0.5, le=4.0, description="PNG 渲染缩放倍数（仅 png=true 时有效）"),
) -> Response:
    """
    按文件名精确返回 SVG 内容，或渲染为 PNG。

    - **png**：设为 `true` 时将 SVG 渲染为 PNG 后返回（使用 Noto Sans CJK 渲染中文）
    - **scale**：PNG 渲染分辨率缩放（默认 2.0，即 2×）
    """
    file_path = _validate_and_resolve(filename)
    headers = {
        "X-Svg-Filename": quote(file_path.name),
        "X-Page-Url": quote(f"/svg/{file_path.stem}", safe="/"),
    }
    if png:
        png_bytes = _svg_to_png(file_path, scale=scale)
        return Response(content=png_bytes, media_type="image/png", headers=headers)
    return FileResponse(str(file_path), media_type="image/svg+xml", headers=headers)


@router.get("/resolve")
async def resolve_svg_url(
    request: Request,
    q: str = Query(..., description="图表名称，支持模糊匹配，如 '变量'、'技能'、'地形'"),
) -> dict[str, str]:
    """
    按名称模糊匹配图表，返回前端页面完整 URL。

    - **q**：搜索关键词，支持包含/被包含匹配
    - 返回 `url` 字段，可直接在浏览器中打开
    """
    filename = _search_file(q)
    if filename is None:
        raise HTTPException(status_code=404, detail=f"未找到与 '{q}' 匹配的图表")
    stem = Path(filename).stem
    m = re.match(r"^(\d+)", stem)
    doc_id = m.group(1) if m else stem
    base = str(request.base_url).rstrip("/")
    return {"query": q, "title": stem, "url": f"{base}/svg/{doc_id}"}
