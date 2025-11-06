# RAG 查询优化和最佳实践指南

## 一、查询优化策略

### 1. 查询改写（Query Rewriting）

直接的用户查询往往不够精确，需要通过改写来提高检索效果。

#### 问题分析
```
用户查询: "怎样做一个攻击？"
问题: 过于简洁，缺乏上下文

改写后:
- "如何在节点图中配置攻击盒攻击能力单元？"
- "怎样通过命中检测组件实现攻击效果？"
- "能力单元中的直接攻击和攻击盒攻击有什么区别？"
```

#### 实现方法

**多角度查询扩展**
```python
def expand_query(user_query: str) -> List[str]:
    """
    将单一查询扩展为多个相关查询
    """
    queries = [
        user_query,  # 原始查询
        f"什么是{extract_key_concept(user_query)}",  # 概念查询
        f"如何使用{extract_key_concept(user_query)}",  # 使用方法
        f"{extract_key_concept(user_query)}的配置参数有哪些",  # 参数查询
        f"{extract_key_concept(user_query)}和其他功能的区别",  # 对比查询
    ]
    return queries
```

**查询分类和路由**
```
查询类型识别:
1. 概念查询 → 检索定义和基础概念文档
2. 操作查询 → 检索步骤和教程文档
3. 参数查询 → 检索配置表和参数说明
4. 对比查询 → 检索多个相关文档进行对比
5. 故障排查 → 检索常见问题和解决方案
```

### 2. 上下文感知检索

#### 维护查询历史
```python
class ContextAwareRetriever:
    def __init__(self):
        self.query_history = []
        self.context_window = 5  # 保留最近5个查询
    
    def retrieve_with_context(self, query: str, top_k: int = 5):
        """
        基于查询历史的上下文感知检索
        """
        # 1. 分析查询与历史的关系
        related_queries = self.find_related_queries(query)
        
        # 2. 构建增强查询
        enhanced_query = self.build_enhanced_query(query, related_queries)
        
        # 3. 执行检索
        results = self.retriever.retrieve(enhanced_query, top_k)
        
        # 4. 记录查询
        self.query_history.append(query)
        
        return results
```

#### 对话式检索
```
用户: "怎样配置攻击？"
系统: 检索到 [能力单元, 命中检测, 战斗设置]

用户: "那参数怎么设置？"
系统: 理解为 "能力单元的参数怎么设置？"
检索到 [能力单元详细参数, 配置示例]

用户: "和直接攻击有什么区别？"
系统: 理解为 "攻击盒攻击和直接攻击有什么区别？"
检索到 [能力单元类型对比, 使用场景]
```

### 3. 混合检索策略

#### 关键词 + 语义混合
```python
def hybrid_retrieve(query: str, top_k: int = 5):
    """
    结合关键词检索和语义检索
    """
    # 1. 关键词检索（BM25）
    keyword_results = bm25_retriever.retrieve(query, top_k=10)
    
    # 2. 语义检索（向量相似度）
    semantic_results = vector_retriever.retrieve(query, top_k=10)
    
    # 3. 结果融合（RRF - Reciprocal Rank Fusion）
    merged_results = reciprocal_rank_fusion(
        keyword_results, 
        semantic_results,
        top_k=top_k
    )
    
    return merged_results
```

#### 多层次检索
```
第一层: 快速过滤
- 使用关键词和元数据快速定位相关文档类别
- 返回候选文档集合

第二层: 精细匹配
- 对候选文档进行语义相似度计算
- 返回排序后的结果

第三层: 上下文补充
- 检索相关文档的前后文档
- 提供更完整的上下文
```

---

## 二、检索结果优化

### 1. 结果重排序（Reranking）

#### 基于相关性的重排序
```python
def rerank_results(query: str, results: List[Document]) -> List[Document]:
    """
    使用交叉编码器重排序检索结果
    """
    # 计算每个结果与查询的相关性分数
    scores = []
    for doc in results:
        score = cross_encoder.predict(query, doc.content)
        scores.append(score)
    
    # 按分数排序
    ranked_results = sorted(
        zip(results, scores),
        key=lambda x: x[1],
        reverse=True
    )
    
    return [doc for doc, score in ranked_results]
```

