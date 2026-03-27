import path from 'path';

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