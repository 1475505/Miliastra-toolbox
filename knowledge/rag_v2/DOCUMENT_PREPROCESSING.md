# 文档预处理和提炼策略

## 概述

直接对原始文档进行RAG检索存在的问题：
- **信息冗余**：重复的导航、元数据、格式标记
- **上下文缺失**：孤立的段落缺乏全局理解
- **检索不精准**：用户问题与文档片段的语义匹配度低
- **向量空间污染**：无关内容占用向量空间

本策略通过**分层提炼**和**智能分块**来优化RAG效果。

---

## 第一层：文档级提炼（Document-Level Refinement）

### 目标
为每个文档生成结构化的元数据和摘要，帮助RAG系统理解文档的全局语义。

### 实现步骤

#### 1. 自动提取文档元数据
```python
# 提取的元数据示例
{
  "doc_id": "mh0ucw9e76f6",
  "title": "能力单元",
  "category": "概念介绍",
  "keywords": ["能力单元", "攻击", "特效", "节点图"],
  "related_docs": ["mh2pir0hat1s", "mhciimiw86jg"],
  "difficulty": "intermediate",
  "use_cases": ["战斗系统", "技能设计", "特效播放"]
}
```

**提取方法**：
- 从YAML frontmatter中获取基础信息
- 使用LLM分析文档内容，提取关键词和用途
- 建立文档关系图（通过链接和引用）

#### 2. 生成文档摘要
```markdown
## 文档摘要（由LLM生成）

**核心概念**：能力单元是预定义的能力数据集合，可被节点图、命中检测等模块调用。

**主要类型**：
- 攻击盒攻击：以指定目标或位置为基准发起攻击
- 直接攻击：对指定目标发起直接攻击
- 播放特效：播放限时特效
- 创建本地投射物：创生投射物
- 添加/移除单位状态：状态管理
- 销毁自身：销毁实体
- 恢复生命：生命恢复

**调用入口**：
1. 服务端节点图直接调用（支持攻击、恢复）
2. 命中检测组件命中时调用
3. 本地投射物命中/销毁时调用

**常见问题**：
- Q: 如何在节点图中调用能力单元？
  A: 使用【发起攻击】或【恢复生命】节点
- Q: 能力单元支持哪些类型？
  A: 见上述主要类型列表
```

**生成方法**：
```python
def generate_document_summary(doc_content: str, doc_title: str) -> str:
    """使用LLM生成文档摘要"""
    prompt = f"""
    请为以下文档生成结构化摘要，包括：
    1. 核心概念（1-2句）
    2. 主要内容点（3-5个要点）
    3. 常见问题和答案（2-3个Q&A）
    
    文档标题：{doc_title}
    文档内容：
    {doc_content}
    """
    return llm.generate(prompt)
```

#### 3. 建立文档关系图
```json
{
  "mh0ucw9e76f6_能力单元": {
    "references": [
      "mh2pir0hat1s_命中检测",
      "mhciimiw86jg_本地投射物",
      "mhuto3r800b2_服务器节点"
    ],
    "referenced_by": [
      "mhrvqvioautg_能力单元效果",
      "mh0pppib5eyc_小地图标识"
    ],
    "related_concepts": [
      "mh2xoxrop0la_单位",
      "mh3ecor1x5cm_角色"
    ]
  }
}
```

---

## 第二层：段落级提炼（Paragraph-Level Refinement）

### 目标
将文档分解为语义完整的段落单元，每个单元包含上下文信息。

### 实现步骤

#### 1. 智能分块策略

**方案A：基于语义的分块**
```python
def semantic_chunking(doc_content: str, chunk_size: int = 512) -> List[str]:
    """
    基于语义边界的分块，而不是固定大小
    """
    # 1. 按标题/小节分割
    sections = split_by_headers(doc_content)
    
    # 2. 对每个小节进行进一步分割
    chunks = []
    for section in sections:
        if len(section) > chunk_size:
            # 使用LLM识别逻辑段落边界
            sub_chunks = split_by_semantic_boundary(section)
            chunks.extend(sub_chunks)
        else:
            chunks.append(section)
    
    return chunks
```

