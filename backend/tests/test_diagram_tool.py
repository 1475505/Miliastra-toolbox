"""单元测试 - diagram 工具

运行命令:
    cd backend && python3 -m pytest tests/test_diagram_tool.py -v
"""
import base64
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

# 固定 anyio 使用 asyncio 后端（避免 trio 未安装报错）
pytestmark = pytest.mark.anyio


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"

from agent.diagram import (
    _DiagramStore,
    _svg_sanitize,
    diagram_store,
    generate_diagram,
)

# ── 最小可用 SVG ─────────────────────────────────────────────
MINIMAL_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50">'
    '<rect width="100" height="50" fill="#4a90e2"/>'
    '<text x="10" y="30" font-family="sans-serif" fill="white">Test</text>'
    "</svg>"
)


# ── _svg_sanitize ────────────────────────────────────────────

class TestSvgSanitize:
    def test_removes_script_tag(self):
        svg = '<svg><script>alert(1)</script><rect/></svg>'
        result = _svg_sanitize(svg)
        assert "<script" not in result
        assert "alert" not in result

    def test_removes_script_with_attributes(self):
        svg = '<svg><script type="text/javascript">evil()</script></svg>'
        result = _svg_sanitize(svg)
        assert "<script" not in result

    def test_strips_external_href(self):
        svg = '<svg><image href="http://evil.com/img.png"/></svg>'
        result = _svg_sanitize(svg)
        assert "http://evil.com" not in result

    def test_strips_xlink_href(self):
        svg = '<svg><use xlink:href="http://external.com/symbol"/></svg>'
        result = _svg_sanitize(svg)
        assert "http://external.com" not in result

    def test_strips_file_href(self):
        svg = '<svg><image href="file:///etc/passwd"/></svg>'
        result = _svg_sanitize(svg)
        assert "file:///" not in result

    def test_keeps_data_uri(self):
        svg = '<svg><image href="data:image/png;base64,abc123"/></svg>'
        result = _svg_sanitize(svg)
        assert "data:image/png" in result

    def test_keeps_anchor_href(self):
        svg = '<svg><use href="#symbol1"/></svg>'
        result = _svg_sanitize(svg)
        assert 'href="#symbol1"' in result

    def test_keeps_svg_content_intact(self):
        result = _svg_sanitize(MINIMAL_SVG)
        assert "<rect" in result
        assert "<text" in result


# ── _DiagramStore ────────────────────────────────────────────

class TestDiagramStore:
    def test_put_and_get(self):
        store = _DiagramStore(maxsize=10)
        store.put("id1", b"png_data", "title1")
        entry = store.get("id1")
        assert entry is not None
        png, title = entry
        assert png == b"png_data"
        assert title == "title1"

    def test_get_missing_returns_none(self):
        store = _DiagramStore(maxsize=10)
        assert store.get("nonexistent") is None

    def test_lru_eviction(self):
        store = _DiagramStore(maxsize=3)
        store.put("a", b"a", "A")
        store.put("b", b"b", "B")
        store.put("c", b"c", "C")
        # Access "a" to make it recently used
        store.get("a")
        # Insert "d", which should evict "b" (least recently used)
        store.put("d", b"d", "D")
        assert store.get("b") is None
        assert store.get("a") is not None
        assert store.get("c") is not None
        assert store.get("d") is not None

    def test_len(self):
        store = _DiagramStore(maxsize=10)
        store.put("x", b"x", "X")
        store.put("y", b"y", "Y")
        assert len(store) == 2

    def test_maxsize_respected(self):
        store = _DiagramStore(maxsize=5)
        for i in range(10):
            store.put(str(i), b"data", f"title{i}")
        assert len(store) <= 5


# ── generate_diagram ─────────────────────────────────────────

class TestGenerateDiagram:
    def test_returns_valid_json(self):
        result = generate_diagram(MINIMAL_SVG, "测试图表")
        data = json.loads(result)
        assert "diagram_id" in data
        assert "png_url" in data
        assert "markdown" in data
        assert "title" in data

    def test_png_url_format(self):
        result = generate_diagram(MINIMAL_SVG, "test")
        data = json.loads(result)
        assert data["png_url"].startswith("/api/v1/agent/diagram/")

    def test_markdown_contains_url(self):
        result = generate_diagram(MINIMAL_SVG, "测试")
        data = json.loads(result)
        assert data["png_url"] in data["markdown"]
        assert data["markdown"].startswith("![")

    def test_diagram_stored_in_memory(self):
        result = generate_diagram(MINIMAL_SVG, "存储测试")
        data = json.loads(result)
        diagram_id = data["diagram_id"]
        entry = diagram_store.get(diagram_id)
        assert entry is not None
        png_bytes, title = entry
        assert len(png_bytes) > 0
        assert title == "存储测试"

    def test_png_bytes_is_valid_png(self):
        result = generate_diagram(MINIMAL_SVG)
        data = json.loads(result)
        diagram_id = data["diagram_id"]
        entry = diagram_store.get(diagram_id)
        assert entry is not None
        png_bytes, _ = entry
        # PNG 文件头: \x89PNG
        assert png_bytes[:4] == b'\x89PNG'

    def test_default_title(self):
        result = generate_diagram(MINIMAL_SVG)
        data = json.loads(result)
        assert data["title"] == "图表"
        assert "图表" in data["markdown"]

    def test_sanitizes_before_render(self):
        """含 <script> 的 SVG 应能正常渲染（脚本被过滤）。"""
        svg_with_script = MINIMAL_SVG.replace(
            "<rect", '<script>evil()</script><rect'
        )
        result = generate_diagram(svg_with_script, "安全测试")
        data = json.loads(result)
        assert "diagram_id" in data  # 不应返回 error

    def test_invalid_svg_returns_error(self):
        result = generate_diagram("not a valid svg at all ###", "broken")
        data = json.loads(result)
        assert "error" in data


# ── HTTP 端点（httpx.AsyncClient + ASGITransport）────────────

def _make_app():
    from fastapi import FastAPI
    from agent.router import router
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return app


@pytest.mark.anyio
async def test_get_existing_diagram():
    import httpx
    app = _make_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        result = generate_diagram(MINIMAL_SVG, "端点测试")
        data = json.loads(result)
        diagram_id = data["diagram_id"]

        resp = await client.get(f"/api/v1/agent/diagram/{diagram_id}")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/png"
        assert resp.content[:4] == b'\x89PNG'


@pytest.mark.anyio
async def test_get_nonexistent_diagram_returns_404():
    import httpx
    app = _make_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        resp = await client.get("/api/v1/agent/diagram/nonexistent_id_xyz")
        assert resp.status_code == 404


@pytest.mark.anyio
async def test_capabilities_includes_generate_diagram():
    import httpx
    app = _make_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        resp = await client.get("/api/v1/agent/capabilities")
        assert resp.status_code == 200
        tools = resp.json()["data"]["tools"]
        assert "generate_diagram" in tools
