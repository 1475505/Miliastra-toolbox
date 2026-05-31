"""
RAG Chat API 服务
FastAPI 启动文件
"""
import asyncio
import os
from dataclasses import dataclass
from contextlib import asynccontextmanager
from html import escape

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from rag.chat import router as chat_router
from notes.router import router as notes_router
from upload.router import router as upload_router
from agent.router import router as agent_router
from data.router import router as data_router
from skill.router import router as skill_router
from translate.router import router as translate_router
from translate import term_service
from svg.router import router as svg_router
from common.llm_config import openrouter_availability_loop


@dataclass(frozen=True)
class ToolLink:
        label: str
        url: str


@dataclass(frozen=True)
class ToolEntry:
        title: str
        websites: tuple[ToolLink, ...]
        tutorials: tuple[ToolLink, ...] = ()
        features: tuple[str, ...] = ()
        note: str | None = None


TOOL_ENTRIES: tuple[ToolEntry, ...] = (
        ToolEntry(
                title="知识库问答系统",
                websites=(ToolLink(label="网站", url="https://ugc.070077.xyz"),),
                tutorials=(
                        ToolLink(
                                label="推荐通过 Workbuddy Skill 接入使用",
                                url="https://www.bilibili.com/video/BV1fSDJB7Emi",
                        ),
                ),
        ),
        ToolEntry(
                title="图片转UI工具",
                websites=(
                        ToolLink(label="网站", url="https://qxqy-245358-5-1304005994.sh.run.tcloudbase.com/"),
                ),
                tutorials=(
                        ToolLink(label="使用教程", url="https://www.bilibili.com/video/BV1kKDyB9EvY"),
                ),
                note="联系作者获取可执行 exe。",
        ),
        ToolEntry(
                title="前端拼UI工具",
                websites=(
                        ToolLink(label="网站", url="https://qx.070077.xyz/"),
                        ToolLink(label="备用网站", url="https://phm.070077.xyz/"),
                ),
                tutorials=(
                        ToolLink(label="使用教程", url="https://www.bilibili.com/video/BV1evocBqEQ1/"),
                ),
                features=(
                        "无需图片，直接通过 AI 工具生成 svg 或 css。",
                        "支持在线画布修改。",
                        "支持输出超限模式 gia。",
                ),
                note="TODO：在线编辑支持其他官方素材。暂时搁置。",
        ),
        ToolEntry(
                title="字体图片转装饰物",
                websites=(ToolLink(label="网站", url="https://qx-shaper.up.railway.app/"),),
        ),
)