#### 基于文档质量的重排序
```python
def quality_rerank(results: List[Document]) -> List[Document]:
    """
    基于文档质量指标重排序
    """
    quality_scores = {}
    
    for doc in results:
        score = 0
        
        # 1. 文档长度（适中最好）
        length = len(doc.content)
        score += 1.0 if 500 < length < 5000 else 0.5
        
        # 2. 结构完整性（有标题、表格等）
        if has_structure(doc.content):
            score += 1.0
        
        # 3. 更新时间（最近更新优先）
        if is_recent(doc.metadata.get('updated_at')):
            score += 0.5
        
        # 4. 文档类型权重
        doc_type = doc.metadata.get('type')
        score *= type_weight.get(doc_type, 1.0)
        
        quality_scores[doc.id] = score
    
    return sorted(results, key=lambda d: quality_scores[d.id], reverse=True)
```

### 2. 结果聚合和去重

#### 去除冗余结果
```python
def deduplicate_results(results: List[Document], 
                       similarity_threshold: float = 0.8) -> List[Document]:
    """
    移除高度相似的结果
    """
    unique_results = []
    seen_embeddings = []
    
    for doc in results:
        # 计算与已有结果的相似度
        is_duplicate = False
        for seen_emb in seen_embeddings:
            similarity = cosine_similarity(doc.embedding, seen_emb)
            if similarity > similarity_threshold:
                is_duplicate = True
                break
        
        if not is_duplicate:
            unique_results.append(doc)
            seen_embeddings.append(doc.embedding)
    
    return unique_results
```

#### 结果聚类和摘要
```python
def cluster_and_summarize(results: List[Document], 
                         num_clusters: int = 3) -> List[str]:
    """
    将相似结果聚类，并为每个聚类生成摘要
    """
    # 1. 聚类
    clusters = cluster_documents(results, num_clusters)
    
    # 2. 为每个聚类生成摘要
    summaries = []
    for cluster in clusters:
        summary = generate_summary(cluster)
        summaries.append(summary)
    
    return summaries
```

---

## 三、提示词工程（Prompt Engineering）

### 1. 检索提示词优化

#### 明确的角色定义
```
系统提示词:
你是一个千星奇域编辑器的专家助手。你的任务是根据提供的文档，
准确回答用户关于游戏编辑、节点图、组件配置等方面的问题。

回答时需要:
1. 准确引用文档中的具体概念和参数
2. 提供清晰的步骤说明
3. 给出实际的配置示例
4. 指出常见的错误和陷阱
```

#### 结构化输出格式
```
用户查询: {query}

检索到的相关文档:
{retrieved_documents}

请按以下格式回答:
1. 直接答案（一句话总结）
2. 详细说明（2-3段）
3. 配置步骤（如适用）
4. 常见问题（如适用）
5. 相关链接（文档引用）
```

### 2. 上下文注入优化

#### 动态上下文构建
```python
def build_context_prompt(query: str, retrieved_docs: List[Document]) -> str:
    """
    根据检索结果动态构建上下文
    """
    context = "相关文档信息:\n\n"
    
    for i, doc in enumerate(retrieved_docs, 1):
        context += f"【文档{i}】{doc.metadata.get('title', 'Untitled')}\n"
        context += f"类型: {doc.metadata.get('type', 'unknown')}\n"
        context += f"内容摘要: {doc.content[:300]}...\n"
        context += f"来源: {doc.metadata.get('source_url', 'N/A')}\n\n"
    
    return context
```

#### 关键信息突出
```python
def highlight_key_info(docs: List[Document], query: str) -> str:
    """
    突出显示与查询最相关的关键信息
    """
    highlighted = ""
    
    for doc in docs:
        # 提取与查询相关的句子
        key_sentences = extract_relevant_sentences(doc.content, query)
        
        highlighted += f"## {doc.metadata.get('title')}\n"
        for sentence in key_sentences:
            highlighted += f"- {sentence}\n"
        highlighted += "\n"
    
    return highlighted
```

---

## 四、性能监控和优化

### 1. 检索质量指标

