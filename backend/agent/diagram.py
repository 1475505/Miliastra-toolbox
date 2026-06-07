"""图表生成工具 - AI 调用此工具生成 SVG 图表并转换为 PNG。

PNG 存储在内存 LRU 缓存中（重启后丢失），通过
GET /api/v1/agent/diagram/{diagram_id} 提供访问。
"""
import io
import json
import re
import uuid
from collections import OrderedDict
from typing import Optional
import os

_STORE_MAXSIZE = int(os.getenv("DIAGRAM_STORE_MAX", "100"))


# ── 内存 LRU 存储 ────────────────────────────────────────────
class _DiagramStore:
    """线程安全的简单 LRU PNG 存储。"""

    def __init__(self, maxsize: int = _STORE_MAXSIZE) -> None:
        self._store: OrderedDict[str, tuple[bytes, str]] = OrderedDict()
        self._maxsize = maxsize

    def put(self, diagram_id: str, png: bytes, title: str) -> None:
        if diagram_id in self._store:
            self._store.move_to_end(diagram_id)
        self._store[diagram_id] = (png, title)
        while len(self._store) > self._maxsize:
            self._store.popitem(last=False)

    def get(self, diagram_id: str) -> Optional[tuple[bytes, str]]:
        if diagram_id not in self._store:
            return None
        self._store.move_to_end(diagram_id)
        return self._store[diagram_id]

    def __len__(self) -> int:
        return len(self._store)


diagram_store = _DiagramStore()


# ── SVG 净化（防 SSRF）───────────────────────────────────────
_SCRIPT_RE = re.compile(r"<script[\s\S]*?</script>", re.IGNORECASE)
# 匹配 href / xlink:href / src 中指向外部文件的 URL（保留 data: 和 # 锚点）
_EXTERNAL_REF_RE = re.compile(
    r"""((?:xlink:)?href|src)\s*=\s*(['"])((?!data:|#)[^'"]*)\2""",
    re.IGNORECASE,
)


def _svg_sanitize(svg: str) -> str:
    """过滤 SVG 中的 <script> 标签及外部 URL 引用，防止 cairosvg SSRF。"""
    svg = _SCRIPT_RE.sub("", svg)
    svg = _EXTERNAL_REF_RE.sub(r'\1=\2#\2', svg)
    return svg


# ── CJK 字体注入 ────────────────────────────────────────────
_SVG_OPEN_RE = re.compile(r"(<svg\b[^>]*>)", re.IGNORECASE | re.DOTALL)
_CJK_STYLE = '<style>text,tspan{font-family:"Noto Sans CJK SC","Noto Sans",sans-serif !important;}</style>'


def _inject_cjk_font(svg: str) -> str:
    """在 <svg> 开标签后注入 CJK 字体 CSS，确保中文字符正确渲染。"""
    result, n = _SVG_OPEN_RE.subn(lambda m: m.group(1) + _CJK_STYLE, svg, count=1)
    return result if n else svg


# ── 白色背景注入 ────────────────────────────────────────────
def _inject_white_background(svg: str) -> str:
    """在 <svg> 开标签后插入白色背景矩形，避免生成的 PNG 背景透明。"""
    rect = '<rect width="100%" height="100%" fill="white"/>'
    result, n = _SVG_OPEN_RE.subn(lambda m: m.group(1) + rect, svg, count=1)
    return result if n else svg


# ── SVG → PNG ────────────────────────────────────────────────
def _svg_to_png(svg_content: str, scale: float = 2.0) -> bytes:
    import cairosvg  # lazy import

    buf = io.BytesIO()
    cairosvg.svg2png(bytestring=svg_content.encode("utf-8"), write_to=buf, scale=scale)
    return buf.getvalue()


# ── 工具函数（供 FunctionTool 注册）────────────────────────────
def generate_diagram(svg_content: str, title: str = "") -> str:
    """生成 SVG 图表并转换为 PNG，返回访问 URL 和 markdown 嵌入代码。

    Args:
        svg_content: 完整的 SVG XML 字符串。使用内联样式，font-family: sans-serif，
                     不引用外部字体或图片资源，画布宽度建议不超过 1200px。
        title: 图表标题（可选），用于 alt 文本和展示。

    Returns:
        JSON 字符串，包含 diagram_id、png_url 和 markdown 嵌入代码。
    """
    try:
        clean_svg = _svg_sanitize(svg_content)
        clean_svg = _inject_cjk_font(clean_svg)
        clean_svg = _inject_white_background(clean_svg)
        png_bytes = _svg_to_png(clean_svg)
        diagram_id = uuid.uuid4().hex
        diagram_store.put(diagram_id, png_bytes, title)
        png_url = f"/api/v1/agent/diagram/{diagram_id}"
        alt = title or "图表"
        return json.dumps({
            "diagram_id": diagram_id,
            "png_url": png_url,
            "markdown": f"![{alt}]({png_url})",
            "title": alt,
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)
