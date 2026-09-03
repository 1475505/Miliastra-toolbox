# 千星奇域工具箱

千星奇域工具箱是AI赋能，提升千星沙箱编辑效率的工具集合。

## 功能特性

### 知识问答

- **知识问答系统**：基于 RAG + Agent 的多轮对话，支持官方文档、教程、FAQ、社区经验的语义检索与结构化查询。

- **思考模型支持**：兼容 DeepSeek R1 等 thinking 模式模型，多轮对话与工具循环中自动回传推理内容（避免上游 400），流式展示思考过程。

- **Agent 模式**：基于 LlamaIndex FunctionAgent 的 tool-calling 引擎，内置 5 个工具（节点查询、文档列表、文档获取、知识检索、图表生成），支持流式 SSE 与工具调用链路追踪。

### 文档与可视化

- **文档预处理与派生**：通过 `process_docs.py` 对原始文档进行聚合加工，自动生成节点分类文档、FAQ 聚合、结构化索引（`index.json`）以及 69+ 张 SVG 一图流信息图，为问答和可视化提供高质量输入。

- **SVG 图表生成**：Agent 可在回答中自动生成 SVG 图表（节点关系、执行流程、逻辑结构等），经 cairosvg 转为 PNG 后内嵌展示，支持 CJK 中文字体渲染。

- **SVG 一图流文档**：基于派生文档自动生成的可视化文档浏览页（`/svg`），支持按关键词搜索、SVG/PNG 双格式输出。

### 分享与集成

- **Skill + API 能力层**：同一套千星知识查询能力同时暴露为 MCP Server 和 HTTP Skill API。

- **对话分享与异步对话**：对话可一键生成只读分享链接（`/share/:id`，PostgreSQL 存储，容量 100MB LRU 淘汰）；`POST /api/v1/rag/chat/async` 与 `POST /api/v1/agent/chat/async` 立即返回任务链接，后台执行完成后结果挂到分享页上。

- **QQ机器人**：通过 nonebot 插件提供问答服务。

## 快速使用

- **前端知识问答**: [访问地址](https://ugc.070077.xyz)（建议自带API使用）

- **一图流文档**: [访问地址](https://ugc.070077.xyz/svg)

- **QQ机器人**: 群号：1007538100（工具箱用户群）

## 部署与开发

详细的模块文档请参考各子目录的 `README.md`：

1. **[Docker 一键部署](./docker/README.md)**（推荐）
2. **源码本地启动流程**:

   - [知识库构建](./knowledge/rag_v1/README.md)

   - [前端构建](./frontend/README.md)（必需，前端构建产物不再提交到仓库）

   - [后端启动](./backend/README.md)

## 仓库策略

- 前端构建产物（`backend/static/` 下的 `index.html`、`assets/*`）不再入库。

- 部署时必须执行前端构建（`cd frontend && npm run build`），再重启后端服务。

- 仓库仅保存源码与配置，避免每次发布产生大量 hash 文件差异（delete/add）。

## Roadmap

- [ ] **数据问答系统**：集合并统计参数数据，与AI对话设计。

- [ ] **素材寻找系统**：通过多模态RAG快速寻找符合描述的素材。

> 本项目大部分代码由AI生成

## 项目结构 (Project Structure)

```text
.
├── backend/           # FastAPI 后端服务
│   ├── agent/         # Agent 引擎（FunctionAgent、图表生成、提示词）
│   ├── share/         # 对话分享与异步对话（PostgreSQL 存储 + LRU 淘汰）
│   ├── svg/           # SVG 一图流文档 API
│   ├── skill/         # Skill API（知识查询能力 HTTP 接口）
│   ├── common/        # 公共模块（LLM 配置、PG 客户端等）
│   └── ...            # RAG 对话、路由、测试
├── frontend/          # React 前端交互界面
├── mcp/               # MCP Server（知识库工具对外服务）
├── skills/            # Skill 定义与参考文档
│   └── miliastra-knowledge/ # 千星知识查询 Skill（SKILL.md + references/）
├── knowledge/         # 知识库管理
│   ├── spider/            # 官方文档爬虫
│   ├── bbs_spider/        # 论坛问答爬虫
│   ├── rag_v1/            # 向量知识库构建与 RAG 核心逻辑
│   └── Miliastra-knowledge/ # Markdown 文档资产仓库
│       ├── official/      # 官方文档（guide / tutorial / faq）
│       ├── bbs/           # 社区问答文档
│       └── derived/       # 派生文档（process_docs.py 预处理产物）
│           ├── node/      #   节点分类聚合文档
│           ├── faq/       #   FAQ 聚合文档
│           ├── svg/       #   SVG 一图流信息图（69+ 张）
│           ├── index.json #   结构化索引
│           └── svg_skill.md # SVG 一图流生成技能定义
├── docker/            # Docker Compose 部署配置
└── CLAUDE.md          # 开发与 AI 协作规范
```

