import assert from 'node:assert/strict';
import test from 'node:test';
import { FilterConfig, filterCatalogEntries, redactMarkdown, shouldSkipScrape } from './utils/filterConfig.js';
import { URLEntry } from './types.js';
import { FirecrawlClient } from './utils/firecrawl.js';

const config: FilterConfig = {
  version: '7.1',
  excludeNewIds: ['new-control'],
  skipUpdateIds: ['old-control'],
  redactSections: [{
    documentId: 'release-notes',
    withinHeading: '7.1版本-2026/09/23',
    headingContains: '客户端控件与客户端脚本相关',
    headingLevel: 3,
    expectedMatches: 2,
    renumberHeadings: true,
  }],
};

function entry(id: string, updatedAt: string): URLEntry {
  return { id, title: id, url: `https://example.com/${id}`, uniqueId: id, scope: 'guide', updated_at: updatedAt };
}

test('7.1 目录排除新增控件并保留已有控件的旧版条目', () => {
  const latest = [entry('new-control', '2026-09-01'), entry('old-control', '2026-09-01'), entry('feature', '2026-09-01')];
  const old = [entry('old-control', '2026-07-01')];
  const result = filterCatalogEntries(latest, old, config);
  assert.deepEqual(result.map(item => item.id), ['old-control', 'feature']);
  assert.equal(result[0].updated_at, '2026-07-01');
  assert.equal(shouldSkipScrape('new-control', config), true);
  assert.equal(shouldSkipScrape('old-control', config), true);
  assert.equal(shouldSkipScrape('feature', config), false);
});

test('只删 7.1 更新日志中的两处客户端控件专题', () => {
  const source = [
    '# 7.1版本-2026/09/23',
    '## 一、内容新增',
    '### 1.客户端控件与客户端脚本相关',
    '[新增控件](url)',
    '### 2.ID修改相关',
    '[ID修改](url)',
    '## 二、内容修改',
    '### 1.客户端控件与客户端脚本相关',
    '[修改控件](url)',
    '### 2.复杂造物相关',
    '[复杂造物](url)',
    '# 7.0版本-2026/08/12',
    '### 1.客户端控件与客户端脚本相关',
    '[历史内容](url)',
  ].join('\n');
  const result = redactMarkdown(source, 'release-notes', config);
  assert.equal(result.includes('新增控件'), false);
  assert.equal(result.includes('修改控件'), false);
  assert.equal(result.includes('### 1.ID修改相关'), true);
  assert.equal(result.includes('### 1.复杂造物相关'), true);
  assert.equal(result.includes('复杂造物'), true);
  assert.equal(result.includes('历史内容'), true);
});

test('官方更新日志结构变化时拒绝写入未过滤内容', () => {
  assert.throws(() => redactMarkdown('# 7.1版本-2026/09/23\n## 新版结构', 'release-notes', config));
});

test('节点文档中的客户端脚本章节可单独过滤', () => {
  const nodeConfig: FilterConfig = {
    ...config,
    redactSections: [{
      documentId: 'nodes',
      headingContains: '发送客户端脚本信号',
      headingLevel: 2,
      expectedMatches: 1,
    }],
  };
  const source = [
    '# 执行节点',
    '## **7. 发送客户端脚本信号**',
    '客户端脚本参数说明',
    '## **8. 创建实体**',
    '实体参数说明',
  ].join('\n');
  const result = redactMarkdown(source, 'nodes', nodeConfig);
  assert.equal(result.includes('客户端脚本参数说明'), false);
  assert.equal(result.includes('实体参数说明'), true);
});

test('官方静态正文地址与中文编码恢复', () => {
  const client = new FirecrawlClient('test-key');
  assert.equal(
    client['staticContentURL']('https://act.mihoyo.com/ys/ugc/tutorial/detail/mho82r0ip7v4'),
    'https://act-webstatic.mihoyo.com/ugc-tutorial/knowledge/cn/zh-cn/mho82r0ip7v4/content.html?v=1016',
  );
  assert.equal(
    client['staticContentURL']('https://act.mihoyo.com/ys/ugc/tutorial/course/detail/mhll54i94vjg'),
    'https://act-webstatic.mihoyo.com/ugc-tutorial/course/cn/zh-cn/mhll54i94vjg/content.html?v=1016',
  );
  const source = '# 中文节点 · 参数';
  const corrupted = new TextDecoder('windows-1252').decode(new TextEncoder().encode(source));
  assert.equal(client['repairStaticMarkdownEncoding'](corrupted), source);
});
