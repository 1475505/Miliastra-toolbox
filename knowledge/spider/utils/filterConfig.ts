import fs from 'fs/promises';
import path from 'path';
import { URLEntry } from '../types.js';

export interface SectionRedaction {
  documentId: string;
  withinHeading?: string;
  headingContains: string;
  headingLevel: 2 | 3;
  expectedMatches: number;
  renumberHeadings?: boolean;
}

export interface FilterConfig {
  version: string;
  /** 需要从主知识库分流出去的文档：不进主目录、title.json 与向量库，改由 urls-<divertScope>.json 单独抓取。 */
  divertIds: string[];
  /** 分流条目的 scope，同时决定落盘目录 Miliastra-knowledge/<divertScope>/。 */
  divertScope: string;
  skipUpdateIds: string[];
  redactSections: SectionRedaction[];
}

export async function loadFilterConfig(fileName?: string): Promise<FilterConfig | undefined> {
  if (!fileName) return undefined;
  const filePath = path.resolve(process.cwd(), fileName);
  const config = JSON.parse(await fs.readFile(filePath, 'utf-8')) as FilterConfig;
  if (
    !Array.isArray(config.divertIds) ||
    !Array.isArray(config.skipUpdateIds) ||
    !Array.isArray(config.redactSections) ||
    typeof config.divertScope !== 'string' ||
    config.divertScope.trim() === ''
  ) {
    throw new Error(`过滤配置格式错误: ${filePath}`);
  }
  return config;
}

export function filterCatalogEntries(entries: URLEntry[], previousEntries: URLEntry[], config?: FilterConfig): URLEntry[] {
  if (!config) return entries;
  const previousById = new Map(previousEntries.map(entry => [entry.id, entry]));
  const diverted = new Set(config.divertIds);
  const preserved = new Set(config.skipUpdateIds);
  return entries
    .filter(entry => !diverted.has(entry.id))
    .map(entry => {
      if (!preserved.has(entry.id)) return entry;
      const previous = previousById.get(entry.id);
      if (!previous) throw new Error(`过滤配置要求保留旧版文档，但旧目录中找不到 ${entry.id}`);
      return previous;
    });
}

/** 收集需要分流到独立目录的条目，并把 scope 改写为 divertScope（决定落盘路径）。 */
export function getDivertEntries(entries: URLEntry[], config?: FilterConfig): URLEntry[] {
  if (!config || config.divertIds.length === 0) return [];
  const diverted = new Set(config.divertIds);
  const matched = entries.filter(entry => diverted.has(entry.id));
  const missing = config.divertIds.filter(id => !matched.some(entry => entry.id === id));
  if (missing.length > 0) {
    throw new Error(`分流配置中的文档在目录中找不到: ${missing.join(', ')}`);
  }
  return matched.map(entry => ({ ...entry, scope: config.divertScope }));
}

/** 主知识库抓取时跳过的条目：保留本地旧版内容，不用新版覆盖。分流条目不在此列，它们由独立配置抓取。 */
export function shouldSkipScrape(id: string, config?: FilterConfig): boolean {
  return config !== undefined && config.skipUpdateIds.includes(id);
}

export function redactMarkdown(markdown: string, documentId: string, config?: FilterConfig): string {
  const rules = config?.redactSections.filter(rule => rule.documentId === documentId) ?? [];
  if (rules.length === 0) return markdown;

  let result = markdown;
  for (const rule of rules) {
    const lines = result.split('\n');
    const kept: string[] = [];
    let insideVersion = rule.withinHeading === undefined;
    let removing = false;
    let matches = 0;

    for (const line of lines) {
      const heading = line.match(/^(#{1,6}) (.+)$/);
      if (heading) {
        const level = heading[1].length;
        if (level === 1 && rule.withinHeading !== undefined) {
          insideVersion = heading[2].trim() === rule.withinHeading;
        }
        if (removing && level <= rule.headingLevel) {
          removing = false;
        }
        if (insideVersion && level === rule.headingLevel && heading[2].includes(rule.headingContains)) {
          removing = true;
          matches++;
        }
      }
      if (!removing) kept.push(line);
    }

    if (matches !== rule.expectedMatches) {
      throw new Error(`文档 ${documentId} 应过滤 ${rule.expectedMatches} 个“${rule.headingContains}”段落，实际匹配 ${matches} 个`);
    }
    result = kept.join('\n').replace(/\n{3,}/g, '\n\n');
    if (rule.renumberHeadings && rule.withinHeading) {
      let inVersion = false;
      let sectionIndex = 0;
      result = result.split('\n').map(line => {
        if (line.startsWith('# ')) {
          inVersion = line.slice(2).trim() === rule.withinHeading;
        } else if (inVersion && line.startsWith('## ')) {
          sectionIndex = 0;
        } else if (inVersion && /^### \d+[.、]/.test(line)) {
          sectionIndex++;
          return line.replace(/^### \d+[.、]\s*/, `### ${sectionIndex}.`);
        }
        return line;
      }).join('\n');
    }
  }
  return result;
}
