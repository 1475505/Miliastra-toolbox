# RAG 优化实现指南

## 概述

本指南提供了完整的代码实现示例，用于优化知识库的组织和RAG检索效果。

## 1. 文档预处理实现

### 1.1 Python 实现（推荐）

```python
# rag_v1/document_processor.py
import os
import json
import re
from pathlib import Path
from typing import Dict, List, Tuple
from dataclasses import dataclass

@dataclass
class DocumentMetadata:
    """文档元数据"""
    doc_id: str
    title: str
    category: str
    subcategory: str
    keywords: List[str]
    related_docs: List[str]
    difficulty: str  # beginner, intermediate, advanced
    content_type: str  # concept, tutorial, reference, example

class DocumentProcessor:
    """文档预处理器"""
    
    def __init__(self, guide_dir: str = "knowledge/guide"):
        self.guide_dir = guide_dir
        self.category_map = self._load_category_map()
        self.doc_cache = {}
    
    def _load_category_map(self) -> Dict[str, str]:
        """从category.md加载分类映射"""
        category_file = Path(self.guide_dir) / "category.md"
        category_map = {}
        
        with open(category_file, 'r', encoding='utf-8') as f:
            content = f.read()
            # 解析category.md中的分类结构
            # 格式: [标题](url) -> 提取doc_id和分类
            pattern = r'\[([^\]]+)\]\(.*detail/([a-z0-9_]+)\)'
            matches = re.findall(pattern, content)
            
            current_category = "综合指南"
            for title, doc_id in matches:
                category_map[doc_id] = current_category
                # 根据标题判断是否是新的主分类
                if title in ["界面介绍", "概念介绍", "节点介绍", "辅助功能", "附录"]:
                    current_category = title
        
        return category_map
    
    def extract_metadata(self, doc_id: str, content: str) -> DocumentMetadata:
        """提取文档元数据"""
        # 从frontmatter提取基本信息
        frontmatter_match = re.match(r'---\n(.*?)\n---', content, re.DOTALL)
        metadata = {}
        
        if frontmatter_match:
            for line in frontmatter_match.group(1).split('\n'):
                if ':' in line:
                    key, value = line.split(':', 1)
                    metadata[key.strip()] = value.strip()
        
        # 提取标题
        title_match = re.search(r'^# (.+)$', content, re.MULTILINE)
        title = title_match.group(1) if title_match else metadata.get('title', '')
        
        # 提取关键词
        keywords = self._extract_keywords(content)
        
        # 确定难度级别
        difficulty = self._determine_difficulty(content)
        
        # 确定内容类型
        content_type = self._determine_content_type(content)
        
        # 查找相关文档
        related_docs = self._find_related_docs(doc_id, content)
        
        return DocumentMetadata(
            doc_id=doc_id,
            title=title,
            category=self.category_map.get(doc_id, "其他"),
            subcategory=self._extract_subcategory(content),
            keywords=keywords,
            related_docs=related_docs,
            difficulty=difficulty,
            content_type=content_type
        )
    
    def _extract_keywords(self, content: str) -> List[str]:
        """提取关键词"""
        # 提取所有二级标题作为关键词
        keywords = re.findall(r'^## (.+)$', content, re.MULTILINE)
        # 提取斜体文本（概念名词）
        keywords.extend(re.findall(r'_([^_]+)_', content))
        return list(set(keywords))[:10]  # 去重并限制数量
    
    def _determine_difficulty(self, content: str) -> str:
        """判断难度级别"""
        # 基于内容长度和复杂度
        length = len(content)
        complexity_keywords = ['高级', '复杂', '优化', '性能', '调试']
        
        has_complexity = any(kw in content for kw in complexity_keywords)
        
        if length < 1000:
            return "beginner"
        elif length < 3000 or not has_complexity:
            return "intermediate"
        else:
            return "advanced"
    
    def _determine_content_type(self, content: str) -> str:
        """判断内容类型"""
        if '定义' in content or '概念' in content:
            return "concept"
        elif '教程' in content or '步骤' in content:
            return "tutorial"
        elif '参数' in content or '配置' in content:
            return "reference"
        elif '示例' in content or '案例' in content:
            return "example"
        else:
            return "reference"
    
    def _extract_subcategory(self, content: str) -> str:
        """提取子分类"""
        # 从第一个二级标题提取
        match = re.search(r'^## (.+)$', content, re.MULTILINE)
        return match.group(1) if match else "通用"
    
    def _find_related_docs(self, doc_id: str, content: str) -> List[str]:
        """查找相关文档"""
        # 提取所有链接中的doc_id
        related = re.findall(r'detail/([a-z0-9_]+)', content)
        return [d for d in related if d != doc_id][:5]
    
    def chunk_document(self, content: str, chunk_size: int = 500, 
                      overlap: int = 100) -> List[Tuple[str, Dict]]:
        """将文档分块"""
        # 移除frontmatter
        content = re.sub(r'^---\n.*?\n---\n', '', content, flags=re.DOTALL)
        
        # 按标题分块
        sections = re.split(r'^(#{1,3} .+)$', content, flags=re.MULTILINE)
        
        chunks = []
        current_chunk = ""
        current_section = ""
        
        for i, section in enumerate(sections):
            if section.startswith('#'):
                current_section = section
                if current_chunk and len(current_chunk) > chunk_size:
                    chunks.append((current_chunk, {"section": current_section}))
                    current_chunk = section
                else:
                    current_chunk += "\n" + section
            else:
                current_chunk += section
                
                if len(current_chunk) > chunk_size:
                    # 分割过长的块
                    sentences = re.split(r'([。！？\n])', current_chunk)
                    temp_chunk = ""
                    for sent in sentences:
                        temp_chunk += sent
                        if len(temp_chunk) > chunk_size:
                            chunks.append((temp_chunk, {"section": current_section}))
                            temp_chunk = sent[-overlap:] if len(sent) > overlap else sent
                    current_chunk = temp_chunk
        
        if current_chunk:
            chunks.append((current_chunk, {"section": current_section}))
        
        return chunks
    
    def process_all_documents(self) -> Dict[str, Dict]:
        """处理所有文档"""
        processed = {}
        guide_path = Path(self.guide_dir)
        
        for md_file in guide_path.glob("mh*.md"):
            doc_id = md_file.stem
            
            with open(md_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            metadata = self.extract_metadata(doc_id, content)
            chunks = self.chunk_document(content)
            
            processed[doc_id] = {
                "metadata": metadata.__dict__,
                "chunks": chunks,
                "chunk_count": len(chunks)
            }
        
        return processed
    
    def save_processed_data(self, output_dir: str = "knowledge/processed"):
        """保存处理后的数据"""
        Path(output_dir).mkdir(exist_ok=True)
        
        processed = self.process_all_documents()
        
        # 保存元数据索引
        metadata_index = {
            doc_id: data["metadata"] 
            for doc_id, data in processed.items()
        }
        
        with open(f"{output_dir}/metadata_index.json", 'w', encoding='utf-8') as f:
            json.dump(metadata_index, f, ensure_ascii=False, indent=2)
        
        # 保存分块数据
        chunks_data = {
            doc_id: data["chunks"]
            for doc_id, data in processed.items()
        }
        
        with open(f"{output_dir}/chunks.json", 'w', encoding='utf-8') as f:
            json.dump(chunks_data, f, ensure_ascii=False, indent=2)
        
        print(f"处理完成！数据已保存到 {output_dir}")
        print(f"总文档数: {len(processed)}")
        print(f"总分块数: {sum(d['chunk_count'] for d in processed.values())}")

# 使用示例
if __name__ == "__main__":
    processor = DocumentProcessor()
    processor.save_processed_data()
```

