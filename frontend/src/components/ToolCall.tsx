import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {
  type DocumentMatch,
  type DocumentQueryResult,
  type FilteredDocumentsResult,
  type NodeMatch,
  type NodeQueryResult,
  fetchDocumentContent,
  fetchDocumentTitles,
  fetchNodeInfo,
  parseBatchInput,
} from '../utils/skillApi'

function SectionHeader({ title, subtitle, badge }: { title: string; subtitle: string; badge: string }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{badge}</span>
    </div>
  )
}

function BatchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={4}
      className="min-h-[112px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
    />
  )
}

function ResultShell({
  loading,
  error,
  emptyText,
  hasResult,
  children,
}: {
  loading: boolean
  error: string
  emptyText: string
  hasResult: boolean
  children: React.ReactNode
}) {
  if (loading) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">正在调用工具...</div>
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
  }

  if (!hasResult) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">{emptyText}</div>
  }

  return <>{children}</>
}

function NodeMatchCard({ match }: { match: NodeMatch }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h5 className="text-base font-semibold text-slate-900">{match.title}</h5>
          <p className="mt-1 text-xs text-slate-500">{match.main_title}</p>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{match.source_doc_title}</span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
        <div>
          <span className="font-medium text-slate-700">文档路径：</span>
          {match.local_path}
        </div>
        <div>
          <span className="font-medium text-slate-700">派生文件：</span>
          {match.output_file}
        </div>
      </div>
      <div className="prose prose-sm mt-4 max-w-none rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 prose-headings:text-slate-900 prose-p:text-slate-700 prose-strong:text-slate-900">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{match.content || '暂无节点正文内容。'}</ReactMarkdown>
      </div>
    </article>
  )
}

function DocumentCard({ document }: { document: DocumentMatch }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h5 className="text-base font-semibold text-slate-900">{document.title}</h5>
          <p className="mt-1 text-sm text-slate-500">{document.file}</p>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">相关节点 {document.related_nodes.length}</span>
      </div>
      <details className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50" open>
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-700">查看文档内容</summary>
        <div className="prose prose-sm max-w-none border-t border-slate-200 px-4 py-4 prose-headings:text-slate-900 prose-p:text-slate-700 prose-pre:bg-slate-900 prose-pre:text-slate-100">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{document.content}</ReactMarkdown>
        </div>
      </details>
    </article>
  )
}

