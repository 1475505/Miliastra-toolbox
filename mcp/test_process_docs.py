from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from backend.skill.service import _parse_chunks_from_md
from mcp.process_docs import Chunk, clean_heading, dedupe_chunks, chunk_id, write_markdown


class NodeIdentityTests(unittest.TestCase):
    def make_chunk(self, path: str, side: str, body: str) -> Chunk:
        return Chunk('同名节点', '类别', path, '查询节点', path, body, side)

    def test_normalize_escaped_number(self) -> None:
        self.assertEqual(clean_heading(r'**12\. 同名节点**'), '同名节点')

    def test_merge_preserves_images_sources_and_side(self) -> None:
        body = '**节点功能**\n相同\n**节点参数**\n参数'
        chunks = [self.make_chunk('a.md', 'server', body + '\n![](a.png)'),
                  self.make_chunk('b.md', 'server', body + '\n![](b.png)'),
                  self.make_chunk('c.md', 'client', body + '\n![](c.png)')]
        merged = dedupe_chunks(chunks)
        self.assertEqual(len(merged), 2)
        self.assertEqual(merged[0].source_paths, ('a.md', 'b.md'))
        self.assertIn('a.png', merged[0].content)
        self.assertIn('b.png', merged[0].content)

    def test_different_parameters_same_title_do_not_overwrite(self) -> None:
        chunks = [self.make_chunk('a.md', 'server', '出参：是否命中实体（布尔值）'),
                  self.make_chunk('b.md', 'server', '出参：命中实体（实体）')]
        chunks = dedupe_chunks(chunks)
        self.assertEqual(len(chunks), 2)
        with TemporaryDirectory() as d:
            p = Path(d, '查询节点.md'); write_markdown(p, '查询节点', chunks)
            parsed = _parse_chunks_from_md(p)
            for chunk in chunks:
                self.assertIn(chunk.content, parsed[chunk_id(chunk)])

    def test_ambiguous_legacy_blocks_fail_closed(self) -> None:
        with TemporaryDirectory() as d:
            p = Path(d, 'bad.md');p.write_text('___\n# 同名\n正文一\n___\n# 同名\n正文二')
            with self.assertRaisesRegex(ValueError, 'Duplicate node'):
                _parse_chunks_from_md(p)