### 1.2 使用方法

```bash
# 运行文档预处理
python -m rag_v1.document_processor

# 输出结果
# 处理完成！数据已保存到 knowledge/processed
# 总文档数: 150+
# 总分块数: 1000+
```

## 2. 向量检索优化实现

### 2.1 LlamaIndex 集成

```python
# rag_v1/rag_engine.py
from llama_index.core import (
    VectorStoreIndex,
    SimpleDirectoryReader,
    Document,
    Settings
)
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI
from llama_index.core.node_parser import SimpleNodeParser
from llama_index.core.retrievers import VectorIndexRetriever
from llama_index.core.query_engine import RetrieverQueryEngine
import json
from pathlib import Path

class RAGEngine:
    """RAG引擎"""
    
    def __init__(self, processed_data_dir: str = "knowledge/processed"):
        self.processed_data_dir = processed_data_dir
        self._setup_llama_index()
        self.index = None
        self.query_engine = None
    
    def _setup_llama_index(self):
        """配置LlamaIndex"""
        # 配置嵌入模型
        Settings.embed_model = OpenAIEmbedding(
            model="text-embedding-3-small",
            api_key=os.getenv("OPENAI_API_KEY")
        )
        
        # 配置LLM
        Settings.llm = OpenAI(
            model="gpt-4-turbo-preview",
            api_key=os.getenv("OPENAI_API_KEY")
        )
        
        # 配置节点解析器
        Settings.node_parser = SimpleNodeParser.from_defaults(
            chunk_size=512,
            chunk_overlap=100
        )
    
    def build_index(self):
        """构建向量索引"""
        # 加载处理后的文档
        documents = self._load_processed_documents()
        
        # 创建ChromaDB向量存储
        chroma_collection = chroma_client.get_or_create_collection(
            name="knowledge_base"
        )
        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        
        # 构建索引
        self.index = VectorStoreIndex.from_documents(
            documents,
            vector_store=vector_store,
            show_progress=True
        )
        
        # 创建查询引擎
        retriever = VectorIndexRetriever(
            index=self.index,
            similarity_top_k=5,  # 返回top-5相关文档
        )
        
        self.query_engine = RetrieverQueryEngine(
            retriever=retriever,
            response_synthesizer=get_response_synthesizer(
                response_mode="compact",
                use_async=True
            )
        )
    
    def _load_processed_documents(self) -> List[Document]:
        """加载处理后的文档"""
        documents = []
        
        # 加载元数据索引
        with open(f"{self.processed_data_dir}/metadata_index.json", 'r', encoding='utf-8') as f:
            metadata_index = json.load(f)
        
        # 加载分块数据
        with open(f"{self.processed_data_dir}/chunks.json", 'r', encoding='utf-8') as f:
            chunks_data = json.load(f)
        
        # 创建Document对象
        for doc_id, chunks in chunks_data.items():
            metadata = metadata_index.get(doc_id, {})
            
            for i, (chunk_text, chunk_meta) in enumerate(chunks):
                doc = Document(
                    text=chunk_text,
                    metadata={
                        "doc_id": doc_id,
                        "chunk_index": i,
                        "title": metadata.get("title", ""),
                        "category": metadata.get("category", ""),
                        "keywords": metadata.get("keywords", []),
                        "difficulty": metadata.get("difficulty", ""),
                        "content_type": metadata.get("content_type", ""),
                        **chunk_meta
                    }
                )
                documents.append(doc)
        
        return documents
    
    def query(self, query_text: str, filters: Dict = None) -> str:
        """执行查询"""
        if not self.query_engine:
            raise ValueError("索引未构建，请先调用 build_index()")
        
        # 应用过滤器
        if filters:
            # 可以根据difficulty、content_type等过滤
            pass
        
        response = self.query_engine.query(query_text)
        return str(response)
    
    def query_with_context(self, query_text: str) -> Dict:
        """带上下文的查询"""
        if not self.query_engine:
            raise ValueError("索引未构建，请先调用 build_index()")
        
        # 获取检索结果
        retriever = self.query_engine._retriever
        nodes = retriever.retrieve(query_text)
        
        # 生成答案
        response = self.query_engine.query(query_text)
        
        return {
            "query": query_text,
            "answer": str(response),
            "sources": [
                {
                    "doc_id": node.metadata.get("doc_id"),
                    "title": node.metadata.get("title"),
                    "category": node.metadata.get("category"),
                    "relevance_score": node.score
                }
                for node in nodes
            ]
        }

# 使用示例
if __name__ == "__main__":
    engine = RAGEngine()
    engine.build_index()
    
    # 查询示例
    result = engine.query_with_context("如何设置角色的基础战斗属性？")
    print(json.dumps(result, ensure_ascii=False, indent=2))
```

