# 知识库管理系统

基于 Firecrawl API / LLamaIndex 的自动化文档爬取、处理和 RAG 检索生成系统。

> 大部分代码由AI生成，质量较低

## 模块概览

### 🕷️ Spider 模块 (`spider/`)
负责从网页源爬取内容并转换为 Markdown 格式
- **功能**: URL 发现、批量爬取、HTML 转 Markdown、元数据生成
- **详细使用**: 参见 [spider/README.md](spider/README.md)

### 🔍 RAG 模块

#### RAG v1 模块 (`rag_v1/`) - 开发中
最简单的RAG系统原型实现
- **功能**: 基础向量检索、文档分块、相似度搜索
- **特点**: 轻量级实现，适合快速原型验证和学习使用

#### RAG v2 模块 (`rag_v2/`) - 规划中
高级RAG系统，涉及文档预处理和学习提炼，比如：知识图谱、质疑评估、QA对生成......
- **规划功能**:
  - 智能文档预处理和清洗
  - 知识提炼和摘要生成
  - 高级检索策略

## 🚀 启动流程

### 1. 爬虫模块 - 生成知识库文档

详细的安装配置和使用说明请参考：[spider/README.md](spider/README.md)

```bash
cd knowledge/spider  # 进入spider模块目录
# 执行爬取命令
npm run crawl    # 爬取URL列表
npm run scrape   # 执行文档爬取
```

## 📁 项目结构

```
knowledge/
├── 📄 README.md              # 系统概览和快速开始指南
├── 🕷️ spider/               # 爬虫模块（独立环境）
├── 🔍 rag/                   # RAG 检索模块
├── 📚 rag_v1/               # RAG v1 - 简单原型实现
├── 📚 rag_v2/               # RAG v2 - 高级系统（规划中）
├── ⚙️ config/               # 配置文件
├── 📄 guide/                # 爬取的综合指南文档
└── 📄 tutorial/             # 爬取的教程文档
```

