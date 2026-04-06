export interface SkillToolEnvelope<TResult> {
  success: boolean
  data: {
    skill: string
    tool: string
    result: TResult
  }
  error: string | null
}

export interface NodeMatch {
  title: string
  main_title: string
  source_doc_title: string
  local_path: string
  output_file: string
  content: string
}

export interface NodeQueryResult {
  query: string
  matches: NodeMatch[]
  message?: string
}

export interface DocumentEntry {
  title: string
  file: string
}

export interface FilteredDocumentsResult {
  keyword: string
  total: number
  documents: DocumentEntry[]
}

export interface DocumentMatch {
  title: string
  file: string
  content: string
  related_nodes: NodeMatch[]
}

export interface DocumentQueryResult {
  query: string
  status: 'ok' | 'too_many' | 'not_found'
  message?: string
  documents?: DocumentMatch[]
  matches?: DocumentEntry[]
  available_titles_sample?: string[]
  related_nodes?: NodeMatch[]
}

const SKILL_ID = 'miliastra-knowledge'
const BASE_PATH = `/api/v1/skills/${SKILL_ID}/tools`

async function postTool<TRequest, TResult>(tool: string, body: TRequest): Promise<TResult> {
  const response = await fetch(`${BASE_PATH}/${tool}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = (await response.json()) as SkillToolEnvelope<TResult>
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || '工具调用失败')
  }

  return payload.data.result
}

export function parseBatchInput(value: string): string[] {
  return value
    .split(/[\n,，；;]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export function fetchNodeInfo(names: string[]): Promise<NodeQueryResult[]> {
  return postTool<{ names: string[] }, NodeQueryResult[]>('get_node_info', { names })
}

export function fetchDocumentContent(titles: string[]): Promise<DocumentQueryResult[]> {
  return postTool<{ titles: string[] }, DocumentQueryResult[]>('get_document', { titles })
}

export function fetchDocumentTitles(keywords: string[]): Promise<FilteredDocumentsResult[]> {
  return postTool<{ keywords: string[] }, FilteredDocumentsResult[]>('list_documents', { keywords })
}
