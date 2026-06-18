# 千星奇域工具箱

千星奇域工具箱是AI赋能，提升千星沙箱编辑效率的工具集合。

## 功能特性

- **知识问答系统**：基于 RAG + Agent 的多轮对话，支持官方文档、教程、FAQ、社区经验的语义检索与结构化查询。
- **文档预处理与派生**：通过 `process_docs.py` 对原始文档进行聚合加工，自动生成节点分类文档、FAQ 聚合、结构化索引（`index.json`）以及 69+ 张 SVG 一图流信息图，为问答和可视化提供高质量输入。
- **Agent 模式**：基于 LlamaIndex FunctionAgent 的 tool-calling 引擎，内置 5 个工具（节点查询、文档列表、文档获取、知识检索、图表生成），支持流式 SSE 与工具调用链路追踪。
- **SVG 图表生成**：Agent 可在回答中自动生成 SVG 图表（节点关系、执行流程、逻辑结构等），经 cairosvg 转为 PNG 后内嵌展示，支持 CJK 中文字体渲染。
- **SVG 一图流文档**：基于派生文档自动生成的可视化文档浏览页（`/svg`），支持按关键词搜索、SVG/PNG 双格式输出。
- **Skill + API 能力层**：同一套千星知识查询能力同时暴露为 MCP Server 和 HTTP Skill API。
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

## 开发计划

- [x] **知识问答系统**：支持多目录（guide + tutorial）的知识库构建和查询。
- [x] **前后端搭建**：FastAPI后端（提供免费模型）与 React前端。
- [x] **文档预处理与派生**：`process_docs.py` 自动聚合原始文档，生成节点分类文档、FAQ 聚合、结构化索引及 SVG 一图流信息图（69+ 张）。
- [x] **Agent 模式**：基于 LlamaIndex FunctionAgent 的 tool-calling 问答引擎，支持节点查询、文档检索、语义搜索等多工具协作，含流式 SSE 与迭代上限兜底。
- [x] **SVG 图表生成**：Agent 内置 `generate_diagram` 工具，自动生成 SVG 并转 PNG 嵌入回答，支持中文渲染与 SSRF 防护。
- [x] **SVG 一图流文档**：可视化文档浏览页与搜索 API，SVG/PNG 双格式输出，内容来自派生文档预处理产物。
- [x] **Skill + API 能力层**：同一套千星知识查询能力已同时暴露为 MCP Server 和 HTTP Skill API。
- [ ] **数据问答系统**：集合并统计参数数据，与AI对话设计。
- [ ] **素材寻找系统**：通过多模态RAG快速寻找符合描述的素材。

> 本项目大部分代码由AI生成

## 项目结构 (Project Structure)

```text
.
├── backend/           # FastAPI 后端服务
│   ├── agent/         # Agent 引擎（FunctionAgent、图表生成、提示词）
│   ├── svg/           # SVG 一图流文档 API
│   ├── skill/         # Skill API（知识查询能力 HTTP 接口）
│   ├── common/        # 公共模块（LLM 配置等）
│   └── ...            # RAG 对话、路由、测试
├── frontend/          # React 前端交互界面
├── mcp/               # MCP Server（知识库工具对外服务）
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
