# RAG 优化实现指南

## 核心问题分析

### 当前RAG的匹配困难原因

1. **文档粒度问题**
   - 原始文档过大（平均2000-5000字）
   - 包含多个独立主题（如"单位"文档涵盖实体、元件、GUID等）
   - 向量化后语义混淆，难以精准匹配用户问题

2. **缺乏语义结构**
   - 文档间关系未显式表达
   - 没有概念层级和依赖关系
   - 用户问题与文档内容的语义距离大

3. **检索策略单一**
   - 仅依赖向量相似度
   - 缺少关键词、分类、标签等多维度检索
   - 无法处理多步骤问题

---

## 解决方案架构

### 第一层：文档预处理与提炼

#### 1.1 文档分块策略

```python
# 分块原则
- 按逻辑章节分块（# 一、 # 二、等）
- 每块保持200-500字（便于向量化）
- 保留上下文关系（添加父章节信息）
- 提取关键概念和术语

# 示例结构
{
  "doc_id": "mh2xoxrop0la",
  "title": "单位",
  "chunks": [
    {
      "chunk_id": "mh2xoxrop0la_1",
      "section": "一、基本概念",
      "subsection": "1.实体",
      "content": "实体的本质是一种集成了数据的个体...",
      "keywords": ["实体", "个体", "数据"],
      "parent_concepts": ["单位"],
      "related_docs": ["mh3ecor1x5cm", "mhufqo0c0tqw"]
    }
  ]
}
```

#### 1.2 内容提炼（使用LLM）

对每个分块执行以下提炼：

```python
EXTRACTION_PROMPT = """
请对以下文档分块进行提炼，输出JSON格式：

文档内容：
{content}

请提取：
1. 核心概念（3-5个关键词）
2. 功能说明（一句话总结）
3. 使用场景（2-3个应用场景）
4. 相关概念（可能关联的其他概念）
5. 常见问题（用户可能问的问题）

输出格式：
{
  "core_concepts": [...],
  "function_summary": "...",
  "use_cases": [...],
  "related_concepts": [...],
  "potential_questions": [...]
}
"""
```

#### 1.3 元数据增强

为每个分块添加：

```python
{
  "chunk_id": "...",
  "content": "...",
  "metadata": {
    # 分类信息
    "category": "概念介绍",  # 从category.md提取
    "subcategory": "基础概念",
    
    # 语义信息
    "core_concepts": ["实体", "元件", "GUID"],
    "function_summary": "实体是集成了数据的个体，是单位在游戏中的具象化体现",
    
    # 关系信息
    "parent_doc": "mh2xoxrop0la",
    "related_chunks": ["mh3ecor1x5cm_1", "mhufqo0c0tqw_2"],
    "prerequisite_concepts": ["单位"],
    
    # 问题映射
    "potential_questions": [
      "什么是实体？",
      "实体和元件有什么区别？",
      "如何创建实体？"
    ],
    
    # 质量指标
    "confidence": 0.95,
    "source_url": "https://act.mihoyo.com/ys/ugc/tutorial/detail/mh2xoxrop0la"
  }
}
```

---

### 第二层：向量知识库构建

#### 2.1 多层次向量化

```python
# 方案：为每个分块创建多个向量表示

class ChunkVectorizer:
    def __init__(self, embedding_model):
        self.model = embedding_model
    
    def vectorize_chunk(self, chunk):
        """为分块创建多个向量"""
        vectors = {}
        
        # 1. 内容向量（原始文本）
        vectors['content'] = self.model.embed(chunk['content'])
        
        # 2. 概念向量（核心概念+功能说明）
        concept_text = f"{' '.join(chunk['metadata']['core_concepts'])}. {chunk['metadata']['function_summary']}"
        vectors['concept'] = self.model.embed(concept_text)
        
        # 3. 问题向量（潜在问题）
        questions_text = ' '.join(chunk['metadata']['potential_questions'])
        vectors['questions'] = self.model.embed(questions_text)
        
        # 4. 上下文向量（包含相关概念）
        context_text = f"{chunk['content']} 相关概念：{' '.join(chunk['metadata']['related_concepts'])}"
        vectors['context'] = self.model.embed(context_text)
        
        return vectors
```

#### 2.2 向量数据库设计

