# Backend - FastAPI RAG Chat

基于 FastAPI 和 LlamaIndex 的知识库问答后端服务，包含完整的聊天及管理接口。

提供多种API访问方式，详见详细文档 [API 接口文档](./api.md)。

## 功能特性

- 支持自定义大语言模型配置（API Key / Base URL / Model）（客户端BYOK机制）。
- 结合系统预设的多轮问答及 Token 消耗统计。
- 通过 LlamaIndex 实现 RAG，支持元数据过滤检索，并返回引用来源。
- 基于名额分配的优先级检索策略（`CombinedRetriever`），优先召回官方文档，bbs 帖子补齐。
- 检索配额由 `knowledge/rag_v1/.env` 的 `TOP_K` / `DOC_MAX` 控制（当前建议 `12/8`），修改后需重启服务。
- 服务日志会打印召回 node id（`[ChatEngine] 召回 ... ids=[...]`），用于快速回溯具体 chunk。
- 支持流式响应 (SSE) 以及一键式整合 Web 前端 (自动托管 `static/` 目录)。

## 快速开始

### 1. 配置与安装

```bash
cd backend
cp .env.example .env
# 编辑 .env 文件填入环境变量配置
pip install -r requirements.txt
```

### 2. 启动服务

```bash
python3 main.py

# 指定端口 / host / 热重载 (开发调试)
python3 main.py --host 127.0.0.1 --port 8000 --reload
# 或通过环境变量 export PORT=8000 && python3 main.py
```

服务默认包含静态页面，可以通过浏览器直接访问界面和文档：
- **Web 界面**: `http://localhost:8000`
- **Swagger API 文档**: `http://localhost:8000/docs`

### 3. 测试与示例

通过 `tests/` 下的脚本可快速进行单元 / 集成测试：
```bash
# 启动服务后执行完整系统测试
export DEEPSEEK_API_KEY=your_key
./tests/test_api.sh

# Pytest 独立运行全量用例
pytest tests/ -v
```

更多关于路由（/chat, /notes, /upload 等）以及输入输出结构的样例，请参考 [api.md](./api.md)。

