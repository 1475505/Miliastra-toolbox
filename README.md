# 千星奇域工具箱

## 这是什么？

千星奇域工具箱（Miliastra Toolbox）是为 **千星奇域（Miliastra）** UGC 编辑器打造的 AI 工具集合。它基于 RAG 检索增强生成、Agent 工具调用、多模态文档解析等技术，将碎片化的游戏文档、社区经验、关卡数据整合为可被 AI 理解的查询能力，帮助编辑者更高效地查找节点参数、设计关卡流程、理解游戏机制。

> 千星奇域是一款类《马里奥制造》的 UGC 沙箱游戏，编辑器内节点种类繁多，官方文档分散，社区经验分散——这正是本项目的切入点。

---

## 解决什么问题？

| 痛点 | 解决方案 |
|------|----------|
| 节点参数繁多，官方文档按页面组织，查找效率低 | RAG 语义检索 + 元数据过滤，一次提问直接命中相关内容 |
| 同类节点/道具功能相似，容易混淆 | 节点聚合文档（节点分类 + 参数对比） |
| 流程图、节点图需要手绘或截图，维护成本高 | Agent 自动生成 SVG 图表，内嵌在回答中 |
| 多语言翻译查询费时费力 | 15 语言术语表 API（SQLite FTS5 + rapidfuzz），精确/模糊双模式 |
| 社区攻略、BBS 经验分享零散，难以检索 | 社区问答爬虫 + 向量化入库，纳入统一 RAG 检索 |
| 想用 AI 辅助但不想折腾配置 | 客户端 BYOK（Bring Your Own Key），或直接使用后端默认免费模型 |
| 与他人协作需要分享问答结果 | 一键生成只读分享链接，含工具调用链路，团队可查看完整上下文 |
| 想在 QQ 群中使用 | 内置 NoneBot 插件，直接在群聊中调用 |

---

## 技术特点与模块介绍

### 核心能力层

#### 1. RAG 对话引擎（`backend/rag/`）

基于 LlamaIndex 的检索增强生成管线，核心特性：

- **混合检索策略**：官方文档权重优先，BBS 帖子补充召回（`CombinedRetriever`）
- **多轮对话**：上下文历史 + Token 消耗统计
- **思考模式模型**：兼容 DeepSeek R1 等带 `reasoning_content` 的模型，自动回传推理内容避免 400，流式接口 SSE 推送 `reasoning` 增量事件
- **多模态输入**：支持图片 Base64 输入（多图），自动 OCR 提取内容参与检索

#### 2. Agent 引擎（`backend/agent/`）

基于 LlamaIndex `FunctionAgent` 的 tool-calling 模式，提供 6 个内置工具：

| 工具 | 职责 |
|------|------|
| `get_node_info` | 节点名称列表 → 返回说明、参数、所属文档 |
| `list_documents` | 列出文档标题/路径，支持关键词模糊过滤 |
| `get_document` | 输入文档标题，返回全文 + 相关节点匹配 |
| `search_knowledge` | 向量语义检索，兜底回答能力 |
| `generate_diagram` | 生成 SVG 流程图，cairosvg 转 PNG，内嵌在回答中 |
| `translate_terms` | 术语翻译校准，支持 15 语言双向查询 |

- 流式 SSE 推送 `tool_call` / `tool_result` / `token` 事件
- 支持 `auto_share` 自动生成分享链接

#### 3. 知识库构建（`knowledge/`）

- **官方文档爬虫**（`spider/`）：自动抓取千星奇域官方文档
- **社区问答爬虫**（`bbs_spider/`）：爬取论坛 BBS 问答帖子
- **文档预处理**（`rag_v1/`）：`process_docs.py` 对原始文档聚合加工，生成：
  - 节点分类文档（按节点类型汇总参数）
  - FAQ 聚合文档（高频问题索引）
  - `index.json` 结构化索引
  - **69+ 张 SVG 一图流信息图**

#### 4. 分享与异步对话（`backend/share/`）

- **对话分享**：对话保存到 PostgreSQL，生成 `/share/{id}` 只读链接，支持 Base64 图片剥离、LRU 淘汰
- **异步对话**：`/rag/chat/async` 和 `/agent/chat/async` 立即返回任务链接，后台完成后挂到分享页，前端通过轮询 `status` 字段获取结果

#### 5. Skill + API 能力层（`backend/skill/`、`mcp/`）

同一套千星知识查询能力，双对外接口：

- **HTTP Skill API**（`backend/skill/`）：skill 发现、skill 详情、4 个知识工具直接调用
- **MCP Server**（`mcp/`）：支持 LLM 客户端直接调用知识工具（Claude Desktop 等）

