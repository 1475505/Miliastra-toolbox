"""
文档解析器模块
使用LlamaIndex原生功能进行文档加载和解析
优化策略：
1. 只按 Markdown 一级标题（# ）分块
2. 保持每个一级标题下的所有内容（包括二三级标题）在同一个块中
3. 配置足够大的 chunk_size 以保持内容完整性
"""
from typing import List, Dict, Any, Tuple
from pathlib import Path
import hashlib
import re
import yaml
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.readers import SimpleDirectoryReader
from llama_index.core.ingestion import IngestionPipeline
from llama_index.core.schema import Document, BaseNode, TextNode

def extract_yaml_frontmatter(text: str) -> Tuple[Dict[str, Any], str]:
    """
    从 Markdown 文本中提取 YAML frontmatter。
    
    Args:
        text: Markdown 文本
        
    Returns:
        (metadata_dict, cleaned_text) 元组
    """
    # 匹配 YAML frontmatter: ---\n...\n---
    frontmatter_pattern = r'^---\s*\n(.*?)\n---\s*\n'
    match = re.match(frontmatter_pattern, text, flags=re.DOTALL)
    
    if match:
        yaml_content = match.group(1)
        try:
            # 解析 YAML
            metadata = yaml.safe_load(yaml_content)
            if not isinstance(metadata, dict):
                metadata = {}
        except yaml.YAMLError:
            metadata = {}
        
        # 移除 frontmatter 后的文本
        cleaned_text = text[match.end():]
        return metadata, cleaned_text
    
    return {}, text

def file_metadata_func(file_path: str) -> dict:
    """
    自定义元数据提取函数，用于提取文件基础信息和 YAML frontmatter。
    这个函数会被 SimpleDirectoryReader 调用来生成文档的元数据。
    """
    path_obj = Path(file_path)
    
    # 基础文件元数据
    metadata = {
        "file_name": path_obj.name,
        "file_path": file_path,
        "source_dir": path_obj.parent.name
    }
    
    # 读取文件并提取 YAML frontmatter
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        yaml_metadata, _ = extract_yaml_frontmatter(content)
        # 合并 YAML 元数据到基础元数据中
        metadata.update(yaml_metadata)
    except Exception as e:
        # 如果提取失败，只返回基础元数据
        pass
    
    return metadata