```python
# ChromaDB 集合设计

# 集合1：内容检索（主要用于语义搜索）
collection_content = client.create_collection(
    name="guide_content",
    metadata={"hnsw:space": "cosine"}
)

# 集合2：问题映射（用于问题匹配）
collection_questions = client.create_collection(
    name="guide_questions",
    metadata={"hnsw:space": "cosine"}
)

# 集合3：概念索引（用于概念查询）
collection_concepts = client.create_collection(
    name="guide_concepts",
    metadata={"hnsw:space": "cosine"}
)

# 存储示例
collection_content.add(
    ids=[chunk_id],
    embeddings=[vectors['content']],
    documents=[chunk['content']],
    metadatas=[chunk['metadata']]
)

collection_questions.add(
    ids=[chunk_id],
    embeddings=[vectors['questions']],
    documents=[' '.join(chunk['metadata']['potential_questions'])],
    metadatas=[chunk['metadata']]
)
```

---

### 第三层：智能检索策略

#### 3.1 多策略检索

```python
class HybridRetriever:
    def __init__(self, chroma_client, embedding_model):
        self.client = chroma_client
        self.embedding = embedding_model
        self.collections = {
            'content': client.get_collection('guide_content'),
            'questions': client.get_collection('guide_questions'),
            'concepts': client.get_collection('guide_concepts')
        }
    
    def retrieve(self, query, top_k=5):
        """混合检索策略"""
        results = {}
        
        # 策略1：直接问题匹配
        results['question_match'] = self._match_questions(query, top_k)
        
        # 策略2：概念匹配
        results['concept_match'] = self._match_concepts(query, top_k)
        
        # 策略3：内容语义匹配
        results['content_match'] = self._semantic_search(query, top_k)
        
        # 策略4：关键词匹配
        results['keyword_match'] = self._keyword_search(query, top_k)
        
        # 融合结果
        return self._fuse_results(results, top_k)
    
    def _match_questions(self, query, top_k):
        """在潜在问题中查找匹配"""
        query_vec = self.embedding.embed(query)
        results = self.collections['questions'].query(
            query_embeddings=[query_vec],
            n_results=top_k
        )
        return results
    
    def _match_concepts(self, query, top_k):
        """在核心概念中查找匹配"""
        query_vec = self.embedding.embed(query)
        results = self.collections['concepts'].query(
            query_embeddings=[query_vec],
            n_results=top_k
        )
        return results
    
    def _semantic_search(self, query, top_k):
        """语义相似度搜索"""
        query_vec = self.embedding.embed(query)
        results = self.collections['content'].query(
            query_embeddings=[query_vec],
            n_results=top_k
        )
        return results
    
    def _keyword_search(self, query, top_k):
        """关键词搜索（使用BM25或简单匹配）"""
        # 提取查询中的关键词
        keywords = self._extract_keywords(query)
        
        # 在元数据中搜索
        results = []
        for collection in self.collections.values():
            for keyword in keywords:
                matches = collection.get(
                    where={"core_concepts": {"$contains": keyword}}
                )
                results.extend(matches)
        
        return results[:top_k]
    
    def _fuse_results(self, results, top_k):
        """融合多个检索结果"""
        # 使用倒数排名融合（RRF）
        fused = {}
        
        for strategy, matches in results.items():
            for rank, match in enumerate(matches['ids'][0]):
                if match not in fused:
                    fused[match] = {'score': 0, 'sources': []}
                
                # RRF公式：1 / (k + rank)
                fused[match]['score'] += 1 / (60 + rank)
                fused[match]['sources'].append(strategy)
        
        # 排序并返回top_k
        sorted_results = sorted(
            fused.items(),
            key=lambda x: x[1]['score'],
            reverse=True
        )[:top_k]
        
        return sorted_results
```

#### 3.2 查询理解与扩展

```python
class QueryUnderstanding:
    def __init__(self, llm_client):
        self.llm = llm_client
    
    def understand_query(self, query):
        """理解用户查询的意图"""
        prompt = f"""
        分析以下用户查询，输出JSON格式：
        
        查询：{query}
        
        请提取：
        1. 主要意图（what/how/why）
        2. 涉及的核心概念
        3. 可能的相关概念
        4. 查询的变体表述
        
        输出格式：
        {{
          "intent": "how",
          "core_concepts": [...],
          "related_concepts": [...],
          "query_variants": [...]
        }}
        """
        
        response = self.llm.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        
        return json.loads(response.choices[0].message.content)
    
    def expand_query(self, query, understanding):
        """扩展查询以提高检索覆盖率"""
        expanded = [query]
        
        # 添加查询变体
        expanded.extend(understanding['query_variants'])
        
        # 添加概念相关的问题
        for concept in understanding['core_concepts']:
            expanded.append(f"关于{concept}的信息")
            expanded.append(f"如何使用{concept}")
            expanded.append(f"{concept}的作用是什么")
        
        return expanded
```

