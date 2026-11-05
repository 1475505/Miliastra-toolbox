import path from 'path';
import fs from 'fs/promises';

export interface MarkdownPathInput {
  id: string;
  title: string;
  scope: string;
}

const SCOPE_DIRECTORY_MAP: Record<string, string[]> = {
  guide: ['Miliastra-knowledge', 'official', 'guide'],
  tutorial: ['Miliastra-knowledge', 'official', 'tutorial'],
  official_faq: ['Miliastra-knowledge', 'official', 'faq'],
};

export function sanitizeDocumentTitle(title: string): string {
  return title
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function resolveScopeDirectory(scope: string): string[] {
  return SCOPE_DIRECTORY_MAP[scope] || ['Miliastra-knowledge', scope];
}

export function buildRelativeMarkdownPath(input: MarkdownPathInput): string {
  const safeTitle = sanitizeDocumentTitle(input.title);
  return path.join(...resolveScopeDirectory(input.scope), `${input.id}_${safeTitle}.md`);
}

export function buildAbsoluteMarkdownPath(knowledgeDir: string, input: MarkdownPathInput): string {
  return path.join(knowledgeDir, buildRelativeMarkdownPath(input));
}
/** Remove older filenames for the same ID only after the replacement is readable. */
export async function pruneObsoleteMarkdownPaths(knowledgeDir: string, input: MarkdownPathInput): Promise<void> {
  const target = buildAbsoluteMarkdownPath(knowledgeDir, input);
  const replacement = await fs.readFile(target, 'utf-8');
  const frontmatterId = (text: string): string | undefined => text.match(/^---\n[\s\S]*?^id:\s*(\S+)\s*$/m)?.[1];
  if (frontmatterId(replacement) !== input.id) throw new Error('Replacement document ID mismatch');
  const scopes = input.scope in SCOPE_DIRECTORY_MAP ? Object.keys(SCOPE_DIRECTORY_MAP) : [input.scope];
  for (const scope of scopes) {
    const directory = path.join(knowledgeDir, ...resolveScopeDirectory(scope));
    const names = await fs.readdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (candidate === target || !name.startsWith(`${input.id}_`) || !name.endsWith('.md')) continue;
      if (frontmatterId(await fs.readFile(candidate, 'utf-8')) === input.id) await fs.unlink(candidate);
    }
  }
}
