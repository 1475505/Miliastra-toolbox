# Backend - FastAPI RAG Chat

基于 FastAPI 和 LlamaIndex 的知识库问答后端服务，包含完整的聊天及管理接口。

提供多种API访问方式，详见详细文档 [API 接口文档](./api.md)。

## 功能特性

### 对话与检索

- 支持自定义大语言模型配置（API Key / Base URL / Model）（客户端BYOK机制）。

- 结合系统预设的多轮问答及 Token 消耗统计。

- 通过 LlamaIndex 实现 RAG，支持元数据过滤检索，并返回引用来源。

- 基于名额分配的优先级检索策略（`CombinedRetriever`），优先召回官方文档，bbs 帖子补齐。

- **思考模式模型支持**：兼容 DeepSeek R1 等带 `reasoning_content` 的思考模型。多轮对话与 Agent 工具循环中自动将推理内容原样回传上游（避免 400 `reasoning_content must be passed back`），流式接口通过 SSE `reasoning` 事件推送推理增量，非流式接口返回 `reasoning` 字段。

### 扩展能力

- **Agent 模式**：基于 LlamaIndex FunctionAgent，提供 tool-calling 的问答模式，支持结构化知识查询（节点信息、文档内容）与 RAG 语义检索。支持最大工具调用轮次和超时保护（环境变量 `AGENT_MAX_TOOL_ROUNDS` / `AGENT_TIMEOUT`）。

- **Skill API**：同一套知识查询能力同时以 MCP 和 HTTP API 暴露，支持 skill 发现、skill 详情查询和 4 个知识工具的直接调用。

- **对话分享**：`POST /api/v1/share` 将当前对话保存到 PostgreSQL（`shares` 表），生成只读分享链接 `/share/{id}`。总容量 100MB，超出按最近访问时间 LRU 淘汰；单条上限 2MB；消息中的 base64 图片会被剥离并以 `imageCount` 占位。

- **异步对话**：`POST /api/v1/rag/chat/async` 与 `POST /api/v1/agent/chat/async` 入参分别与 `/rag/chat`、`/agent/chat` 一致，立即返回任务链接，后台执行完成后结果挂到分享页上（通过 `GET /api/v1/share/{id}` 轮询 `status` 字段）。

### 部署与运维

- 支持流式响应 (SSE) 以及一键式整合 Web 前端 (自动托管 `static/` 目录)。

- **静态资源缓存策略**：`/assets/*`（带内容 hash）返回 `Cache-Control: public, max-age=31536000, immutable`，HTML 页面返回 `no-cache`，其余静态文件短缓存（1 小时），供 CDN 遵循源站。

- 检索配额由 `knowledge/rag_v1/.env` 的 `TOP_K` / `DOC_MAX` 控制（当前建议 `12/8`），修改后需重启服务。

- 服务日志会打印召回 node id（`[ChatEngine] 召回 ... ids=[...]`），用于快速回溯具体 chunk。

## 快速开始

### 1. 配置与安装

```bash
cd backend
cp .env.example .env
# 编辑 .env 文件填入环境变量配置
pip install -r requirements.txt
```

### 2. 启动服务

启动后端前，请先构建前端静态资源：

```bash
cd ../frontend
npm install
npm run build
cd ../backend
```

```bash
python3 main.py

# 指定端口 / host / 热重载 (开发调试)
python3 main.py --host 127.0.0.1 --port 8000 --reload
# 或通过环境变量 export PORT=8000 && python3 main.py
```

服务默认包含静态页面，可以通过浏览器直接访问界面和文档：

- **Web 界面**: `http://localhost:8000`

- **工具导航页**: `http://localhost:8000/all`

- **一图流文档**: `http://localhost:8000/svg`

- **奇域关卡查询**: `http://localhost:8000/wonderland`

- **Swagger API 文档**: `http://localhost:8000/docs`

### 静态资源策略

- `backend/static/` 中的前端构建产物不提交到仓库。

- 发布流程中需执行前端构建，再启动或重启后端服务。

### 3. 测试

通过 `tests/` 下的脚本可快速进行单元 / 集成测试：

```bash
# 启动服务后执行完整系统测试
export DEEPSEEK_API_KEY=your_key
./tests/test_api.sh

# Pytest 独立运行全量用例
pytest tests/ -v
```

## API 端点一览

各端点的完整请求/响应结构见 [api.md](./api.md)。

### Skill API

- `GET /api/v1/skills`：列出当前可用 skill

- `GET /api/v1/skills/miliastra-knowledge`：查看 skill 元信息和说明文档

- `POST /api/v1/skills/miliastra-knowledge/tools/get_node_info`

- `POST /api/v1/skills/miliastra-knowledge/tools/list_documents`

- `POST /api/v1/skills/miliastra-knowledge/tools/get_document`

- `POST /api/v1/skills/miliastra-knowledge/tools/rag_search`

### SVG 一图流文档 API

- `GET /api/v1/svg/index`：返回解析后的目录结构（来自 `knowledge/Miliastra-knowledge/derived/svg_index.md`）

- `GET /api/v1/svg/search?name=<关键词>[&png=true][&scale=2.0]`：按名称模糊搜索（包含/被包含），返回 SVG 或 PNG

- `GET /api/v1/svg/raw/{filename}`：按文件名精确返回原始 SVG

- `GET /api/v1/svg/related/{filename}`：按文件名或 stem 模糊匹配，返回最匹配图表的相关文档 JSON

### 奇域关卡 API

- `GET /api/v1/wonderland/level?guid=<level_id>`：查询奇域关卡详情（名称、描述、封面、视频、热度等）

- `GET /api/v1/wonderland/replies?guid=<level_id>[&max_loops=10]`：查询最近 72 小时内的评论与差评统计

### 分享与异步对话 API（依赖 `PG_URL` 数据库配置）

- `POST /api/v1/share`：创建分享，返回 `/share/{id}` 链接

- `GET /api/v1/share/{share_id}`：获取分享内容与任务状态（每次读取刷新最近访问时间，LRU 依据）

- `POST /api/v1/rag/chat/async`：发起异步对话，立即返回任务链接

