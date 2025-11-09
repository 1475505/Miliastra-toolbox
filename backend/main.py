"""
RAG Chat API 服务
FastAPI 启动文件
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from rag.chat import router as chat_router

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

# 注册路由
app.include_router(chat_router, prefix="/api/v1")

@app.get("/")
async def root():
    return {"message": "RAG Chat API 运行中", "docs": "/docs"}

@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
