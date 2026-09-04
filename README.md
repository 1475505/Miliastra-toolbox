# 千星奇域工具箱

https://ugc.070077.xyz

## 这是什么？

千星奇域工具箱（Miliastra Toolbox）是为 **千星沙箱** 编辑器打造的 AI 工具集合，主要包含知识库图文问答、文档检索等功能。
基于 RAG 检索增强生成、Agent 编排等技术，将奇匠学院上的文档、社区经验整合为可被 AI 理解的查询能力，帮助编辑者更高效地查找节点参数、设计关卡流程、进行游戏制作。

---

## 解决什么问题？

| 痛点 | 解决方案 |
|------|----------|
| 节点繁多，细节查找效率低 | 免去奇匠学院官方文档的翻阅成本 |
| 单纯文字回答不够直观 | Agent 自动生成 SVG 图表，内嵌在回答中 |
| 社区攻略、BBS 经验分享零散，难以检索 | 社区问答爬虫 + 向量化入库，纳入统一 RAG 检索 |
| 外部 AI 没有千星沙箱的世界知识 | 提供后端默认免费模型，或者 BYOK（Bring Your Own Key） |
| 集成到外部使用 | 可通过 QQ nonebot、Skill、MCP、Deepseek Harness 插件等使用 |

---

## 主要功能

### 知识问答 Agent

- 支持文字、图片多模态提问，AI 自动理解千星沙箱节点、道具、机制等概念
- 回答中自动生成流程图、节点关系图，直观展示执行逻辑
- 内置多种免费模型，也支持自带 API Key
- 支持多语言

### 快速提取文档和数据

- 69+ 张 SVG 一图流信息图
- 支持进行奇域数据查询和部分原神数据库查询

### 协作与分享

- 对话一键生成只读分享链接
- 笔记功能支持版本记录和点赞，积累实用经验

### 开放集成

- 可通过 MCP、Skill API、HTTP API 接入第三方工具或 AI 客户端
- 支持 AI 客户端（如 DeepSeek Harness 等插件）直接调用知识库

[Deepseek Harness 插件](https://github.com/1475505/dsh-plugin-miliastra-toolbox)
[Skill](https://skillhub.cn/skills/miliastra-toolbox)
MCP (Streaming HTTP）： http://qx-mcp.070077.xyz

---

## 部署与开发

详细的模块文档请参考各子目录的 `README.md`：

1. **[Docker 一键部署](./docker/README.md)**（推荐）
2. **源码本地启动流程**:
   - [知识库构建](./knowledge/rag_v1/README.md)
   - [前端构建](./frontend/README.md)（必需，前端构建产物不再提交到仓库）
   - [后端启动](./backend/README.md)

- 前端构建产物（`backend/static/` 下的 `index.html`、`assets/*`）不入库。
- 部署时必须执行前端构建（`cd frontend && npm run build`），再重启后端服务。

---

## 项目结构

```text
├── backend/           # FastAPI 后端
│   ├── agent/         # Agent 引擎（图表生成、提示词）
│   ├── share/         # 对话分享与异步对话
│   ├── svg/           # SVG 一图流文档
│   ├── skill/         # Skill API
│   ├── notes/         # 笔记系统
│   ├── data/          # 数据查询（物件/特效/BGM）
│   ├── translate/     # 术语翻译
│   ├── wonderland/    # 奇域信息查询
│   ├── common/        # 公共模块
│   └── main.py        # 服务入口
├── frontend/          # React 前端
├── mcp/               # MCP Server
├── skills/            # Skill 定义
│   └── miliastra-knowledge/ # 千星知识查询 Skill
├── knowledge/         # 知识库管理
│   ├── spider/            # 官方文档爬虫
│   ├── bbs_spider/        # 社区问答爬虫
│   └── Miliastra-knowledge/ # 文档资产仓库
│       ├── official/      # 官方文档
│       ├── bbs/           # 社区问答文档
│       └── derived/       # 预处理产物（节点分类、FAQ、SVG 图、索引）
├── docker/            # Docker 部署配置
└── CLAUDE.md          # 开发规范
```
