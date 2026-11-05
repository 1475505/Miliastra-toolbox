from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
import chromadb
from llama_index.core.schema import Document
from llama_index.core.vector_stores.utils import node_to_metadata_dict
from knowledge.rag_v1.src.cleanup import reconcile, load_current_documents
from knowledge.rag_v1.src.config import config
from knowledge.rag_v1.src.db import delete_document_by_id
from knowledge.rag_v1.src.parser import DocumentParser


class CleanupTests(unittest.TestCase):
    def test_empty_video_and_admin_files_are_not_indexed(self) -> None:
        parser = DocumentParser(config.MAX_CHUNK_SIZE, config.CHUNK_OVERLAP, config.USE_H1_ONLY)
        nodes = parser.parse_documents([Document(text='\n\n# 实用内容\n保留正文', id_='a')])
        self.assertEqual(len(nodes), 1)
        self.assertFalse(parser.parse_documents([Document(text='不支持的音频/视频格式请试试刷新\n播放\n00:00/00:00', id_='v')]))
        with TemporaryDirectory() as d:
            Path(d, 'README.md').write_text('说明')
            Path(d, 'category.md').write_text('目录')
            Path(d, 'entry.md').write_text('---\nid: a\n---\n正文')
            self.assertEqual([doc.id_ for doc in parser.load_documents(d)], ['a'])

    def test_duplicate_source_ids_fail(self) -> None:
        with TemporaryDirectory() as d:
            for name in ['old', 'new']:
                Path(d, name + '.md').write_text('---\nid: duplicate\n---\n正文')
            with self.assertRaisesRegex(ValueError, 'Duplicate source'):
                load_current_documents(DocumentParser(), [(d, None)])

    def test_subchunks_have_stable_metadata(self) -> None:
        with TemporaryDirectory() as d:
            source = Path(d, 'source'); source.mkdir()
            (source / 'a.md').write_text('---\nid: a\n---\n# 长章节\n' + ('这是用于验证分段引用稳定性的技术说明。' * 300))
            parser = DocumentParser(config.MAX_CHUNK_SIZE, config.CHUNK_OVERLAP, config.USE_H1_ONLY)
            nodes = parser.parse_documents(parser.load_documents(str(source)))
            self.assertGreater(len(nodes), 1)
            collection = chromadb.PersistentClient(path=str(Path(d, 'db'))).create_collection('test')
            for node in nodes:
                collection.add(ids=[node.id_], documents=[node.text], embeddings=[[1.0, 2.0]],
                               metadatas=[node_to_metadata_dict(node, remove_text=True)])
            with patch.object(config, 'KNOWLEDGE_SOURCE_DIRS', [(str(source), None)]):
                reconcile(str(Path(d, 'db')), 'test', apply=True)
                self.assertEqual(reconcile(str(Path(d, 'db')), 'test')['metadata_updates'], 0)

    def test_duplicate_bbs_floor_fails(self) -> None:
        with TemporaryDirectory() as d:
            for name in ['a', 'b']:
                Path(d, name + '.md').write_text(f'---\nid: bbs-faq-{name}\nurl: https://example.com/article/1\n---\n# Q. 问题\n回答\n来自：米游社问答楼902\n')
            with self.assertRaisesRegex(ValueError, 'Duplicate BBS floor'):
                load_current_documents(DocumentParser(), [(d, None)])

    def test_reconcile_reuses_vectors_preserves_sources_and_is_idempotent(self) -> None:
        with TemporaryDirectory() as d:
            source = Path(d, 'source'); source.mkdir()
            for name in ['a', 'b']:
                (source / (name + '.md')).write_text(f'---\nid: {name}\ntitle: {name}\n---\n# 相同正文\n有效知识')
            parser = DocumentParser(config.MAX_CHUNK_SIZE, config.CHUNK_OVERLAP, config.USE_H1_ONLY)
            nodes = parser.parse_documents(parser.load_documents(str(source)))
            collection = chromadb.PersistentClient(path=str(Path(d, 'db'))).create_collection('test')
            for node in nodes:
                collection.add(ids=[node.id_], documents=[node.text], embeddings=[[1.0, 2.0]],
                               metadatas=[node_to_metadata_dict(node, remove_text=True)])
            collection.add(ids=['empty'], documents=[' '], embeddings=[[2.0, 1.0]])
            with patch.object(config, 'KNOWLEDGE_SOURCE_DIRS', [(str(source), None)]):
                plan = reconcile(str(Path(d, 'db')), 'test')
                self.assertEqual(plan['removed'], 2)
                self.assertEqual(collection.count(), 3)
                reconcile(str(Path(d, 'db')), 'test', apply=True)
                result = collection.get(include=['metadatas', 'embeddings'])
                self.assertEqual(collection.count(), 1)
                self.assertIn('"doc_id": "a"', result['metadatas'][0]['all_sources_json'])
                self.assertIn('"doc_id": "b"', result['metadatas'][0]['all_sources_json'])
                self.assertEqual(result['embeddings'][0].tolist(), [1.0, 2.0])
                again = reconcile(str(Path(d, 'db')), 'test')
                self.assertEqual(again['removed'], 0)
                self.assertEqual(again['metadata_updates'], 0)
                delete_document_by_id(str(Path(d, 'db')), 'test', 'a')
                shared = collection.get(include=['metadatas'])
                self.assertEqual(shared['metadatas'][0]['ref_doc_id'], 'b')
                self.assertEqual(collection.count(), 1)
                (source / 'new.md').write_text('---\nid: new\n---\n新知识没有向量')
                with self.assertRaisesRegex(ValueError, 'no stored vector'):
                    reconcile(str(Path(d, 'db')), 'test', apply=True)
                self.assertEqual(collection.count(), 1)
