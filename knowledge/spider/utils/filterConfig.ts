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
  excludeNewIds: string[];
  skipUpdateIds: string[];
  redactSections: SectionRedaction[];
}

export async function loadFilterConfig(fileName?: string): Promise<FilterConfig | undefined> {
  if (!fileName) return undefined;
  const filePath = path.resolve(process.cwd(), fileName);
  const config = JSON.parse(await fs.readFile(filePath, 'utf-8')) as FilterConfig;
  if (!Array.isArray(config.excludeNewIds) || !Array.isArray(config.skipUpdateIds) || !Array.isArray(config.redactSections)) {
    throw new Error(`过滤配置格式错误: ${filePath}`);
  }
  return config;
}

export function filterCatalogEntries(entries: URLEntry[], previousEntries: URLEntry[], config?: FilterConfig): URLEntry[] {
  if (!config) return entries;
  const previousById = new Map(previousEntries.map(entry => [entry.id, entry]));
  const excluded = new Set(config.excludeNewIds);
  const preserved = new Set(config.skipUpdateIds);
  return entries
    .filter(entry => !excluded.has(entry.id))
    .map(entry => {
      if (!preserved.has(entry.id)) return entry;
      const previous = previousById.get(entry.id);
      if (!previous) throw new Error(`过滤配置要求保留旧版文档，但旧目录中找不到 ${entry.id}`);
      return previous;
    });
}

export function shouldSkipScrape(id: string, config?: FilterConfig): boolean {
  return config !== undefined && (config.excludeNewIds.includes(id) || config.skipUpdateIds.includes(id));
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
