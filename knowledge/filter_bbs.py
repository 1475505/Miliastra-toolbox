"""Filter reviewed BBS floor IDs using the same release config as the official crawler."""
import argparse
import json
import re
from pathlib import Path
from typing import TypedDict, cast


class BbsRules(TypedDict):
    postId: str
    sinceFloor: int
    excludeFloorIds: list[int]


class ReleaseConfig(TypedDict):
    bbs: BbsRules


def filter_markdown(markdown: str, rules: BbsRules) -> tuple[str, int, int]:
    header, separator, body = markdown.partition('\n# Q. ')
    if not separator:
        raise ValueError('没有找到问答，停止写入')
    if f"/article/{rules['postId']}" not in header:
        raise ValueError('问答来源与过滤配置不一致')
    blocks = re.split(r'(?=^# Q\. )', '# Q. ' + body, flags=re.MULTILINE)
    excluded = set(rules['excludeFloorIds'])
    seen: set[int] = set()
    kept: list[str] = []
    for block in blocks:
        if not block.strip():
            continue
        matches = re.findall(r'^来自：米游社问答楼(\d+)$', block, re.MULTILINE)
        if len(matches) != 1:
            raise ValueError('问答缺少唯一楼层编号')
        floor = int(matches[0])
        if floor in seen or floor < rules['sinceFloor']:
            raise ValueError(f'楼层重复或超出增量范围: {floor}')
        seen.add(floor)
        if floor not in excluded:
            kept.append(block.strip())
    if excluded - seen:
        raise ValueError(f'过滤楼层不在抓取结果中: {sorted(excluded - seen)}')
    if not kept:
        raise ValueError('过滤结果为空，停止写入')
    return header.rstrip() + '\n\n' + '\n\n'.join(kept) + '\n', len(kept), len(excluded)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--filter-config', type=Path, required=True)
    args = parser.parse_args()
    config = cast(ReleaseConfig, json.loads(args.filter_config.read_text(encoding='utf-8')))
    result, kept, excluded = filter_markdown(args.source.read_text(encoding='utf-8'), config['bbs'])
    args.output.write_text(result, encoding='utf-8')
    print(f'保留 {kept} 条，排除 {excluded} 条，输出 {args.output}')


if __name__ == '__main__':
    main()
