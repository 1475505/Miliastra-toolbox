# Backend - RAG Chat API

基于 FastAPI 和 LlamaIndex 的知识库问答后端服务。

## TODO

- 提供免费模型服务

## 功能特性

- ✅ 支持用户自定义 LLM 配置（API Key、Base URL、Model）
- ✅ 多轮对话，自动管理对话上下文
- ✅ 知识库检索，返回引用来源
- ✅ Token 消耗统计
- ✅ **流式响应**：实时逐字返回，提升用户体验
- ✅ **Web 前端**：开箱即用的问答界面

## 快速开始

### 1. 配置环境变量

```bash
cd backend
cp .env.example .env
# 编辑 .env 文件，填入真实的 API Key
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 启动服务

```bash
python3 main.py
# 或使用 uvicorn
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

服务将在 `http://localhost:8000` 启动。

- **Web 界面**: `http://localhost:8000`
- **API 文档**: `http://localhost:8000/docs`

### 4. 测试 API

**使用 curl 测试**：
```bash
# 启动服务后，在另一个终端执行
export DEEPSEEK_API_KEY=your_key
./tests/test_api.sh
```

**使用 pytest 测试**：
```bash
# 单元测试（无需 API Key）
pytest tests/test_chat.py -v

# 集成测试（需要配置 .env 中的 DEEPSEEK_API_KEY）
pytest tests/test_integration.py -v -s

# 所有测试
pytest tests/ -v
```

## 项目结构

```
backend/
├── main.py              # FastAPI 启动入口
├── requirements.txt     # 项目依赖
├── .env.example         # 环境变量模板
├── .env                 # 环境变量配置（不提交到 git）
├── api.md              # API 接口文档
├── README.md           # 项目说明
├── static/             # 前端静态文件
│   └── index.html      # Web 问答界面
├── rag/                # 核心模块
│   ├── chatEngine.py   # ChatEngine 实现（支持流式/非流式）
│   └── chat.py         # FastAPI 路由
└── tests/              # 测试目录
    ├── test_chat.py    # 单元测试
    ├── test_integration.py  # 集成测试
    └── test_api.sh     # API curl 测试脚本
```

## API 使用示例

### 方式 1：Web 界面（推荐）

访问 `http://localhost:8000`，在浏览器中直接使用：
- ✅ 流式对话，实时显示
- ✅ 引用来源展示
- ✅ 配置管理（localStorage）

### 方式 2：非流式 API

**单轮对话**：

```bash
curl -X POST http://localhost:8000/api/v1/rag/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "什么是节点图？",
    "conversation": [],
    "config": {
      "api_key": "sk-xxx",
      "api_base_url": "https://api.deepseek.com/v1",
      "model": "deepseek-chat"
    }
  }'
```

**多轮对话**：

```bash
curl -X POST http://localhost:8000/api/v1/rag/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "它有什么用？",
    "conversation": [
      {"role": "user", "content": "什么是节点图？"},
      {"role": "assistant", "content": "节点图是..."}
    ],
    "config": {
      "api_key": "sk-xxx",
      "api_base_url": "https://api.deepseek.com/v1",
      "model": "deepseek-chat"
    }
  }'
```

### 方式 3：流式 API

```bash
curl -X POST http://localhost:8000/api/v1/rag/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "什么是节点图？",
    "conversation": [],
    "config": {
      "api_key": "sk-xxx",
      "api_base_url": "https://api.deepseek.com/v1",
      "model": "deepseek-chat"
    }
  }'
```

**响应格式（SSE）**：
```
data: {"type": "sources", "data": [...]}
data: {"type": "token", "data": "文本"}
data: {"type": "done", "data": {"tokens": 123}}
```

详见 [api.md](./api.md)

## 技术栈

- **FastAPI**: Web 框架
- **LlamaIndex**: RAG 框架
- **ChromaDB**: 向量数据库
- **Pytest**: 测试框架

## 开发指南

采用测试驱动开发（TDD），保持代码简洁，避免过度设计。

### 运行测试

```bash
# 单元测试（无需 API Key）
pytest tests/test_chat.py -v

# 集成测试（需要配置 .env）
pytest tests/test_integration.py -v -s

# 所有测试
pytest tests/ -v

# curl 测试（需要先启动服务）
export DEEPSEEK_API_KEY=your_key
./tests/test_api.sh
```