#### 6. SVG 一图流文档（`backend/svg/`）

- 按名称模糊搜索 SVG 信息图
- 支持 SVG/PNG 双格式输出
- 按文件名获取相关文档链接（知识库关联）

#### 7. 其他能力

- **笔记系统**（`backend/notes/`）：CRUD + 版本控制（`id + version` 联合主键）+ IP 点赞防刷
- **数据查询**（`backend/data/`）：物件/特效/背景音乐按 ID 或中文名查询（Supabase）
- **术语翻译**（`backend/translate/`）：15 语言术语表，SQLite FTS5 + rapidfuzz 模糊匹配
- **奇域关卡**（`backend/wonderland/`）：查询关卡详情 + 最近 72 小时评论与差评统计
- **图片上传**（`backend/upload/`）：前端图片上传到 COS

### 前端（`frontend/`）

- **React + TailwindCSS + Vite** 开发
- **多语言 i18n**：15 语言（chs、cht、de、en、es、fr、id、it、jp、kr、pt、ru、th、tr、vi）
- 六个主页面：知识问答、工具调用、笔记、数据查询、一图流文档、奇域关卡
- 对话分享弹窗（复制链接 + 浏览器打开）
- 客户端 BYOK 配置 + localStorage 持久化对话历史

---

## Quick Start

### 方式一：Docker 一键部署（推荐）

```bash
cd docker

docker build -t dudukl/miliastra-toolbox:latest .
```

修改 `docker-compose.yml`，设置 `OPENAI_API_KEY`：

```bash
docker-compose up -d
```

访问 `http://localhost:8000`。

详细说明见 [`docker/README.md`](./docker/README.md)。

---

### 方式二：源码本地启动

#### 1. 构建知识库（首次运行前）

```bash
cd knowledge/rag_v1
# 参见 knowledge/rag_v1/README.md 完成文档预处理和向量化
```

#### 2. 构建前端

```bash
cd frontend
npm install
npm run build
# 产物输出到 backend/static/，构建产物不入库
```

#### 3. 配置并启动后端

```bash
cd backend
cp .env.example .env
# 编辑 .env 填入环境变量

pip install -r requirements.txt
python3 main.py
# 开发模式：python3 main.py --reload --port 8000
```

### 在线体验

- **知识问答界面**：[https://ugc.070077.xyz](https://ugc.070077.xyz)（建议自带 API Key）
- **一图流文档**：[https://ugc.070077.xyz/svg](https://ugc.070077.xyz/svg)
- **QQ 机器人**：群号 `1007538100`

---

## 部署与开发

详细模块文档请参考各子目录的 `README.md`：

- [Docker 一键部署](./docker/README.md)（推荐）
- [知识库构建](./knowledge/rag_v1/README.md)
- [前端构建](./frontend/README.md)
- [后端启动](./backend/README.md)

---

## 仓库策略

- 前端构建产物（`backend/static/` 下的 `index.html`、`assets/*`）不入库。
- 部署时必须执行前端构建（`cd frontend && npm run build`），再重启后端服务。
- 仓库仅保存源码与配置，避免每次发布产生大量 hash 文件差异。

---

## Roadmap

- [ ] **数据问答系统**：集合并统计参数数据，与 AI 对话设计
- [ ] **素材寻找系统**：通过多模态 RAG 快速寻找符合描述的素材

> 本项目大部分代码由 AI 生成

---

## 项目结构

```text
.
├── backend/           # FastAPI 后端服务
│   ├── agent/         # Agent 引擎（FunctionAgent、图表生成、提示词）
│   ├── rag/           # RAG 对话引擎
│   ├── share/         # 对话分享与异步对话（PostgreSQL 存储 + LRU 淘汰）
│   ├── svg/           # SVG 一图流文档 API
│   ├── skill/         # Skill API（知识查询能力 HTTP 接口）
│   ├── notes/         # 笔记系统（版本控制 + 点赞）
│   ├── data/          # 数据查询 API（物件/特效/BGM）
│   ├── translate/     # 术语翻译 API（15 语言）
│   ├── wonderland/    # 奇域关卡查询 API
│   ├── upload/        # 图片上传 API
│   ├── common/        # 公共模块（LLM 配置、PG 客户端等）
│   ├── tests/         # 测试用例
│   └── main.py        # 服务入口
├── frontend/          # React 前端交互界面（TailwindCSS + Vite）
├── mcp/               # MCP Server（知识库工具对外服务）
├── skills/            # Skill 定义与参考文档
│   └── miliastra-knowledge/ # 千星知识查询 Skill
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