class DocumentParser:
    """
    优化的文档解析器，用于加载和解析Markdown文档。
    
    优化特性：
    - 只按照 Markdown 一级标题（# ）进行分块
    - 保持每个一级标题下的所有内容完整（包括二三级标题、表格、代码块等）
    - 使用足够大的 chunk_size 避免单个章节被截断
    """
    def __init__(self,
                 chunk_size: int = 2048,
                 chunk_overlap: int = 200,
                 use_h1_only: bool = True):
        """
        初始化解析器。

        Args:
            chunk_size (int): 块大小，默认 2048，足够容纳一个完整的一级标题章节。
            chunk_overlap (int): 块重叠，默认 200，保持上下文连贯性。
            use_h1_only (bool): 是否只按一级标题分块（默认 True）。
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.use_h1_only = use_h1_only
        
        # 只在需要二次分割时使用 SentenceSplitter
        self.sentence_splitter = SentenceSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            paragraph_separator="\n\n",
            secondary_chunking_regex="[^,.;。；！？]+[,.;。；！？]?"
        )
    
    def _remove_frontmatter(self, text: str) -> str:
        """
        移除 YAML frontmatter（如果存在）。
        
        Args:
            text: Markdown 文本
            
        Returns:
            移除 frontmatter 后的文本
        """
        # YAML frontmatter 格式：以 --- 开始和结束
        frontmatter_pattern = r'^---\s*\n.*?\n---\s*\n'
        cleaned_text = re.sub(frontmatter_pattern, '', text, flags=re.DOTALL)
        return cleaned_text.strip()
    
    def _split_by_h1(self, text: str) -> List[str]:
        """
        按一级标题分割文本。
        
        Args:
            text: Markdown 文本（已移除 frontmatter）
            
        Returns:
            按一级标题分割的文本块列表
        """
        # 匹配一级标题：以 # 开头，后面不是 #（排除二级及以上标题）
        # 使用正则表达式匹配行首的 # 加空格
        h1_pattern = r'^# [^#].*$'
        
        lines = text.split('\n')
        chunks = []
        current_chunk = []
        
        for line in lines:
            # 检查是否是一级标题
            if re.match(h1_pattern, line):
                # 如果当前chunk不为空，保存它
                if current_chunk:
                    chunks.append('\n'.join(current_chunk))
                # 开始新的chunk
                current_chunk = [line]
            else:
                current_chunk.append(line)
        
        # 添加最后一个chunk
        if current_chunk:
            chunks.append('\n'.join(current_chunk))
        
        return chunks
    
    def _create_nodes_from_chunks(self, chunks: List[str], doc: Document) -> List[BaseNode]:
        """
        从文本块创建节点。
        
        Args:
            chunks: 文本块列表
            doc: 原始文档（包含从YAML frontmatter提取的元数据）
            
        Returns:
            节点列表
        """
        nodes = []
        for i, chunk in enumerate(chunks):
            # 提取一级标题作为额外元数据
            h1_match = re.search(r'^# (.+)$', chunk, re.MULTILINE)
            h1_title = h1_match.group(1).strip() if h1_match else f"Section {i+1}"
            
            # 合并元数据：原文档元数据（包含YAML frontmatter） + 一级标题
            chunk_metadata = {
                **doc.metadata,
                "h1_title": h1_title,
                "chunk_index": i
            }
            
            # 如果chunk太大，使用 SentenceSplitter 进行二次分割
            if len(chunk) > self.chunk_size:
                # 创建临时文档用于分割
                temp_doc = Document(text=chunk, metadata=chunk_metadata)
                sub_nodes = self.sentence_splitter.get_nodes_from_documents([temp_doc])
                nodes.extend(sub_nodes)
            else:
                # 直接创建节点
                node = TextNode(
                    text=chunk,
                    metadata=chunk_metadata
                )
                nodes.append(node)
        
        return nodes

    def load_documents(self, directory_path: str) -> List[Document]:
        """
        从目录加载文档。file_metadata_func 会提取 YAML frontmatter 到元数据中。

        Args:
            directory_path (str): The path to the directory.

        Returns:
            List[Document]: A list of loaded documents with YAML metadata.
        """
        reader = SimpleDirectoryReader(
            input_dir=directory_path,
            required_exts=[".md"],
            recursive=True,
            file_metadata=file_metadata_func,
            exclude_hidden=False,
        )
        docs = reader.load_data()
        
        # 从文档文本中移除 YAML frontmatter（已提取到 metadata 中）
        cleaned_docs = []
        for doc in docs:
            _, cleaned_text = extract_yaml_frontmatter(doc.text)
            cleaned_doc = Document(
                text=cleaned_text,
                metadata=doc.metadata
            )
            cleaned_docs.append(cleaned_doc)
        
        return cleaned_docs

    def parse_documents(self, documents: List[Document]) -> List[BaseNode]:
        """
        解析文档为节点。

        Args:
            documents (List[Document]): 文档列表。

        Returns:
            List[BaseNode]: 解析后的节点列表。
        """
        if not self.use_h1_only:
            # 如果不使用一级标题分块，使用标准的 SentenceSplitter
            return self.sentence_splitter.get_nodes_from_documents(documents)
        
        all_nodes = []
        for doc in documents:
            # YAML frontmatter 已在 load_documents 中提取并移除
            # doc.text 已经是清理后的文本，doc.metadata 包含 YAML 元数据
            
            # 按一级标题分割
            chunks = self._split_by_h1(doc.text)
            
            # 创建节点
            nodes = self._create_nodes_from_chunks(chunks, doc)
            all_nodes.extend(nodes)
        
        return all_nodes

    def load_and_parse(self, directory_path: str) -> List[BaseNode]:
        """
        加载并解析目录中的所有文档。

        Args:
            directory_path (str): 目录路径。

        Returns:
            List[BaseNode]: 解析后的节点列表。
        """
        documents = self.load_documents(directory_path)
        return self.parse_documents(documents)