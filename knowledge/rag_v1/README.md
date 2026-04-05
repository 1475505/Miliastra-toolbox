# RAG 知识库系统

基于 LlamaIndex 和 ChromaDB 的向量知识库构建和检索系统，专为中文技术文档优化，支持元数据过滤检索。

## 🚀 快速开始

### 0.爬取文档

目前仓库里已经放置了爬取好的文档（`guide` `tutorial` `official_faq`目录）。 如需重新爬取，请进入`spider`目录。

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
python3 rag_cli.py retrieve "如何开始使用这个系统？"

# LLM问答
python3 rag_cli.py query "什么是节点图？"
```

## 🛠️ 具体命令

```bash
# 初始化知识库
python3 rag_cli.py init [--force] [--source-dirs DIR]

# 召回文档
python3 rag_cli.py retrieve "查询内容"

# 召回 + LLM生成
python3 rag_cli.py query "问题内容"

# 查看状态
python3 rag_cli.py status

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

说明：`init --force` 会先清空集合再全量重建；当目录结构、`doc_id` 规则或分块策略变化时，建议使用该模式。

### 🧩 新增文档嵌入指南

本系统支持新嵌入单个文档进行增量更新，无需重建整个知识库。


### 输入markdown文档路径

以下路径自动增量嵌入：
- **综合指南**: `knowledge/Miliastra-knowledge/official/guide/`
- **教程**: `knowledge/Miliastra-knowledge/official/tutorial/`
- **官方常见问题**: `knowledge/Miliastra-knowledge/official/faq/`
- **论坛问答**: `knowledge/Miliastra-knowledge/bbs/`（仅 `bbs-faq*` 前缀文件）
- **用户总结**: `knowledge/Miliastra-knowledge/user/`


#### 文档格式规范

文档必须是 Markdown 格式，且**必须**包含 YAML Frontmatter（头部元数据区），用于定义 ID 和更新策略。

```markdown
---
id: mh0pppib5eyc           # [必填] 唯一文档ID。如果未填写，系统将使用文件绝对路径作为ID。
title: 常见问题的列表        # [选填] 标题
force: false               # [选填] 增量更新策略。
                           # false (默认): 如果库中已有此ID，跳过不处理。
                           # true: 即使库中已有此ID，删除旧数据并重新嵌入。
                           # 注意: `init --force` 会清空整个集合后全量重建，此字段仅影响增量模式。
---

# 问题1

答案1...
```

YAML frontmatter.id → Document.doc_id → Node.ref_doc_id → ChromaDB metadata.ref_doc_id

### 当前实际分块与元数据行为

当前 `rag_cli.py init` 的实际行为以代码为准，不再由 `CHUNKING_STRATEGY=structure|paragraph` 这类配置驱动；真正生效的是 `.env` 里的 `USE_H1_ONLY`、`MAX_CHUNK_SIZE` 和 `CHUNK_OVERLAP`。

当前默认实现如下：

1. 文档加载阶段会递归读取 Markdown 文件，提取基础文件元数据，并把 YAML frontmatter 的所有字段合并进文档元数据。
2. 正文中的 YAML frontmatter 会在分块前移除，不参与 embedding。
3. 当 `USE_H1_ONLY=True` 时，正文先按 Markdown 一级标题（`# `）切块；每个一级标题下的二级、三级标题、表格、代码块会保留在同一个 chunk 中。
4. 只有当某个一级标题块长度超过 `MAX_CHUNK_SIZE` 时，才会使用 `SentenceSplitter` 做二次切分；此时 `CHUNK_OVERLAP` 才会生效。
5. 如果一级标题前还有导语或前言文本，这一段也会被视为一个 chunk；因为没有标题，对应的 `h1_title` 会退化成 `Section N`。

当前项目里的 `.env` 示例值是：

```env
MAX_CHUNK_SIZE=4096
CHUNK_OVERLAP=200
USE_H1_ONLY=True
```

这意味着当前知识库初始化采用的是“一级标题优先、超大标题块再二次切分”的策略，而不是 README 旧版描述里的“structure/paragraph 二选一”运行时开关。

### 当前可获取的 chunk 元数据

每个 chunk 在落库前会继承完整的文档级 metadata，然后追加少量 chunk 级字段。当前可以稳定获取的元数据包括：

