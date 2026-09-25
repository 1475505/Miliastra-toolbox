# Spider 爬虫模块

负责从网页源爬取内容并转换为 Markdown 格式的核心模块。

目前支持通过firecrawl api进行爬取。

## 📁 文件结构

```
spider/
├── 📄 README.md           # 模块说明文档
├── 📦 package.json        # 依赖配置
├── 🔐 .env               # 环境变量配置
├── 🔐 .env.example        # 环境变量示例
├── ⚙️ tsconfig.json       # TypeScript 配置
├── 🚀 crawl.ts            # URL发现器 - 从种子页面提取链接
├── 📥 scrape.ts           # 批量处理器 - 并发爬取和内容转换
├── 📝 types.ts            # 类型定义 - 数据结构和接口
└── 🛠️ utils/
    ├── 🔥 firecrawl.ts    # Firecrawl API集成封装
    ├── 📂 documentPath.ts # 文档落盘路径规则
    └── 🚦 filterConfig.ts # 主库过滤与分流（divert）规则
```

## 📖 源页面

- **综合指南**: https://act.mihoyo.com/ys/ugc/tutorial/detail/mh29wpicgvh0
- **教程**: https://act.mihoyo.com/ys/ugc/tutorial/course/detail/mhhw2l08o6qo
- **常见问题**：https://act.mihoyo.com/ys/ugc/tutorial/faq/detail/mhlp1cr71mae

## ✨ 核心功能

- **自动 URL 提取** - 默认解析官方 JSON 目录接口获取最新文档列表（包含更新时间）
- **Firecrawl** - 使用 Firecrawl scrape 解析文档内容
- **批量爬取** - 支持并发爬取，带进度报告和错误处理
- **过滤与分流** - 按过滤配置把指定文档从主知识库分流到独立目录（`client/`），并做正文红删
- **Markdown 生成** - 自动生成带前置元数据的 Markdown 文件

## 🔧 环境配置

### 环境要求
- Node.js 18+
- Firecrawl API Key

### 安装依赖
```bash
cd knowledge/spider  # 进入spider模块目录
npm install
```

### 环境变量配置
```bash
# 创建环境变量文件
cp .env.example .env
```

编辑 `.env`：
```bash
# Firecrawl API（必需）
FIRECRAWL_API_KEY=your-firecrawl-key

# 硅基流动 API（用于 Embedding 生成），可以通过修改base_url使用其他模型服务
SILICONFLOW_API_KEY=sk-abcdefg
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
EMBEDDING_MODEL=BAAI/bge-m3
```

## 🚀 使用指南

### 1. 爬取 URL 列表

默认模式（推荐）：直接解析官方 JSON 目录，速度快且包含更新时间。
```bash
# 爬取综合指南页面
npm run crawl -- --type=guide

# 爬取教程页面
npm run crawl -- --type=tutorial

# 爬取官方常见问题页面
npm run crawl -- --type=official_faq

# 爬取所有类型（默认）
npm run crawl
```

Firecrawl 模式（旧版）：使用 Firecrawl 爬虫自动发现链接。
```bash
# 使用 Firecrawl 模式爬取
npm run crawl -- --mode=firecrawl

# 指定类型并使用 Firecrawl 模式
npm run crawl -- --type=guide --mode=firecrawl
```

### 2. 执行文档爬取
```bash
# 完整爬取（推荐，默认并发度=1）
npm run scrape

# 测试模式（只处理前5个文档，避免消耗大量API额度）
npm run scrape -- --test

# 指定测试数量
npm run scrape -- --test --limit=10

# 按文档 ID 补抓失败项
npm run scrape -- --ids=mho82r0ip7v4 --since=2026-08-13 --force --filter-config=../config/filtered-7.1.json

# 自定义并发度（需根据API计划调整）
npm run scrape -- --concurrency=2

# 强制重新爬取（覆盖已存在的文件）
npm run scrape -- --force

# 7.1 更新：客户端控件/脚本文档分流到 client/，主知识库只保留旧版界面控件
npm run crawl -- --filter-config=../config/filtered-7.1.json
npm run scrape -- --since=2026-08-13 --force --filter-config=../config/filtered-7.1.json

# 筛选更新时间（默认 2025.10.25）推荐使用，配合--force
npm run scrape -- --since=2026.08.13
```

> 上次更新时间: 2026-09-24（7.1 分流更新）

**参数说明**：
- `--test`: 测试模式，限制处理文档数量
- `--limit=N`: 测试模式下处理的文档数量（默认5）
- `--concurrency=N`: 并发爬取数量（默认1，Free Plan限制2）
- `--force`: 强制覆盖已存在的文件
- `--filter-config=path`: 读取过滤配置；7.1 配置把 10 篇客户端控件/客户端脚本文档**分流**到 `client/` 目录（不进主目录、`title.json` 与向量库，改由对外工具 `list_client_documents` / `get_client_document` 按需获取），4 篇旧版界面控件文档保留原内容不跟进 7.1 改写，并从 7.1 更新日志删去两个相关专题、从节点文档删去客户端脚本信号章节。目录生成与正文抓取必须使用同一配置；`crawl` 会额外产出 `config/urls-<divertScope>.json`（如 `urls-client.json`），`scrape` 会自动读取。页面代理失败时抓取器会尝试官方静态正文。
- `--since=DATE`: 只处理目录中 `updated_at` 晚于该日期的文档（格式：YYYY.MM.DD 或 YYYY-MM-DD，默认 2025.10.25）。仅当本地文件 `crawledAt` 不早于目录中的 `updated_at` 时跳过；与 `--force` 合用时会重新抓取候选文档，并只在正文变化时覆盖。

### 3. 增量更新向量知识库
```bash
cd ../rag_v1
python3 rag_cli.py init
```

更新前先核对 Markdown 差异；`init --force` 会清空并全量重建集合，此处无需使用。

## 📝 生成的 Markdown 格式

每个生成的 Markdown 文件都包含完整的前置元数据：

```markdown
---
id: doc-xxx
title: 文档标题
url: https://...
sourceURL: https://...
description: 描述
language: zh
scope: tutorial
crawledAt: 2025-10-28T...
---

# 文档内容...
```

`knowledge/config/urls-*.json` 中的每个条目也会包含 `localPath` 字段，用于指向 `knowledge/` 目录下对应的本地 Markdown 相对路径。当前文档资产存放在 `Miliastra-knowledge` 子模块中，例如 `Miliastra-knowledge/official/guide/mh29wpicgvh0_读前须知.md`。

## 🗂️ 输出结构

爬取完成后，会在上级目录生成以下结构：

```
knowledge/
├── 📚 Miliastra-knowledge/ # 文档资产子模块
│   ├── official/
│   │   ├── guide/          # 综合指南文档
│   │   ├── tutorial/       # 教程文档
│   │   └── faq/            # 官方常见问题文档
│   └── client/             # 7.1 分流：客户端控件/脚本文档（不进向量库）
├── ⚙️ config/              # URL配置文件
│   ├── urls-guide.json
│   ├── urls-tutorial.json
│   ├── urls-official_faq.json
│   └── urls-client.json    # 分流文档目录（对外工具专用）
└── 🕷️ spider/              # 当前模块（独立环境）
    ├── 📦 package.json
    ├── 🔐 .env
    ├── ⚙️ tsconfig.json
    └── ...其他文件
```



- 增加网页内容哈希值，用于后续增量更新