def _render_tool_page() -> str:
        sections: list[str] = []
        for entry in TOOL_ENTRIES:
                website_items = "".join(
                        f'<li><span class="label">{escape(link.label)}：</span><a href="{escape(link.url)}" target="_blank" rel="noreferrer">{escape(link.url)}</a></li>'
                        for link in entry.websites
                )
                tutorial_items = "".join(
                        f'<li><span class="label">{escape(link.label)}：</span><a href="{escape(link.url)}" target="_blank" rel="noreferrer">{escape(link.url)}</a></li>'
                        for link in entry.tutorials
                )
                feature_items = "".join(f"<li>{escape(feature)}</li>" for feature in entry.features)
                note_html = f'<p class="note">{escape(entry.note)}</p>' if entry.note else ""
                sections.append(
                        """
                        <section class="tool-card">
                            <h2>{title}</h2>
                            <ul>{website_items}{tutorial_items}</ul>
                            {feature_block}
                            {note_html}
                        </section>
                        """.format(
                                title=escape(entry.title),
                                website_items=website_items,
                                tutorial_items=tutorial_items,
                                feature_block=f'<div class="feature-block"><h3>功能</h3><ul>{feature_items}</ul></div>' if feature_items else "",
                                note_html=note_html,
                        ).strip()
                )

        cards = "\n".join(sections)
        return f"""<!DOCTYPE html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>嘟嘟可工具集</title>
        <style>
            :root {{
                color-scheme: light;
                --bg: #f4efe7;
                --panel: rgba(255, 252, 246, 0.94);
                --text: #1f2937;
                --muted: #5b6472;
                --accent: #b45309;
                --border: rgba(180, 83, 9, 0.18);
                --shadow: 0 18px 40px rgba(148, 92, 30, 0.12);
            }}

            * {{ box-sizing: border-box; }}

            body {{
                margin: 0;
                font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
                color: var(--text);
                background:
                    radial-gradient(circle at top, rgba(245, 158, 11, 0.2), transparent 28%),
                    linear-gradient(180deg, #fbf6ef 0%, var(--bg) 100%);
            }}

            main {{
                max-width: 920px;
                margin: 0 auto;
                padding: 48px 20px 72px;
            }}

            h1 {{
                margin: 0 0 12px;
                font-size: clamp(2rem, 3vw, 3rem);
            }}

            .intro {{
                margin: 0 0 28px;
                color: var(--muted);
                font-size: 1rem;
                line-height: 1.7;
            }}

            .tool-grid {{
                display: grid;
                gap: 18px;
            }}

            .tool-card {{
                padding: 24px;
                border: 1px solid var(--border);
                border-radius: 20px;
                background: var(--panel);
                box-shadow: var(--shadow);
                backdrop-filter: blur(10px);
            }}

            .tool-card h2 {{
                margin: 0 0 14px;
                font-size: 1.3rem;
            }}

            .tool-card h3 {{
                margin: 18px 0 10px;
                font-size: 1rem;
                color: var(--accent);
            }}

            .tool-card ul {{
                margin: 0;
                padding-left: 20px;
                line-height: 1.8;
            }}

            .label {{
                color: var(--muted);
            }}

            a {{
                color: var(--accent);
                word-break: break-all;
            }}

            .note {{
                margin: 18px 0 0;
                color: var(--muted);
            }}

            @media (max-width: 640px) {{
                main {{
                    padding: 32px 16px 48px;
                }}

                .tool-card {{
                    padding: 20px;
                    border-radius: 16px;
                }}
            }}
        </style>
    </head>
    <body>
        <main>
            <h1>嘟嘟可工具集</h1>
            <p class="intro">当前可用的工具入口、教程与补充说明。</p>
            <div class="tool-grid">
                {cards}
            </div>
        </main>
    </body>
</html>
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Soft-failure: term table initialisation must not break other features.
    try:
        term_service.initialise("../TermTable_15Lang.csv")
    except Exception:
        # Error is already logged inside TermService.
        pass

    task = asyncio.create_task(openrouter_availability_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="千星沙箱 RAG Chat API",
    description="基于 LlamaIndex 的知识库问答系统",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册 API 路由
app.include_router(chat_router, prefix="/api/v1")
app.include_router(notes_router, prefix="/api/v1")
app.include_router(upload_router, prefix="/api/v1")
app.include_router(agent_router, prefix="/api/v1")
app.include_router(data_router, prefix="/api/v1")
app.include_router(skill_router, prefix="/api/v1")
app.include_router(translate_router, prefix="/api/v1")
app.include_router(svg_router, prefix="/api/v1/svg")

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/all", response_class=HTMLResponse, include_in_schema=False)
async def all_tools_page() -> HTMLResponse:
    return HTMLResponse(content=_render_tool_page())


def _serve_spa() -> HTMLResponse:
    index_path = os.path.join("static", "index.html")
    with open(index_path, encoding="utf-8") as f:
        content = f.read()
    return HTMLResponse(content=content)


@app.get("/tool", response_class=HTMLResponse, include_in_schema=False)
async def tool_spa() -> HTMLResponse:
    return _serve_spa()


@app.get("/note", response_class=HTMLResponse, include_in_schema=False)
async def note_spa() -> HTMLResponse:
    return _serve_spa()


@app.get("/data", response_class=HTMLResponse, include_in_schema=False)
async def data_spa() -> HTMLResponse:
    return _serve_spa()


@app.get("/svg", response_class=HTMLResponse, include_in_schema=False)
async def svg_spa() -> HTMLResponse:
    return _serve_spa()


# 托管前端静态文件（必须放在最后）
app.mount("/", StaticFiles(directory="static", html=True), name="static")


if __name__ == "__main__":
    import argparse
    import os
    import uvicorn

    parser = argparse.ArgumentParser(description="Run the RAG Chat FastAPI server")
    parser.add_argument("--host", help="Host to listen on", default=os.environ.get("HOST", "0.0.0.0"))
    parser.add_argument("--port", help="Port to listen on", type=int, default=int(os.environ.get("PORT", 8000)))
    parser.add_argument("--reload", help="Enable auto-reload (useful in development)", action="store_true")
    args = parser.parse_args()

    # 使用 reload 时必须传入导入字符串，否则传入应用实例
    uvicorn.run(
        "main:app" if args.reload else app,
        host=args.host,
        port=args.port,
        reload=args.reload
    )