---

### 第四层：答案生成与优化

#### 4.1 上下文构建

```python
class ContextBuilder:
    def build_context(self, retrieved_chunks, query):
        """为LLM构建最优上下文"""
        
        # 1. 按相关性排序
        sorted_chunks = sorted(
            retrieved_chunks,
            key=lambda x: x['score'],
            reverse=True
        )
        
        # 2. 去重和合并
        unique_chunks = self._deduplicate(sorted_chunks)
        
        # 3. 添加关系信息
        enriched_chunks = self._add_relationships(unique_chunks)
        
        # 4. 构建层级结构
        context = self._build_hierarchy(enriched_chunks)
        
        return context
    
    def _build_hierarchy(self, chunks):
        """构建文档层级结构"""
        hierarchy = {
            'primary': [],      # 直接相关
            'secondary': [],    # 间接相关
            'reference': []     # 参考信息
        }
        
        for i, chunk in enumerate(chunks):
            if i == 0:
                hierarchy['primary'].append(chunk)
            elif i < 3:
                hierarchy['secondary'].append(chunk)
            else:
                hierarchy['reference'].append(chunk)
        
        return hierarchy
```

#### 4.2 提示词优化

```python
ANSWER_PROMPT_TEMPLATE = """
你是一个专业的游戏编辑器文档助手。

用户问题：{query}

相关文档信息：

【主要相关内容】
{primary_context}

【补充相关内容】
{secondary_context}

【参考信息】
{reference_context}

请根据上述文档信息回答用户问题。要求：
1. 直接回答问题，避免冗长前言
2. 使用文档中的具体例子和术语
3. 如果涉及多个步骤，按顺序列出
4. 标注相关的文档章节（如"见《单位》文档的'基本概念'部分"）
5. 如果文档中没有相关信息，明确说明

答案：
"""

class AnswerGenerator:
    def __init__(self, llm_client):
        self.llm = llm_client
    
    def generate_answer(self, query, context):
        """生成答案"""
        
        # 构建提示词
        prompt = ANSWER_PROMPT_TEMPLATE.format(
            query=query,
            primary_context=self._format_chunks(context['primary']),
            secondary_context=self._format_chunks(context['secondary']),
            reference_context=self._format_chunks(context['reference'])
        )
        
        # 调用LLM
        response = self.llm.chat.completions.create(
            model="gpt-4",
            messages=[
                {
                    "role": "system",
                    "content": "你是一个专业的游戏编辑器文档助手，熟悉千星沙箱的各种概念和功能。"
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3,  # 降低温度以提高准确性
            max_tokens=1000
        )
        
        return response.choices[0].message.content
    
    def _format_chunks(self, chunks):
        """格式化分块为可读的文本"""
        formatted = []
        for chunk in chunks:
            formatted.append(f"""
【{chunk['metadata']['core_concepts'][0]}】
{chunk['content']}
来源：{chunk['metadata']['source_url']}
""")
        return '\n'.join(formatted)
```

---

## 实现步骤

### 第一阶段：数据预处理

```bash
# 1. 安装依赖
pip install llama-index chromadb openai pydantic

# 2. 执行文档分块和提炼
python scripts/preprocess_documents.py \
  --input_dir knowledge/guide \
  --output_dir knowledge/processed \
  --chunk_size 300 \
  --overlap 50

# 3. 生成元数据
python scripts/extract_metadata.py \
  --input_dir knowledge/processed \
  --output_dir knowledge/metadata

# 4. 验证质量
python scripts/validate_chunks.py \
  --input_dir knowledge/processed \
  --report_file knowledge/validation_report.json
```

### 第二阶段：向量库构建

```bash
# 1. 初始化向量数据库
python scripts/init_vectordb.py \
  --db_path knowledge/vectordb \
  --embedding_model text-embedding-3-small

# 2. 构建向量索引
python scripts/build_vectors.py \
  --input_dir knowledge/processed \
  --db_path knowledge/vectordb \
  --batch_size 32

# 3. 验证索引
python scripts/verify_vectors.py \
  --db_path knowledge/vectordb
```

### 第三阶段：检索系统测试

```bash
# 1. 测试单个查询
python -m rag.query "如何创建一个实体？"

# 2. 批量测试
python scripts/test_retrieval.py \
  --queries_file knowledge/test_queries.json \
  --output_file knowledge/retrieval_results.json

# 3. 评估检索质量
python scripts/evaluate_retrieval.py \
  --results_file knowledge/retrieval_results.json \
  --metrics_file knowledge/metrics.json
```

