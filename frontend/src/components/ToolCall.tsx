import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import PageHeader from './ui/PageHeader'
import Surface from './ui/Surface'
import Button from './ui/Button'
import Textarea from './ui/Textarea'

function SectionHeader({
  title,
  subtitle,
  badge,
}: {
  title: string
  subtitle: string
  badge: string
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-on-surface">{title}</h3>
        <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p>
      </div>
      <span className="rounded-lg bg-surface-variant px-2 py-1 text-xs font-medium text-on-surface-variant shrink-0">
        {badge}
      </span>
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
    <Textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={4}
      className="min-h-[112px] leading-6"
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
  const { t } = useTranslation()
  if (loading) {
    return (
      <Surface className="text-sm text-on-surface-variant">
        {t('tools.callingTool')}
      </Surface>
    )
  }

  if (error) {
    return (
      <Surface className="border-error/50 bg-error-container text-error">
        {error}
      </Surface>
    )
  }

  if (!hasResult) {
    return (
      <Surface className="text-sm text-on-surface-variant">{emptyText}</Surface>
    )
  }

  return <>{children}</>
}

function NodeMatchCard({ match }: { match: NodeMatch }) {
  const { t } = useTranslation()
  return (
    <Surface className="!p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h5 className="text-base font-semibold text-on-surface">
            {match.title}
          </h5>
          <p className="mt-1 text-xs text-on-surface-variant">
            {match.main_title}
          </p>
        </div>
        <span className="rounded-lg bg-surface-variant px-2 py-1 text-xs text-on-surface-variant shrink-0">
          {match.source_doc_title}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-on-surface-variant md:grid-cols-2">
        <div>
          <span className="font-medium text-on-surface">{t('tools.docPath')}</span>
          {match.local_path}
        </div>
        <div>
          <span className="font-medium text-on-surface">{t('tools.derivedFile')}</span>
          {match.output_file}
        </div>
      </div>
      <div className="prose prose-sm mt-4 max-w-none rounded-xl border border-outline bg-surface-variant px-4 py-3 prose-headings:text-on-surface prose-p:text-on-surface prose-strong:text-on-surface">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {match.content || t('tools.noNodeContent')}
        </ReactMarkdown>
      </div>
    </Surface>
  )
}

function DocumentCard({ document }: { document: DocumentMatch }) {
  const { t } = useTranslation()
  return (
    <Surface className="!p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h5 className="text-base font-semibold text-on-surface">
            {document.title}
          </h5>
          <p className="mt-1 text-sm text-on-surface-variant">{document.file}</p>
        </div>
        <span className="rounded-lg bg-surface-variant px-2 py-1 text-xs text-on-surface-variant shrink-0">
          {t('tools.relatedNodes', { count: document.related_nodes.length })}
        </span>
      </div>
      <details
        className="mt-4 overflow-hidden rounded-xl border border-outline bg-surface-variant"
        open
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-on-surface">
          {t('tools.viewDocument')}
        </summary>
        <div className="prose prose-sm max-w-none border-t border-outline px-4 py-4 prose-headings:text-on-surface prose-p:text-on-surface prose-pre:bg-on-surface prose-pre:text-surface">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {document.content}
          </ReactMarkdown>
        </div>
      </details>
    </Surface>
  )
}

export default function ToolCall() {
  const { t } = useTranslation()
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
      setNodeError(t('tools.enterNodeName'))
      setNodeResults([])
      return
    }

    setNodeLoading(true)
    setNodeError('')
    try {
      const result = await fetchNodeInfo(names)
      setNodeResults(result)
    } catch (error) {
      setNodeError(error instanceof Error ? error.message : t('tools.nodeQueryFailed'))
      setNodeResults([])
    } finally {
      setNodeLoading(false)
    }
  }

  const handleDocumentSearch = async () => {
    const titles = parseBatchInput(documentInput)
    if (titles.length === 0) {
      setDocumentError(t('tools.enterDocumentTitle'))
      setDocumentResults([])
      return
    }

    setDocumentLoading(true)
    setDocumentError('')
    try {
      const result = await fetchDocumentContent(titles)
      setDocumentResults(result)
    } catch (error) {
      setDocumentError(
        error instanceof Error ? error.message : t('tools.documentFetchFailed')
      )
      setDocumentResults([])
    } finally {
      setDocumentLoading(false)
    }
  }

  const handleTitleSearch = async () => {
    const keywords = parseBatchInput(titleInput)
    if (keywords.length === 0) {
      setTitleError(t('tools.enterDocumentKeyword'))
      setTitleResults([])
      return
    }

    setTitleLoading(true)
    setTitleError('')
    try {
      const result = await fetchDocumentTitles(keywords)
      setTitleResults(result)
    } catch (error) {
      setTitleError(
        error instanceof Error ? error.message : t('tools.titleSearchFailed')
      )
      setTitleResults([])
    } finally {
      setTitleLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={t('tools.title')} />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
        <Surface>
          <p className="text-sm leading-6 text-on-surface-variant">
            {t('tools.intro')}
          </p>
        </Surface>

        <Surface>
          <SectionHeader
            title={t('tools.nodeSection')}
            subtitle={t('tools.nodeSubtitle')}
            badge="get_node_info"
          />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_1fr]">
            <div className="space-y-3">
              <BatchInput
                value={nodeInput}
                onChange={setNodeInput}
                placeholder="例如：随机卡牌选择器选择列表\n查询经典模式角色编号"
              />
              <div className="flex flex-col gap-3 text-xs text-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
                <span>{t('tools.batchInputHint')}</span>
                <Button
                  onClick={handleNodeSearch}
                  disabled={nodeLoading}
                  className="whitespace-nowrap"
                >
                  {nodeLoading ? t('common.querying') : t('tools.queryNode')}
                </Button>
              </div>
            </div>
            <div className="min-w-0">
              <ResultShell
                loading={nodeLoading}
                error={nodeError}
                emptyText={t('tools.nodeResultEmpty')}
                hasResult={nodeResults.length > 0}
              >
                <div className="space-y-4">
                  {nodeResults.map((item) => (
                    <Surface
                      key={item.query}
                      className="!bg-surface-variant !p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-on-surface">
                          {t('tools.queryWord', { query: item.query })}
                        </h4>
                        <span className="rounded-lg bg-surface px-2 py-1 text-xs text-on-surface-variant">
                          {t('tools.hitCount', { count: item.matches.length })}
                        </span>
                      </div>
                      {item.matches.length === 0 ? (
                        <p className="text-sm text-on-surface-variant mt-2">
                          {item.message || t('common.noResults')}
                        </p>
                      ) : (
                        <div className="space-y-3 mt-3">
                          {item.matches.map((match) => (
                            <NodeMatchCard
                              key={`${item.query}-${match.title}-${match.output_file}`}
                              match={match}
                            />
                          ))}
                        </div>
                      )}
                    </Surface>
                  ))}
                </div>
              </ResultShell>
            </div>
          </div>
        </Surface>

        <Surface>
          <SectionHeader
            title={t('tools.documentSection')}
            subtitle={t('tools.documentSubtitle')}
            badge="get_document"
          />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_1fr]">
            <div className="space-y-3">
              <BatchInput
                value={documentInput}
                onChange={setDocumentInput}
                placeholder="例如：编辑项范围限制\n经典模式角色编号一览"
              />
              <div className="flex flex-col gap-3 text-xs text-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
                <span>{t('tools.documentCountHint')}</span>
                <Button
                  onClick={handleDocumentSearch}
                  disabled={documentLoading}
                  className="whitespace-nowrap"
                >
                  {documentLoading ? t('tools.fetching') : t('tools.fetchDocument')}
                </Button>
              </div>
            </div>
            <div className="min-w-0">
              <ResultShell
                loading={documentLoading}
                error={documentError}
                emptyText={t('tools.documentResultEmpty')}
                hasResult={documentResults.length > 0}
              >
                <div className="space-y-4">
                  {documentResults.map((item) => (
                    <Surface
                      key={item.query}
                      className="!bg-surface-variant !p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-on-surface">
                          {t('tools.queryWord', { query: item.query })}
                        </h4>
                        <span className="rounded-lg bg-surface px-2 py-1 text-xs text-on-surface-variant">
                          {item.status}
                        </span>
                      </div>
                      {item.status === 'ok' && item.documents ? (
                        <div className="space-y-3 mt-3">
                          {item.documents.map((document) => (
                            <DocumentCard
                              key={`${item.query}-${document.file}`}
                              document={document}
                            />
                          ))}
                        </div>
                      ) : null}
                      {item.status === 'too_many' && item.matches ? (
                        <Surface className="mt-3 !bg-primary-container/50 !border-primary/20">
                          <p className="font-medium text-on-primary-container">
                            {item.message}
                          </p>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {item.matches.map((match) => (
                              <Surface
                                key={`${item.query}-${match.file}`}
                                className="!p-3"
                              >
                                <div className="font-medium text-on-surface text-sm">
                                  {match.title}
                                </div>
                                <div className="mt-1 text-xs text-on-surface-variant">
                                  {match.file}
                                </div>
                              </Surface>
                            ))}
                          </div>
                        </Surface>
                      ) : null}
                      {item.status === 'not_found' ? (
                        <Surface className="mt-3 !border-dashed">
                          <p className="font-medium text-on-surface text-sm">
                            {item.message}
                          </p>
                          {item.available_titles_sample &&
                            item.available_titles_sample.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {item.available_titles_sample
                                .slice(0, 12)
                                .map((title) => (
                                  <span
                                    key={`${item.query}-${title}`}
                                    className="rounded-lg bg-surface-variant px-2 py-1 text-xs text-on-surface-variant"
                                  >
                                    {title}
                                  </span>
                                ))}
                            </div>
                          ) : null}
                        </Surface>
                      ) : null}
                    </Surface>
                  ))}
                </div>
              </ResultShell>
            </div>
          </div>
        </Surface>

        <Surface>
          <SectionHeader
            title={t('tools.titleSection')}
            subtitle={t('tools.titleSubtitle')}
            badge="list_documents"
          />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_1fr]">
            <div className="space-y-3">
              <BatchInput
                value={titleInput}
                onChange={setTitleInput}
                placeholder="例如：随机卡牌选择, 编辑项范围限制, 经典模式角色编号"
              />
              <div className="flex flex-col gap-3 text-xs text-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
                <span>{t('tools.titleSearchHint')}</span>
                <Button
                  onClick={handleTitleSearch}
                  disabled={titleLoading}
                  className="whitespace-nowrap"
                >
                  {titleLoading ? t('tools.searching') : t('tools.searchTitle')}
                </Button>
              </div>
            </div>
            <div className="min-w-0">
              <ResultShell
                loading={titleLoading}
                error={titleError}
                emptyText={t('tools.titleResultEmpty')}
                hasResult={titleResults.length > 0}
              >
                <div className="space-y-4">
                  {titleResults.map((group) => (
                    <Surface
                      key={group.keyword}
                      className="!bg-surface-variant !p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-on-surface">
                          {t('tools.keyword', { keyword: group.keyword })}
                        </h4>
                        <span className="rounded-lg bg-surface px-2 py-1 text-xs text-on-surface-variant">
                          {t('tools.hitCount', { count: group.total })}
                        </span>
                      </div>
                      {group.documents.length === 0 ? (
                        <p className="mt-3 text-sm text-on-surface-variant">
                          {t('tools.noDocTitleFound')}
                        </p>
                      ) : (
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {group.documents.map((document) => (
                            <Surface
                              key={`${group.keyword}-${document.file}`}
                              className="!p-4"
                            >
                              <h5 className="text-sm font-semibold text-on-surface">
                                {document.title}
                              </h5>
                              <p className="mt-2 text-xs leading-5 text-on-surface-variant">
                                {document.file}
                              </p>
                            </Surface>
                          ))}
                        </div>
                      )}
                    </Surface>
                  ))}
                </div>
              </ResultShell>
            </div>
          </div>
        </Surface>
      </div>
    </div>
  )
}
