"""Compare every catalog entry with its local document, before any date cutoff."""
import argparse
from collections import Counter
from datetime import datetime
import json
from pathlib import Path
import re
from typing import TypedDict, cast
from zoneinfo import ZoneInfo


class Entry(TypedDict):
    id: str
    title: str
    scope: str
    localPath: str
    updated_at: str


class Catalog(TypedDict):
    entries: list[Entry]


class Rules(TypedDict):
    skipUpdateIds: list[str]


class Result(TypedDict):
    id: str
    title: str
    scope: str
    path: str
    updated_at: str
    crawledAt: str
    status: str


def timestamp(value: str) -> datetime | None:
    try:
        date = datetime.fromisoformat(value.strip().replace('Z', '+00:00'))
        return date if date.tzinfo else date.replace(tzinfo=ZoneInfo('Asia/Shanghai'))
    except ValueError:
        return None


def audit(root: Path, filter_config: Path) -> list[Result]:
    rules = cast(Rules, json.loads(filter_config.read_text()))
    results: list[Result] = []
    for catalog in sorted((root / 'config').glob('urls-*.json')):
        entries = cast(Catalog, json.loads(catalog.read_text()))['entries']
        for entry in entries:
            path = root / entry['localPath']
            crawled = ''
            valid_id = False
            if path.exists():
                text = path.read_text()
                header = text.split('\n---', 1)[0] if text.startswith('---\n') else ''
                match = re.search(r'^crawledAt:\s*(.+)$', header, re.MULTILINE)
                crawled = match[1].strip() if match else ''
                match = re.search(r'^id:\s*(.+)$', header, re.MULTILINE)
                valid_id = match is not None and match[1].strip() == entry['id']
            updated = timestamp(entry.get('updated_at', ''))
            fetched = timestamp(crawled)
            if entry['id'] in rules['skipUpdateIds']:
                status = 'preserved_by_filter'
            elif not path.exists():
                status = 'missing'
            elif not valid_id:
                status = 'id_mismatch'
            elif fetched is None:
                status = 'invalid_crawled_at'
            elif updated is None:
                status = 'invalid_updated_at'
            else:
                status = 'stale' if updated > fetched else 'current'
            results.append({'id': entry['id'], 'title': entry['title'], 'scope': entry['scope'],
                            'path': entry['localPath'], 'updated_at': entry.get('updated_at', ''),
                            'crawledAt': crawled, 'status': status})
    return results


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--filter-config', type=Path, required=True)
    cli.add_argument('--output', type=Path, required=True)
    args = cli.parse_args()
    results = audit(Path(__file__).resolve().parent, args.filter_config)
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(Counter(row['status'] for row in results), ensure_ascii=False))
    for row in results:
        if row['status'] not in {'current', 'preserved_by_filter'}:
            print(json.dumps(row, ensure_ascii=False))