---

## 性能指标

### 检索质量指标

| 指标 | 目标 | 测量方法 |
|------|------|--------|
| **MRR@5** | > 0.8 | 相关文档在前5个结果中的排名 |
| **NDCG@10** | > 0.75 | 归一化折扣累积增益 |
| **Precision@3** | > 0.7 | 前3个结果的准确率 |
| **Recall@10** | > 0.85 | 前10个结果的召回率 |

### 答案质量指标

| 指标 | 目标 | 测量方法 |
|------|------|--------|
| **准确性** | > 0.9 | 人工评估答案的正确性 |
| **完整性** | > 0.85 | 答案是否涵盖问题的所有方面 |
| **相关性** | > 0.9 | 答案与问题的相关程度 |
| **可读性** | > 0.8 | 答案的清晰度和组织性 |

---

## 常见问题处理

### 问题1：多步骤问题

```python
# 示例：如何创建一个能攻击的角色？

# 解决方案：分解为子问题
sub_questions = [
    "如何创建角色？",
    "如何设置角色属性？",
    "如何配置攻击能力？",
    "如何使用节点图实现攻击逻辑？"
]

# 为每个子问题检索
contexts = []
for sub_q in sub_questions:
    context = retriever.retrieve(sub_q)
    contexts.append(context)

# 综合生成答案
answer = generator.generate_comprehensive_answer(
    original_query,
    sub_questions,
    contexts
)
```

### 问题2：概念关联问题

```python
# 示例：实体和元件的区别？

# 解决方案：检索两个概念的定义和关系
entity_chunks = retriever.retrieve("实体的定义")
component_chunks = retriever.retrieve("元件的定义")

# 构建对比上下文
comparison_context = {
    'entity': entity_chunks,
    'component': component_chunks,
    'relationships': retriever.retrieve("实体和元件的关系")
}

# 生成对比答案
answer = generator.generate_comparison_answer(
    query,
    comparison_context
)
```

### 问题3：操作步骤问题

```python
# 示例：如何配置战斗属性？

# 解决方案：按步骤检索
steps = [
    "打开战斗属性编辑界面",
    "配置基础战斗属性",
    "设置仇恨配置",
    "配置受击盒",
    "保存配置"
]

step_contexts = []
for step in steps:
    context = retriever.retrieve(step)
    step_contexts.append(context)

# 生成步骤式答案
answer = generator.generate_step_by_step_answer(
    query,
    steps,
    step_contexts
)
```

---

## 监控和优化

### 持续改进流程

```python
class RAGMonitor:
    def __init__(self, db_path):
        self.db = load_database(db_path)
        self.metrics = {}
    
    def log_query(self, query, retrieved_chunks, answer, user_feedback=None):
        """记录查询和反馈"""
        log_entry = {
            'timestamp': datetime.now(),
            'query': query,
            'retrieved_chunks': [c['id'] for c in retrieved_chunks],
            'answer': answer,
            'user_feedback': user_feedback,  # 用户是否满意
            'metrics': self._calculate_metrics(retrieved_chunks)
        }
        
        self.db.save_log(log_entry)
    
    def analyze_failures(self):
        """分析失败的查询"""
        failures = self.db.get_logs(user_feedback='negative')
        
        failure_patterns = {}
        for failure in failures:
            pattern = self._extract_pattern(failure['query'])
            if pattern not in failure_patterns:
                failure_patterns[pattern] = []
            failure_patterns[pattern].append(failure)
        
        return failure_patterns
    
    def suggest_improvements(self):
        """建议改进方案"""
        failures = self.analyze_failures()
        
        suggestions = []
        for pattern, cases in failures.items():
            if len(cases) > 3:  # 同一模式出现3次以上
                suggestions.append({
                    'pattern': pattern,
                    'frequency': len(cases),
                    'action': self._recommend_action(pattern)
                })
        
        return suggestions
```

---

## 总结

这个方案通过以下方式解决RAG匹配困难：

1. **文档预处理**：将大文档分解为语义完整的小块，添加丰富的元数据
2. **多层向量化**：为不同维度创建向量表示，提高检索多样性
3. **混合检索**：结合问题匹配、概念匹配、语义搜索和关键词搜索
4. **智能理解**：理解用户意图并扩展查询
5. **优化生成**：构建层级上下文，优化提示词
6. **持续改进**：监控失败案例，不断优化

预期效果：
- 检索准确率提升 **40-60%**
- 答案相关性提升 **50-70%**
- 用户满意度提升 **35-50%**