**方案B：混合分块（推荐）**
```python
def hybrid_chunking(doc_content: str, 
                   doc_title: str,
                   doc_metadata: dict) -> List[Dict]:
    """
    结合多种策略的混合分块
    """
    chunks = []
    
    # 1. 按结构分割（标题、表格、代码块）
    structural_chunks = split_by_structure(doc_content)
    
    for struct_chunk in structural_chunks:
        # 2. 对大块进行语义分割
        if len(struct_chunk) > 800:
            semantic_chunks = split_by_semantic_boundary(struct_chunk)
        else:
            semantic_chunks = [struct_chunk]
        
        # 3. 为每个chunk添加上下文
        for chunk in semantic_chunks:
            enriched_chunk = {
                "content": chunk,
                "doc_id": doc_metadata["doc_id"],
                "doc_title": doc_title,
                "category": doc_metadata["category"],
                "context": extract_context(chunk, doc_content),
                "chunk_type": identify_chunk_type(chunk),
                "keywords": extract_keywords(chunk)
            }
            chunks.append(enriched_chunk)
    
    return chunks
```

#### 2. 上下文增强

为每个chunk添加上下文信息，帮助RAG系统理解片段的含义：

```python
def enrich_chunk_with_context(chunk: str, 
                              doc_content: str,
                              doc_title: str) -> Dict:
    """
    为chunk添加多层次的上下文信息
    """
    return {
        "content": chunk,
        "context": {
            # 文档级上下文
            "document": {
                "title": doc_title,
                "section": extract_section_title(chunk, doc_content),
                "breadcrumb": extract_breadcrumb(chunk, doc_content)
            },
            # 语义上下文
            "semantic": {
                "summary": generate_chunk_summary(chunk),
                "keywords": extract_keywords(chunk),
                "entities": extract_entities(chunk)
            },
            # 关系上下文
            "relations": {
                "previous_chunk": get_previous_chunk(chunk, doc_content),
                "next_chunk": get_next_chunk(chunk, doc_content),
                "related_chunks": find_related_chunks(chunk, doc_content)
            }
        }
    }
```

#### 3. 特殊内容处理

**表格处理**：
```python
def process_table(table_html: str, context: str) -> str:
    """
    将表格转换为自然语言描述
    """
    # 1. 解析表格结构
    rows, cols = parse_table(table_html)
    
    # 2. 生成自然语言描述
    description = f"""
    {context}
    
    表格内容：
    """
    for row in rows:
        description += f"- {' | '.join(row)}\n"
    
    return description
```

**代码块处理**：
```python
def process_code_block(code: str, language: str, context: str) -> str:
    """
    为代码块添加说明
    """
    return f"""
    {context}
    
    代码示例（{language}）：
    ```{language}
    {code}
    ```
    """
```

**列表处理**：
```python
def process_list(items: List[str], list_type: str, context: str) -> str:
    """
    将列表转换为更易理解的格式
    """
    if list_type == "definition":
        # 定义列表：转换为"X是..."的形式
        return "\n".join([f"{item[0]}是{item[1]}" for item in items])
    elif list_type == "procedure":
        # 步骤列表：添加序号和说明
        return "\n".join([f"步骤{i+1}：{item}" for i, item in enumerate(items)])
    else:
        return "\n".join([f"- {item}" for item in items])
```

---

## 第三层：查询优化（Query-Level Optimization）

### 目标
在检索前对用户查询进行预处理和扩展，提高检索精准度。

### 实现步骤

#### 1. 查询理解和扩展

```python
def expand_query(user_query: str, knowledge_graph: Dict) -> List[str]:
    """
    扩展用户查询，生成多个检索变体
    """
    expanded_queries = [user_query]
    
    # 1. 同义词扩展
    synonyms = find_synonyms(user_query, knowledge_graph)
    expanded_queries.extend(synonyms)
    
    # 2. 概念扩展
    concepts = extract_concepts(user_query)
    for concept in concepts:
        related = find_related_concepts(concept, knowledge_graph)
        expanded_queries.extend(related)
    
    # 3. 问题改写
    rephrased = rephrase_question(user_query)
    expanded_queries.extend(rephrased)
    
    return list(set(expanded_queries))
```