export default function ToolCall() {
  const [nodeInput, setNodeInput] = useState('')
  const [nodeLoading, setNodeLoading] = useState(false)
  const [nodeError, setNodeError] = useState('')
  const [nodeResults, setNodeResults] = useState<NodeQueryResult[]>([])

  const [documentInput, setDocumentInput] = useState('')
  const [documentLoading, setDocumentLoading] = useState(false)
  const [documentError, setDocumentError] = useState('')
  const [documentResults, setDocumentResults] = useState<DocumentQueryResult[]>([])

  const [titleInput, setTitleInput] = useState('')
  const [titleLoading, setTitleLoading] = useState(false)
  const [titleError, setTitleError] = useState('')
  const [titleResults, setTitleResults] = useState<FilteredDocumentsResult[]>([])

  const handleNodeSearch = async () => {
    const names = parseBatchInput(nodeInput)
    if (names.length === 0) {
      setNodeError('请输入至少一个节点名称')
      setNodeResults([])
      return
    }

    setNodeLoading(true)
    setNodeError('')
    try {
      const result = await fetchNodeInfo(names)
      setNodeResults(result)
    } catch (error) {
      setNodeError(error instanceof Error ? error.message : '节点查询失败')
      setNodeResults([])
    } finally {
      setNodeLoading(false)
    }
  }

  const handleDocumentSearch = async () => {
    const titles = parseBatchInput(documentInput)
    if (titles.length === 0) {
      setDocumentError('请输入至少一个文档标题或关键词')
      setDocumentResults([])
      return
    }

    setDocumentLoading(true)
    setDocumentError('')
    try {
      const result = await fetchDocumentContent(titles)
      setDocumentResults(result)
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : '文档内容获取失败')
      setDocumentResults([])
    } finally {
      setDocumentLoading(false)
    }
  }

  const handleTitleSearch = async () => {
    const keywords = parseBatchInput(titleInput)
    if (keywords.length === 0) {
      setTitleError('请输入至少一个文档关键词')
      setTitleResults([])
      return
    }

    setTitleLoading(true)
    setTitleError('')
    try {
      const result = await fetchDocumentTitles(keywords)
      setTitleResults(result)
    } catch (error) {
      setTitleError(error instanceof Error ? error.message : '文档标题检索失败')
      setTitleResults([])
    } finally {
      setTitleLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">工具调用</h2>

      <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm">
        <p className="text-sm leading-6 text-slate-600">
          这里直接调用千星知识 skill API，用于结构化查询节点、获取文档内容和检索文档标题。输入支持逗号、中文逗号、分号或换行批量调用。
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm">
        <SectionHeader title="节点" subtitle="适合已经知道节点名，或想用模糊关键词一次查多个节点。" badge="get_node_info" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_1fr]">
          <div className="space-y-3">
            <BatchInput value={nodeInput} onChange={setNodeInput} placeholder="例如：随机卡牌选择器选择列表\n查询经典模式角色编号" />
            <div className="flex flex-col gap-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>支持逗号、中文逗号、分号或换行批量输入</span>
              <button onClick={handleNodeSearch} disabled={nodeLoading} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white whitespace-nowrap hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400">
                {nodeLoading ? '查询中...' : '查询节点'}
              </button>
            </div>
          </div>
          <div className="min-w-0">
            <ResultShell loading={nodeLoading} error={nodeError} emptyText="节点结果会显示在这里。" hasResult={nodeResults.length > 0}>
              <div className="space-y-4">
                {nodeResults.map((item) => (
                  <div key={item.query} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-slate-900">查询词：{item.query}</h4>
                      <span className="rounded bg-white px-2 py-1 text-xs text-slate-600">命中 {item.matches.length}</span>
                    </div>
                    {item.matches.length === 0 ? (
                      <p className="text-sm text-slate-500">{item.message || '未找到结果'}</p>
                    ) : (
                      <div className="space-y-3">
                        {item.matches.map((match) => (
                          <NodeMatchCard key={`${item.query}-${match.title}-${match.output_file}`} match={match} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ResultShell>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm">
        <SectionHeader title="获取文档内容" subtitle="输入文档标题或系统关键词，直接查看命中文档全文和相关节点。" badge="get_document" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_1fr]">
          <div className="space-y-3">
            <BatchInput value={documentInput} onChange={setDocumentInput} placeholder="例如：编辑项范围限制\n经典模式角色编号一览" />
            <div className="flex flex-col gap-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>建议一次输入 1 到 3 个主题，便于阅读返回内容</span>
              <button onClick={handleDocumentSearch} disabled={documentLoading} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white whitespace-nowrap hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
                {documentLoading ? '获取中...' : '获取文档'}
              </button>
            </div>
          </div>
          <div className="min-w-0">
            <ResultShell loading={documentLoading} error={documentError} emptyText="文档内容结果会显示在这里。" hasResult={documentResults.length > 0}>
              <div className="space-y-4">
                {documentResults.map((item) => (
                  <div key={item.query} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-slate-900">查询词：{item.query}</h4>
                      <span className="rounded bg-white px-2 py-1 text-xs text-slate-600">{item.status}</span>
                    </div>
                    {item.status === 'ok' && item.documents ? (
                      <div className="space-y-3">
                        {item.documents.map((document) => (
                          <DocumentCard key={`${item.query}-${document.file}`} document={document} />
                        ))}
                      </div>
                    ) : null}
                    {item.status === 'too_many' && item.matches ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        <p className="font-medium">{item.message}</p>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {item.matches.map((match) => (
                            <div key={`${item.query}-${match.file}`} className="rounded-lg border border-amber-100 bg-white px-3 py-2 text-slate-700">
                              <div className="font-medium text-slate-900">{match.title}</div>
                              <div className="mt-1 text-xs text-slate-500">{match.file}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {item.status === 'not_found' ? (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                        <p className="font-medium text-slate-900">{item.message}</p>
                        {item.available_titles_sample && item.available_titles_sample.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.available_titles_sample.slice(0, 12).map((title) => (
                              <span key={`${item.query}-${title}`} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                                {title}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </ResultShell>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm">
        <SectionHeader title="文档标题检索" subtitle="先看有哪些文档，再决定下一步拿全文还是回到聊天里问。" badge="list_documents" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_1fr]">
          <div className="space-y-3">
            <BatchInput value={titleInput} onChange={setTitleInput} placeholder="例如：随机卡牌选择, 编辑项范围限制, 经典模式角色编号" />
            <div className="flex flex-col gap-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>适合不知道精确文档名时先做筛选</span>
              <button onClick={handleTitleSearch} disabled={titleLoading} className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white whitespace-nowrap hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-400">
                {titleLoading ? '检索中...' : '检索标题'}
              </button>
            </div>
          </div>
          <div className="min-w-0">
            <ResultShell loading={titleLoading} error={titleError} emptyText="文档标题检索结果会显示在这里。" hasResult={titleResults.length > 0}>
              <div className="space-y-4">
                {titleResults.map((group) => (
                  <div key={group.keyword} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-slate-900">关键词：{group.keyword}</h4>
                      <span className="rounded bg-white px-2 py-1 text-xs text-slate-600">命中 {group.total}</span>
                    </div>
                    {group.documents.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">没有找到相关文档标题。</p>
                    ) : (
                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {group.documents.map((document) => (
                          <article key={`${group.keyword}-${document.file}`} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                            <h5 className="text-sm font-semibold text-slate-900">{document.title}</h5>
                            <p className="mt-2 text-xs leading-5 text-slate-500">{document.file}</p>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ResultShell>
          </div>
        </div>
      </section>
    </div>
  )
}