#### 关键指标
```python
class RetrievalMetrics:
    def __init__(self):
        self.metrics = {
            'mrr': [],  # Mean Reciprocal Rank
            'ndcg': [],  # Normalized Discounted Cumulative Gain
            'precision_at_k': [],  # Precision@K
            'recall_at_k': [],  # Recall@K
            'latency': [],  # 检索延迟
        }
    
    def calculate_mrr(self, relevant_docs: List[int], 
                     retrieved_docs: List[int]) -> float:
        """计算平均倒数排名"""
        for rank, doc_id in enumerate(retrieved_docs, 1):
            if doc_id in relevant_docs:
                return 1.0 / rank
        return 0.0
    
    def calculate_ndcg(self, relevant_docs: List[int], 
                      retrieved_docs: List[int], k: int = 5) -> float:
        """计算归一化折扣累积增益"""
        dcg = sum(
            1.0 / math.log2(i + 2) 
            for i, doc_id in enumerate(retrieved_docs[:k])
            if doc_id in relevant_docs
        )
        idcg = sum(
            1.0 / math.log2(i + 2) 
            for i in range(min(k, len(relevant_docs)))
        )
        return dcg / idcg if idcg > 0 else 0.0
```

### 2. 持续优化循环

```
1. 收集用户反馈
   ↓
2. 分析检索失败案例
   ↓
3. 识别问题根源
   ↓
4. 调整策略（查询改写、重排序、提示词等）
   ↓
5. A/B测试验证
   ↓
6. 部署优化方案
   ↓
7. 监控效果
```

---

## 五、常见问题和解决方案

### 问题1: 检索结果不相关

**症状**: 用户查询"怎样配置攻击"，返回的是"背包系统"的文档

**原因分析**:
- 查询过于简洁，缺乏上下文
- 向量模型对中文短句的理解不足
- 文档中的关键词分布不均

**解决方案**:
```python
# 1. 查询扩展
expanded_queries = [
    "如何配置攻击能力",
    "攻击盒攻击配置方法",
    "能力单元中的攻击设置",
]

# 2. 关键词增强
enhanced_query = "配置 攻击 能力单元 节点图 伤害"

# 3. 混合检索
results = hybrid_retrieve(enhanced_query)
```

### 问题2: 检索延迟过高

**症状**: 查询响应时间超过5秒

**原因分析**:
- 向量数据库查询慢
- 重排序模型推理慢
- 网络延迟

**解决方案**:
```python
# 1. 缓存热门查询
query_cache = {}

# 2. 异步处理
async def async_retrieve(query):
    results = await vector_db.async_search(query)
    return results

# 3. 分层检索（快速过滤 + 精细排序）
fast_results = bm25_retrieve(query, top_k=50)  # 快速
final_results = rerank(fast_results, top_k=5)  # 精细
```

### 问题3: 答案不准确或不完整

**症状**: 系统回答缺少关键信息或包含错误

**原因分析**:
- 检索到的文档不够完整
- LLM生成时遗漏了信息
- 文档本身质量问题

**解决方案**:
```python
# 1. 增加检索数量
results = retrieve(query, top_k=10)  # 从5增加到10

# 2. 多轮检索
initial_results = retrieve(query)
follow_up_query = generate_follow_up(query, initial_results)
additional_results = retrieve(follow_up_query)

# 3. 结果验证
verified_answer = verify_answer_with_docs(answer, results)
```

---

## 六、最佳实践总结

| 场景 | 推荐策略 | 优先级 |
|------|--------|------|
| 简短查询 | 查询扩展 + 混合检索 | 高 |
| 复杂查询 | 查询分解 + 多轮检索 | 高 |
| 对话式交互 | 上下文感知 + 历史记录 | 中 |
| 实时性要求高 | 缓存 + 快速过滤 | 高 |
| 准确性要求高 | 重排序 + 结果验证 | 高 |
| 冷启动阶段 | 规则 + 启发式方法 | 中 |

---

## 七、实现检查清单

- [ ] 实现查询改写模块
- [ ] 配置混合检索（BM25 + 向量）
- [ ] 部署重排序模型
- [ ] 建立查询历史管理
- [ ] 实现结果去重和聚类
- [ ] 优化提示词模板
- [ ] 建立监控和指标收集
- [ ] 设置A/B测试框架
- [ ] 创建反馈收集机制
- [ ] 文档化最佳实践
