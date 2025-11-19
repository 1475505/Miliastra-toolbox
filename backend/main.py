"""
RAG Chat API 服务
FastAPI 启动文件
"""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from rag.chat import router as chat_router
from share.router import router as share_router

app = FastAPI(
    title="千星沙箱 RAG Chat API",
    description="基于 LlamaIndex 的知识库问答系统",
    version="1.0.0"
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
app.include_router(share_router, prefix="/api/v1")

@app.get("/health")
async def health():
    return {"status": "ok"}

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