#### 2. 查询分类

```python
def classify_query(query: str) -> Dict:
    """
    对查询进行分类，确定最佳检索策略
    """
    return {
        "query_type": identify_query_type(query),  # how-to, what-is, why, etc.
        "domain": identify_domain(query),  # combat, ui, node-graph, etc.
        "complexity": assess_complexity(query),  # simple, moderate, complex
        "intent": identify_intent(query)  # learning, troubleshooting, reference
    }
```

#### 3. 动态检索策略

```python
def retrieve_with_strategy(query: str, 
                          query_classification: Dict,
                          vector_db: VectorDB) -> List[Dict]:
    """
    根据查询分类选择最佳检索策略
    """
    if query_classification["query_type"] == "how-to":
        # 优先检索教程和步骤
        return vector_db.search(
            query,
            filters={"chunk_type": ["procedure", "tutorial"]},
            top_k=5
        )
    elif query_classification["query_type"] == "what-is":
        # 优先检索定义和概念
        return vector_db.search(
            query,
            filters={"chunk_type": ["definition", "concept"]},
            top_k=3
        )
    else:
        # 通用检索
        return vector_db.search(query, top_k=5)
```

---

## 第四层：检索后处理（Post-Retrieval Processing）

### 目标
对检索结果进行重排和融合，提高最终答案质量。

### 实现步骤

#### 1. 结果重排

```python
def rerank_results(query: str, 
                   retrieved_chunks: List[Dict],
                   reranker_model) -> List[Dict]:
    """
    使用交叉编码器重排检索结果
    """
    scores = []
    for chunk in retrieved_chunks:
        score = reranker_model.score(query, chunk["content"])
        scores.append(score)
    
    # 按相关性重排
    ranked = sorted(
        zip(retrieved_chunks, scores),
        key=lambda x: x[1],
        reverse=True
    )
    
    return [chunk for chunk, score in ranked]
```

#### 2. 结果融合

```python
def fuse_results(retrieved_chunks: List[Dict]) -> str:
    """
    将多个检索结果融合成连贯的上下文
    """
    # 1. 去重
    unique_chunks = deduplicate(retrieved_chunks)
    
    # 2. 按逻辑顺序排序
    ordered = order_by_logic(unique_chunks)
    
    # 3. 添加过渡句
    fused = add_transitions(ordered)
    
    return fused
```

#### 3. 质量评估

```python
def assess_retrieval_quality(query: str,
                            retrieved_chunks: List[Dict]) -> Dict:
    """
    评估检索结果的质量
    """
    return {
        "coverage": calculate_coverage(query, retrieved_chunks),
        "relevance": calculate_relevance(query, retrieved_chunks),
        "diversity": calculate_diversity(retrieved_chunks),
        "confidence": calculate_confidence(query, retrieved_chunks)
    }
```

---

## 实现优先级

### Phase 1（必需）
- [x] 文档元数据提取
- [x] 基础分块和上下文增强
- [x] 查询扩展

### Phase 2（推荐）
- [ ] 文档摘要生成
- [ ] 特殊内容处理（表格、代码）
- [ ] 查询分类和动态策略

### Phase 3（可选）
- [ ] 结果重排
- [ ] 高级融合策略
- [ ] 质量评估和反馈循环

---

## 工具和库

```python
# 文本处理
from langchain.text_splitter import RecursiveCharacterTextSplitter
from sentence_transformers import CrossEncoder

# LLM集成
from llama_index import Document, VectorStoreIndex
from openai import OpenAI

# 向量数据库
from chromadb import Client

# 数据处理
import pandas as pd
from bs4 import BeautifulSoup
```

---

## 配置示例

```yaml
# preprocessing_config.yaml
document_level:
  extract_metadata: true
  generate_summary: true
  build_relation_graph: true

paragraph_level:
  chunking_strategy: "hybrid"
  chunk_size: 512
  overlap: 50
  enrich_context: true
  
special_content:
  process_tables: true
  process_code: true
  process_lists: true

query_level:
  expand_queries: true
  classify_queries: true
  dynamic_strategy: true

post_retrieval:
  rerank: true
  fuse_results: true
  assess_quality: true
```
