# 知识库管理与 RAG 检索生成系统

基于 Firecrawl API 和 LlamaIndex 的自动化文档爬取、处理以及问答检索系统。

## 📁 内部模块概览

- **[Spider 模块](./spider/README.md)** (`spider/`)：负责爬取官方文档（综合指南、教程、FAQ）并解析为 Markdown 格式。
- **[BBS Spider 模块](./bbs_spider/README.md)** (`bbs_spider/`)：负责爬取米游社论坛问答集中楼的数据。
- **[RAG v1 模块](./rag_v1/README.md)** (`rag_v1/`)：RAG系统实现，囊括向量检索、文档分块和检索问答流程。
- **数据核心** (`Miliastra-knowledge/`)：真正的 Markdown 文件所存储的仓库，包括官方文档与用户投稿。

## 💡 使用指南

我们通过将不同职责划分为子模块来保持代码清晰。请根据你的需求直接进入对应子目录查看详细依赖安装与执行步骤：

1. 如果你需要**更新或爬取文档**：请移步 `spider/` 和 `bbs_spider/` 查看指引。
2. 如果你需要**构建或查询向量知识库**：请移步 `rag_v1/` 进行操作。
