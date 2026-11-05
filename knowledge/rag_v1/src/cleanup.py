"""Reconcile current source chunks with stored vectors, without embedding requests."""
from collections import defaultdict
from pathlib import Path
from typing import TypedDict, cast
import argparse
import json
import re

import chromadb
from llama_index.core.schema import BaseNode, Document, NodeRelationship, RelatedNodeInfo
from llama_index.core.vector_stores.utils import node_to_metadata_dict, metadata_dict_to_node
from chromadb.api.models.Collection import Collection

from .config import config
from .parser import DocumentParser


class Source(TypedDict):
    doc_id: str
    title: str
    file_path: str
    url: str
    chunk_index: int
    subchunk_index: int
    crawledAt: str


def fingerprint(text: str) -> str:
    # Preserve indentation and whitespace inside code examples.
    return text.replace('\r\n', '\n').strip()


def load_current_documents(parser: DocumentParser, entries: list[tuple[str, str | None]] | None = None) -> list[Document]:
    documents: list[Document] = []
    seen: set[str] = set()
    bbs_floors: set[tuple[str, str]] = set()
    for directory, prefix in (config.KNOWLEDGE_SOURCE_DIRS if entries is None else entries):
        if not Path(directory).exists():
            continue
        for doc in parser.load_documents(directory):
            if prefix and not Path(doc.metadata['file_name']).name.startswith(prefix):
                continue
            if doc.id_ in seen:
                raise ValueError(f'Duplicate source document ID: {doc.id_}; resolve old files first')
            seen.add(doc.id_)
            if doc.id_.startswith('bbs-faq'):
                for floor in re.findall(r'^来自：米游社问答楼(\d+)\s*$', doc.text, re.MULTILINE):
                    key = (str(doc.metadata.get('url', '')), floor)
                    if key in bbs_floors:
                        raise ValueError(f'Duplicate BBS floor: {floor}')
                    bbs_floors.add(key)
            documents.append(doc)
    return documents


def reconcile(persist_dir: str, collection_name: str, apply: bool = False) -> dict[str, int]:
    parser = DocumentParser(config.MAX_CHUNK_SIZE, config.CHUNK_OVERLAP, config.USE_H1_ONLY)
    groups: dict[str, list[BaseNode]] = defaultdict(list)
    for doc in load_current_documents(parser):
        for node in parser.parse_documents([doc]):
            key = fingerprint(node.get_content())
            if key:
                groups[key].append(node)
    if not groups:
        raise ValueError('Empty source collection; refusing cleanup')
    collection = chromadb.PersistentClient(path=persist_dir).get_collection(collection_name)
    stored = collection.get(include=['documents', 'metadatas'])
    available: dict[str, list[int]] = defaultdict(list)
    for i, text in enumerate(stored['documents']):
        available[fingerprint(text)].append(i)
    # Validate the entire plan before performing any writes.
    missing = set(groups) - set(available)
    if missing:
        raise ValueError(f'{len(missing)} source chunks have no stored vector; run incremental init first')
    keep: set[str] = set()
    updates = []
    for key, nodes in groups.items():
        nodes.sort(key=lambda n: (n.ref_doc_id or '', n.metadata.get('chunk_index', 0), n.metadata.get('subchunk_index', 0)))
        canonical = nodes[0]
        candidates = available[key]
        chosen = min(candidates, key=lambda i: (stored['metadatas'][i].get('ref_doc_id') != canonical.ref_doc_id, stored['ids'][i]))
        identity = stored['ids'][chosen]
        keep.add(identity)
        sources: list[Source] = [{
            'doc_id': n.ref_doc_id or '', 'title': str(n.metadata.get('title', '')),
            'file_path': str(n.metadata.get('file_path', '')), 'url': str(n.metadata.get('url', '')),
            'chunk_index': int(n.metadata.get('chunk_index', 0)),
            'subchunk_index': int(n.metadata.get('subchunk_index', 0)),
            'crawledAt': str(n.metadata.get('crawledAt', '')),
        } for n in nodes]
        canonical.id_ = identity
        canonical.relationships = {NodeRelationship.SOURCE: RelatedNodeInfo(node_id=canonical.ref_doc_id or "")}
        canonical.metadata = {k: v if isinstance(v, (str, int, float, bool)) else str(v)
                              for k, v in canonical.metadata.items() if v is not None}
        canonical.metadata['all_sources_json'] = json.dumps(sources, ensure_ascii=False, sort_keys=True)
        canonical.excluded_embed_metadata_keys.append('all_sources_json')
        canonical.excluded_llm_metadata_keys.append('all_sources_json')
        metadata = node_to_metadata_dict(canonical, remove_text=True, flat_metadata=True)
        # Updating only metadata preserves the original text and its embedding.
        if metadata != stored['metadatas'][chosen]:
            updates.append((identity, metadata))
    remove = sorted(set(stored['ids']) - keep)
    if apply:
        for start in range(0, len(updates), 200):
            batch = updates[start:start + 200]
            collection.update(ids=[row[0] for row in batch], metadatas=[row[1] for row in batch])
        if remove:
            collection.delete(ids=remove)
    return {'before': len(stored['ids']), 'after': len(keep), 'removed': len(remove),
            'metadata_updates': len(updates), 'merged_groups': sum(len(ns) > 1 for ns in groups.values())}


def detach_document(collection: Collection, doc_id: str) -> int:
    """Delete exclusive chunks; transfer shared chunks to a remaining source."""
    rows = collection.get(where={'ref_doc_id': doc_id}, include=['metadatas'])
    remove: list[str] = []
    for identity, metadata in zip(rows['ids'], rows['metadatas']):
        sources = cast(list[Source], json.loads(metadata.get('all_sources_json', '[]')))
        remaining = [source for source in sources if source['doc_id'] != doc_id]
        if not remaining:
            remove.append(identity)
            continue
        replacement = remaining[0]
        node = metadata_dict_to_node(metadata)
        node.relationships[NodeRelationship.SOURCE] = RelatedNodeInfo(node_id=replacement['doc_id'])
        node.metadata.update({
            'id': replacement['doc_id'], 'title': replacement['title'],
            'file_path': replacement['file_path'], 'file_name': Path(replacement['file_path']).name,
            'source_dir': Path(replacement['file_path']).parent.name,
            'url': replacement['url'], 'sourceURL': replacement['url'],
            'crawledAt': replacement.get('crawledAt', ''),
            'chunk_index': replacement['chunk_index'], 'subchunk_index': replacement['subchunk_index'],
            'all_sources_json': json.dumps(remaining, ensure_ascii=False, sort_keys=True),
        })
        collection.update(ids=[identity], metadatas=[node_to_metadata_dict(node, remove_text=True, flat_metadata=True)])
    if remove:
        collection.delete(ids=remove)
    return len(remove)


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--apply', action='store_true')
    cli.add_argument('--db', default=config.KNOWLEDGE_BASE_PATH)
    args = cli.parse_args()
    print(json.dumps(reconcile(args.db, config.CHROMA_COLLECTION_NAME, args.apply), ensure_ascii=False))