## 3. 查询优化策略

### 3.1 查询改写

```python
# rag_v1/query_optimizer.py
class QueryOptimizer:
    """查询优化器"""
    
    @staticmethod
    def expand_query(query: str) -> List[str]:
        """查询扩展"""
        # 同义词替换
        synonyms = {
            "角色": ["单位", "实体", "玩家角色"],
            "属性": ["参数", "配置", "设置"],
            "节点": ["节点图", "逻辑节点"],
            "组件": ["通用组件", "功能组件"],
        }
        
        expanded = [query]
        for key, values in synonyms.items():
            if key in query:
                for value in values:
                    expanded.append(query.replace(key, value))
        
        return expanded
    
    @staticmethod
    def categorize_query(query: str) -> str:
        """查询分类"""
        categories = {
            "基础概念": ["什么是", "定义", "概念"],
            "操作指南": ["如何", "怎样", "步骤"],
            "参数配置": ["参数", "配置", "设置"],
            "故障排查": ["问题", "错误", "不工作"],
            "最佳实践": ["最佳", "推荐", "应该"],
        }
        
        for category, keywords in categories.items():
            if any(kw in query for kw in keywords):
                return category
        
        return "通用"
```

## 4. 集成到现有系统

### 4.1 更新RAG模块

在 `rag_v1/` 目录中添加以下文件：