| 字段 | 来源 | 说明 |
|--------|------|--------|
| `file_name` | 文件系统 | 文件名 |
| `file_path` | 文件系统 | 文件绝对路径 |
| `source_dir` | 文件系统 | 文件所在目录名 |
| `id` | YAML frontmatter | 文档唯一 ID；若存在，会被用作 `Document.doc_id` |
| `title` | YAML frontmatter | 文档标题 |
| `force` | YAML frontmatter | 增量更新时是否强制重建 |
| `crawledAt` | YAML frontmatter | 爬取时间；当前数据库查询逻辑会直接读取该字段 |
| `url` | YAML frontmatter | 来源链接 |
| 其他任意 YAML 字段 | YAML frontmatter | 会原样合并进 metadata |
| `h1_title` | 分块阶段 | 当前 chunk 对应的一级标题 |
| `chunk_index` | 分块阶段 | 一级分块序号，从 0 开始 |
| `subchunk_index` | 二次切分阶段 | 超大一级标题块被再次切分后的子块序号，从 0 开始 |
| `subchunk_count` | 二次切分阶段 | 当前一级标题块最终被拆成的子块总数 |
| `ref_doc_id` | LlamaIndex | 由 `Document.doc_id` 传播到 Node/Chroma，用于判重、删除和增量更新 |

需要注意的现状：

1. 如果一个一级标题块过大并被二次切分，拆出来的多个子块会共享同一个 `chunk_index` 和 `h1_title`，但现在会额外带上 `subchunk_index` 和 `subchunk_count`。
2. `retrieve/query` 现在会返回 `doc_id`、`h1_title`、`url`、`crawledAt`、`chunk_index` 等关键字段；CLI 也会打印这些信息。
3. 当前增量更新、文档存在性检查和按文档删除，仍然是通过 `ref_doc_id` 而不是 `doc_id` metadata 字段完成的。

### 检索 API 能力

`RAGAPI`（`src/api.py`）和 `RAGEngine`（`src/rag_engine.py`）提供以下检索接口，均支持可选的 `MetadataFilters` 元数据过滤：

| 方法 | 返回值 | 用途 |
|------|--------|------|
| `RAGAPI.retrieve(question, filters)` | `Dict`（格式化的来源列表） | CLI / 外部调用，返回标准化来源信息 |
| `RAGAPI.query(question, include_answer, filters)` | `Dict`（来源 + 可选 LLM 回答） | CLI / 外部调用，retrieve + 可选答案合成 |
| `RAGEngine.retrieve_nodes(question, filters, top_k, similarity_cutoff)` | `List[NodeWithScore]` | 需要原始节点的调用方（如 backend `CombinedRetriever`） |

`MetadataFilters` 示例：

```python
from llama_index.core.vector_stores.types import MetadataFilters, MetadataFilter, FilterOperator

# 按 source_dir 过滤
filters = MetadataFilters(
    filters=[MetadataFilter(key="source_dir", value="guide", operator=FilterOperator.EQ)]
)
result = api.retrieve("如何使用节点图？", filters=filters)

# backend 的 CombinedRetriever 通过 retrieve_nodes 获取原始节点
nodes = engine.retrieve_nodes("查询内容", filters=filters, top_k=10, similarity_cutoff=0.3)
```

backend 的 `CombinedRetriever`（`backend/rag/chatEngine.py`）通过 `RAGEngine.retrieve_nodes()` 执行基于名额分配的优先级检索，不再直接访问 `rag_engine.index`。

## ⚙️ 配置说明

### 环境变量

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| **基础配置** |  |  |
| `OPENAI_API_KEY` | OpenAI API密钥 | 必填 |
| `OPENAI_BASE_URL` | OpenAI API基础URL | https://api.openai.com/v1 |
| **RAG配置** |  |  |
| `TOP_K` | 检索结果数量 | 5 |
| `DOC_MAX` | official 文档最大召回数（其余名额给 bbs/user） | 8 |
| `SIMILARITY_THRESHOLD` | 相似度阈值 | 0.3 |
| `MAX_CHUNK_SIZE` | 一级标题块的最大长度；超出后才进行二次切分 | 2048 |
| `CHUNK_OVERLAP` | 二次切分时的块重叠大小 | 200 |
| `USE_H1_ONLY` | 是否按 Markdown 一级标题优先分块 | True |

说明：运行时优先读取 `.env`，会覆盖代码默认值。修改召回配额时请同时更新 `TOP_K` / `DOC_MAX` 并重启服务。

### 分块策略说明

当前代码中的分块策略分为两种运行模式：

1. **`USE_H1_ONLY=True`（当前默认）**
    - 先按 Markdown 一级标题（`# `）切分。
    - 一个一级标题下的所有子内容尽量保持在同一个 chunk 中。
    - 只有当该 chunk 超过 `MAX_CHUNK_SIZE` 时，才会触发基于句子/段落的二次切分。
    - `CHUNK_OVERLAP` 只在这一步生效。

2. **`USE_H1_ONLY=False`**
    - 不再先按一级标题切块。
    - 直接使用 `SentenceSplitter` 按长度和句子边界进行通用切分。
    - 此模式更接近传统固定长度 chunking。

对于当前仓库里的中文技术文档，默认推荐保留 `USE_H1_ONLY=True`。

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
- **召回策略**: 向量召回 (语义相似度)
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
