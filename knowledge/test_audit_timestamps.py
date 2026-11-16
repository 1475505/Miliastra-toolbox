import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from knowledge.audit_timestamps import audit, timestamp


class TimestampAuditTests(unittest.TestCase):
    def test_catalog_timezone_matches_utc(self) -> None:
        self.assertEqual(timestamp('2026-03-12 10:44:51'), timestamp('2026-03-12T02:44:51Z'))
        self.assertIsNone(timestamp('invalid'))

    def test_no_version_cutoff_and_preserved_exceptions(self) -> None:
        with TemporaryDirectory() as d:
            root = Path(d); (root / 'config').mkdir()
            entries = []
            cases = [
                ('old', '2025-11-11 10:00:00', '2025-10-30T00:00:00Z', 'old', 'stale'),
                ('equal', '2026-03-12 10:44:51', '2026-03-12T02:44:51Z', 'equal', 'current'),
                ('invalid', '2026-03-12 10:44:51', 'unknown', 'invalid', 'invalid_crawled_at'),
                ('wrong-id', '2026-03-12 10:44:51', '2026-03-12T02:44:51Z', 'other', 'id_mismatch'),
                ('preserved', '2026-03-12 10:44:51', '2025-10-30T00:00:00Z', 'preserved', 'preserved_by_filter'),
                ('missing', '2026-03-12 10:44:51', '', '', 'missing'),
                ('bad-date', 'unknown', '2026-03-12T02:44:51Z', 'bad-date', 'invalid_updated_at'),
            ]
            for id, updated, crawled, actual_id, status in cases:
                entries.append({'id': id, 'title': id, 'scope': 'guide', 'localPath': id+'.md', 'updated_at': updated})
                if id != 'missing':
                    (root / (id+'.md')).write_text(f'---\nid: {actual_id}\ncrawledAt: {crawled}\n---\n正文')
            (root / 'config/urls-guide.json').write_text(json.dumps({'entries': entries}))
            rules = root / 'rules.json'; rules.write_text(json.dumps({'skipUpdateIds': ['preserved']}))
            results = {row['id']: row['status'] for row in audit(root, rules)}
            self.assertEqual(results, {row[0]: row[4] for row in cases})