```
rag_v1/
├── __init__.py
├── document_processor.py      # 文档预处理
├── rag_engine.py              # RAG引擎
├── query_optimizer.py         # 查询优化
├── config.py                  # 配置管理
└── main.py                    # 主入口
```

### 4.2 更新package.json

```json
{
  "scripts": {
    "preprocess": "python -m rag_v1.document_processor",
    "rag:build": "python -m rag_v1.main build",
    "rag:query": "python -m rag_v1.main query",
    "rag:serve": "python -m rag_v1.main serve"
  }
}
```

## 5. 性能优化建议

### 5.1 缓存策略

- 缓存常见查询结果
- 使用Redis存储热点数据
- 定期更新缓存

### 5.2 批量处理

- 批量构建向量索引
- 异步处理长查询
- 使用连接池管理数据库连接

### 5.3 监控指标

- 查询延迟（P50, P95, P99）
- 检索准确率（MRR, NDCG）
- 系统资源使用率

## 6. 测试和验证

### 6.1 单元测试

```python
# tests/test_document_processor.py
def test_extract_metadata():
    processor = DocumentProcessor()
    # 测试元数据提取
    
def test_chunk_document():
    processor = DocumentProcessor()
    # 测试文档分块
```

### 6.2 集成测试

```python
# tests/test_rag_engine.py
def test_build_index():
    engine = RAGEngine()
    engine.build_index()
    # 验证索引构建成功

def test_query():
    engine = RAGEngine()
    engine.build_index()
    result = engine.query("测试查询")
    # 验证查询结果
```

## 7. 部署清单

- [ ] 安装依赖：`pip install -r requirements.txt`
- [ ] 配置环境变量：`.env.local`
- [ ] 运行预处理：`npm run preprocess`
- [ ] 构建索引：`npm run rag:build`
- [ ] 测试查询：`npm run rag:query`
- [ ] 启动服务：`npm run rag:serve`
- [ ] 监控系统性能

## 8. 常见问题

**Q: 如何处理新增文档？**
A: 运行预处理脚本，然后增量更新索引

**Q: 查询结果不准确怎么办？**
A: 检查文档分块大小、调整相似度阈值、优化查询表述

**Q: 如何提高检索速度？**
A: 使用缓存、优化向量维度、使用GPU加速
