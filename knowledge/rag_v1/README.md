ra# RAG 知识库系统

基于 LlamaIndex 和 ChromaDB 的向量知识库构建和检索系统，专为中文技术文档优化，支持混合召回（向量+BM25）。

## 🚀 快速开始

### 1. 环境配置

```bash
# 复制环境变量配置
cp .env.example .env

# 编辑 .env 文件，设置您的OpenAI API密钥
# OPENAI_API_KEY=your_api_key_here
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 初始化知识库

```bash
python3 rag_cli.py init
```

### 4. 开始查询

```bash
# 召回测试
python3 rag_cli.py query "如何开始使用这个系统？" --no-answer

# LLM问答
python3 rag_cli.py query "什么是节点图？"
```

## 📖 核心功能

- **向量化存储**: 将文档转换为高维向量，支持语义检索
- **混合召回**: 支持向量召回+BM25召回，提升精确匹配和语义理解
- **智能检索**: 基于相似度和关键词匹配的文档片段检索
- **问答集成**: 结合检索结果生成准确答案
- **知识库管理**: 支持增量更新、删除和版本管理

## 🛠️ 使用方式

### 命令行工具

```bash
# 初始化知识库
python3 rag_cli.py init [--force]

# 召回文档
python3 rag_cli.py retrieve "查询内容" [--max-results N] [--threshold T]

# 召回 + LLM生成
python3 rag_cli.py query "问题内容" [--max-results N] [--threshold T]

# 批量查询
python3 rag_cli.py batch_query queries.txt [--output results.json]

# 查看状态
python3 rag_cli.py status

# 健康检查
python3 rag_cli.py health

# 重建知识库
python3 rag_cli.py rebuild [--force]

# 测试单个文档的分块效果
python3 test_rag.py parse --doc path/to/your/document.md

# 测试嵌入和元数据验证（数据持久化到正式知识库）
python3 test_rag.py embed --doc path/to/your/document.md

# 测试检索功能（使用现有知识库）
python3 test_rag.py retrieve "关键词"

# 测试完整RAG查询功能（使用现有知识库）
python3 test_rag.py query "你的问题"
```


## ⚙️ 配置说明

### 环境变量

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| **基础配置** |  |  |
| `OPENAI_API_KEY` | OpenAI API密钥 | 必填 |
| `OPENAI_BASE_URL` | OpenAI API基础URL | https://api.openai.com/v1 |
| **RAG配置** |  |  |
| `TOP_K` | 检索结果数量 | 5 |
| `SIMILARITY_THRESHOLD` | 相似度阈值 | 0.6 |
| `MAX_CHUNK_SIZE` | 文本块大小 | 512 |
| `CHUNK_OVERLAP` | 块重叠大小 | 100 |
| `CHUNKING_STRATEGY` | 分块策略 | structure |
| **混合检索配置** |  |  |
| `RAG_STRATEGY` | 检索策略：vector/hybrid | vector |
| `FUSION_MODE` | 融合模式：reciprocal_rank/relative_score | reciprocal_rank |
| `VECTOR_TOP_K` | 向量检索的top_k数量 | 5 |
| `BM25_TOP_K` | BM25检索的top_k数量 | 5 |

### 检索策略说明

1. **vector（纯向量检索）**: 基于语义相似度，适合概念性问题
   - 使用向量化技术进行语义检索
   - 适合理解概念关系和上下文相似性

2. **hybrid（混合检索）**: 向量检索 + BM25检索，兼顾语义理解和精确匹配
   - 结合向量检索的语义理解能力和BM25的精确匹配能力
   - 适合技术文档的专业术语检索
   - 推荐在大多数场景下使用，提供更全面和准确的检索结果

### 融合模式说明

1. **reciprocal_rank（互序排名融合）**:
   - 基于文档在不同检索器中的排名进行融合
   - 计算公式: `1 / (k + rank)`，其中k通常为60
   - 适合大多数检索场景，默认推荐

2. **relative_score（相对评分融合）**:
   - 基于不同检索器的评分进行标准化和融合
   - 将不同检索器的评分映射到相同范围
   - 适合需要精确评分控制的场景

### 文档路径

- **源文档目录**: `knowledge/guide/` (存放markdown文档)
- **知识库存储**: `knowledge/rag_v1/data/knowledge_base/` (ChromaDB数据)

### 分块策略说明

系统支持两种分块策略：

1. **structure（结构化分块）**：基于Markdown一级标题（`#`）进行智能分块
   - 只按大标题分割，保持完整的章节内容
   - 每个分块包含完整的主题和所有子章节
   - 自动合并过短的分块，避免碎片化
   - 适合技术文档和教程类内容，提供更丰富的上下文信息

2. **paragraph（段落分块）**：基于段落和句子进行传统分块
   - 按固定字符长度分割
   - 保持段落完整性
   - 适合通用文档处理

推荐使用 `structure` 策略处理中文技术文档。

## 📊 项目结构

```
knowledge/rag_v1/
├── src/                     # 源代码
│   ├── config.py           # 配置管理
│   ├── parser.py # 文档解析处理
│   ├── db.py               # 向量数据库管理
│   ├── rag_engine.py       # RAG引擎
│   ├── api.py              # API接口
│   └── cli.py              # 命令行工具
├── rag_cli.py              # 命令行入口
├── example_usage.py        # 使用示例
├── requirements.txt        # 依赖包
├── .env.example           # 环境变量模板
└── data/knowledge_base/   # 知识库存储(自动创建)
```

## 🔧 技术栈

- **RAG框架**: LlamaIndex
- **向量数据库**: ChromaDB (嵌入式模式)
- **召回策略**: 向量召回 + BM25召回
- **嵌入模型**: BAAI/bge-m3 (中文优化)
- **对话模型**: OpenAI gpt-3.5-turbo
- **文档处理**: Markdown + YAML frontmatter

## 🧪 测试功能

### 文档分块测试
```bash
# 测试文档分块效果（不需要 API）
python3 test_rag.py parse --doc /path/to/document.md
```

### 嵌入和元数据验证
```bash
# 嵌入文档到知识库（需要嵌入模型 API）
python3 test_rag.py embed --doc /path/to/document.md
```

测试内容：
- 文档分块效果
- YAML frontmatter 元数据提取
- 向量嵌入生成
- 数据库存储验证
- 元数据完整性检查

**说明**：数据会持久化到正式知识库（`db/` 目录）

### 检索测试
```bash
# 测试向量检索（只需要嵌入模型 API）
python3 test_rag.py retrieve "小地图"
```

**说明**：只使用嵌入模型进行语义检索，不初始化 LLM

### 完整查询测试
```bash
# 测试完整 RAG 查询（需要嵌入模型 + LLM API）
python3 test_rag.py query "小地图标识是什么？"
```

**说明**：使用嵌入模型检索 + LLM 生成答案

### API 配置说明

不同测试命令的 API 需求：
- `parse`：无需 API
- `embed`：需要嵌入模型 API（OPENAI_API_KEY + OPENAI_BASE_URL）
- `retrieve`：需要嵌入模型 API
- `query`：需要嵌入模型 + LLM API

所有配置从 `.env` 文件读取。

## 📚 更多资源

- 详细使用指南: 运行 `python example_usage.py` 查看完整示例
- LlamaIndex文档: https://docs.llamaindex.ai/
- ChromaDB文档: https://docs.trychroma.com/