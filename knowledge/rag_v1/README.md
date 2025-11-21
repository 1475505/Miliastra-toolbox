# RAG 知识库系统

基于 LlamaIndex 和 ChromaDB 的向量知识库构建和检索系统，专为中文技术文档优化，支持混合召回（向量+BM25）。

> 开发中特性：支持单个文档新增嵌入，未测试，计划「月之三」统一测试。如有bug，请提issue或暂时revert commit "rag support add doc"。

## 🚀 快速开始

### 0.爬取文档

目前仓库里已经放置了爬取好的文档（`guide` `tutorial`目录）。 如需重新爬取，请进入`spider`目录。

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
python3 rag_cli.py retrieve "如何开始使用这个系统？" --no-answer

# LLM问答（需要配置CHAT_KEY）
python3 rag_cli.py query "什么是节点图？"
```

## 🛠️ 具体命令

```bash
# 初始化知识库
python3 rag_cli.py init [--force]

# 召回文档
python3 rag_cli.py retrieve "查询内容" [--max-results N] [--threshold T]

# 召回 + LLM生成
python3 rag_cli.py query "问题内容" [--max-results N] [--threshold T]

# 查看状态
python3 rag_cli.py status

# 健康检查
python3 rag_cli.py health

# 重建知识库
python3 rag_cli.py rebuild [--force]

# 单文档嵌入
python3 rag_cli.py embed --doc path/to/your/document.md [--force]

# 检查文档是否已嵌入
python3 rag_cli.py check <doc_id>

# 测试单个文档的分块效果
python3 test_rag.py parse --doc path/to/your/document.md

# 测试嵌入和元数据验证（数据持久化到正式知识库）
python3 test_rag.py embed --doc path/to/your/document.md

# 测试检索功能（使用现有知识库）
python3 test_rag.py retrieve "关键词"

# 测试完整RAG查询 + AI问答 功能（使用现有知识库，需要配置chat key，实际只需要测试到retrieve）
python3 test_rag.py query "你的问题"
```

### 🧩 新增文档嵌入指南

本系统支持新嵌入单个文档进行增量更新，无需重建整个知识库。

#### 文档格式规范

文档必须是 Markdown 格式，且**必须**包含 YAML Frontmatter（头部元数据区），用于定义 ID 和更新策略。

```markdown
---
id: mh0pppib5eyc           # [必填] 唯一文档ID。如果未填写，系统将使用文件绝对路径作为ID。
title: 常见问题的列表        # [选填] 标题
force: false               # [选填] 更新策略。
                           # false (默认): 如果库中已有此ID，跳过不处理。
                           # true: 即使库中已有此ID，删除旧数据并重新嵌入。
---

# 问题1

答案1...
```

YAML frontmatter.id → Document.doc_id → Node.ref_doc_id → ChromaDB metadata.ref_doc_id

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

### 输入markdown文档路径

- **综合指南**: `knowledge/guide/`
- **教程**: `knowledge/tutorial/`
- **用户（非官方）总结**：`knowledge/user/` 

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

## 知识，与你分享

在使用 LlamaIndex 配合嵌入式 Chroma（ChromaDB）时，如何在 SQLite 中进行查询？

### 1. 核心概念映射

在深入 SQL 结构之前，需要理解 LlamaIndex 的对象是如何映射到 Chroma 的：

| LlamaIndex 概念 | Chroma 概念 | 说明 |
| :--- | :--- | :--- |
| **VectorStoreIndex** | **Collection** | 对应 Chroma 中的一个集合（表）。默认名字通常是 `quickstart` 或由用户指定。 |
| **Node (TextNode)** | **Item / Embedding** | LlamaIndex 将文档切分为 Node。**一个 Node 对应 Chroma 中的一行数据**。 |
| **node_id** | **id** | Node 的唯一标识符（UUID字符串）。这是去重的关键。 |
| **Node Content** | **document** | 文本块的原始内容。 |
| **Node Metadata** | **metadata** | 包含 `file_name`, `page_label` 以及 LlamaIndex 的 `_node_content` 等信息。 |
| **Embedding Vector** | **embedding** | 浮点数列表（向量）。 |

### 2. SQLite 文件中的表结构 (`chroma.sqlite3`)

当你打开持久化目录下的 `chroma.sqlite3` 文件时，最关键的两个表是 `collections` 和 `embeddings`。

#### A. `collections` 表
这张表存储了集合的信息。
*   **id**: 集合的 UUID（这是外键，用于关联其他表）。
*   **name**: 集合名称（你在 LlamaIndex 中定义的 `collection_name`）。
*   **topic**: (内部使用)

#### B. `embeddings` 表
这张表存储了具体的文档 ID 和关联信息（注意：在 Chroma 0.4+ 中，向量值本身可能不直接显示在这个表的主列中，或者以二进制 blob 存储，但 ID 在这里）。
*   **id**: 数据库内部自增主键（Integer）。
*   **segment_id**: 关联到集合或段的 UUID。
*   **embedding_id**: **这是关键字段**。它存储的是 LlamaIndex 的 `node_id`（字符串类型）。
*   **seq_id**: 序列号。
*   **created_at**: 创建时间。

#### C. `embedding_metadata` 表
这张表存储了与向量关联的元数据（如文件名）。
*   **id**: 关联到 `embeddings` 表的内部 id。
*   **key**: 元数据的键（例如 `file_name`, `ref_doc_id`）。
*   **string_value**, **int_value**, **float_value**: 元数据的值。

---

### 3. 如何判断文档是否已被嵌入

在 LlamaIndex 中，"文档"（Document）通常被切分为多个"节点"（Node）。
*   如果你想判断**某个具体的切片（Node）**是否存在，检查 `node_id`。
*   如果你想判断**某个源文件（Source Document）**是否已被处理，通常检查元数据中的 `ref_doc_id` 或 `file_name`。

LlamaIndex 会自动将源文档的 ID 放入 Node 的元数据中，通常字段名为 `ref_doc_id`，或者你可以使用 `file_name`。这需要关联 `embedding_metadata` 表。

**SQL 查询逻辑（查找特定文件名的文档是否存在）：**

```sql
SELECT 
    count(DISTINCT e.embedding_id) as chunk_count
FROM 
    embeddings e
JOIN 
    embedding_metadata em ON e.id = em.id
WHERE 
    em.key = 'file_name' 
    AND em.string_value = '你的文件名.md';
```

或者通过 LlamaIndex 的 `ref_doc_id`（源文档 ID）：

```sql
SELECT 
    count(*) 
FROM 
    embedding_metadata 
WHERE 
    key = 'ref_doc_id' 
    AND string_value = '源文档的_DOC_ID';
```
