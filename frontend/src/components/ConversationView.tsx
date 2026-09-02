import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTranslation } from 'react-i18next'

import {
  type ChatMessage,
  type ExtendedMessage,
  type SourceMessage,
  type ToolCallMessage,
  type ToolTrace,
} from '../types'

export interface ConversationTurn {
  key: string
  user?: ExtendedMessage
  assistant?: ExtendedMessage
  toolTraces: ToolCallMessage[]
  sources: SourceMessage[]
}

export function buildConversationTurns(chatMessages: ChatMessage[]): ConversationTurn[] {
  const turns: ConversationTurn[] = []

  const ensureTurn = () => {
    const currentTurn = turns[turns.length - 1]
    if (currentTurn) {
      return currentTurn
    }

    const nextTurn: ConversationTurn = {
      key: `turn_${turns.length}`,
      toolTraces: [],
      sources: [],
    }
    turns.push(nextTurn)
    return nextTurn
  }

  chatMessages.forEach((msg, index) => {
    if ('role' in msg && msg.role === 'user') {
      turns.push({
        key: `turn_${index}`,
        user: msg,
        toolTraces: [],
        sources: [],
      })
      return
    }

    const currentTurn = ensureTurn()

    if ('role' in msg && msg.role === 'assistant') {
      if (currentTurn.assistant) {
        turns.push({
          key: `turn_${index}`,
          assistant: msg,
          toolTraces: [],
          sources: [],
        })
        return
      }

      currentTurn.assistant = msg
      return
    }

    if ('type' in msg && msg.type === 'tool_trace') {
      currentTurn.toolTraces.push(msg)
      return
    }

    if ('type' in msg && msg.type === 'sources') {
      currentTurn.sources.push(msg)
    }
  })

  return turns.filter(
    (turn) =>
      turn.user ||
      turn.assistant ||
      turn.toolTraces.length > 0 ||
      turn.sources.length > 0
  )
}

function getLatestToolStats(
  toolTraces: ToolCallMessage[]
): ToolCallMessage['stats'] {
  for (let index = toolTraces.length - 1; index >= 0; index--) {
    if (toolTraces[index].stats) {
      return toolTraces[index].stats
    }
  }
  return undefined
}

function getLatestSourceTokens(
  sourceMessages: SourceMessage[]
): number | undefined {
  for (let index = sourceMessages.length - 1; index >= 0; index--) {
    if (sourceMessages[index].tokens) {
      return sourceMessages[index].tokens
    }
  }
  return undefined
}

function getUserImages(msg: ExtendedMessage): string[] {
  if (msg.imageBase64s && msg.imageBase64s.length > 0) return msg.imageBase64s
  if (msg.imageBase64) return [msg.imageBase64]
  return []
}

interface ConversationViewProps {
  turns: ConversationTurn[]
}

/** 只读的对话消息渲染，供 Chat 与分享页共用 */
export default function ConversationView({ turns }: ConversationViewProps) {
  const { t } = useTranslation()
  const reasoningBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = reasoningBoxRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [turns])

  return (
    <>
      {turns.map((turn) => {
        const turnStats = getLatestToolStats(turn.toolTraces)
        const sourceTokens = getLatestSourceTokens(turn.sources)
        const userImages = turn.user ? getUserImages(turn.user) : []
        const sharedImageCount = turn.user?.imageCount || 0

        return (
          <div key={turn.key} className="space-y-3">
            {turn.user && (
              <div className="flex justify-end">
                <div className="max-w-3xl px-4 py-3 rounded-2xl bg-primary-container text-on-surface border border-primary/10">
                  <div className="whitespace-pre-wrap">
                    {userImages.map((src, idx) => (
                      <div key={`${src.slice(0, 32)}_${idx}`} className="mb-2">
                        <img
                          src={src}
                          alt={t('chat.userImageAlt')}
                          className="max-w-full h-auto rounded-xl border border-white/20"
                          style={{ maxHeight: '300px' }}
                        />
                      </div>
                    ))}
                    {userImages.length === 0 && sharedImageCount > 0 && (
                      <div className="mb-2 inline-flex items-center gap-1.5 text-xs text-on-surface-variant bg-surface/80 border border-outline rounded-lg px-2 py-1">
                        <span className="font-medium">[{t('chat.sharedImagePlaceholder', { count: sharedImageCount })}]</span>
                      </div>
                    )}
                    {turn.user.content}
                  </div>
                </div>
              </div>
            )}

            {turn.toolTraces.length > 0 && (
              <div className="flex justify-start">
                <div className="max-w-4xl px-4 py-3 rounded-2xl bg-violet-50 text-gray-900">
                  <details open className="group">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 select-none list-none">
                      <div className="font-semibold text-sm text-violet-800">{t('chat.toolCalls')}</div>
                      {turnStats && (
                        <div className="flex gap-3 text-gray-500 text-xs">
                          <span>{t('chat.tokens', { count: turnStats.tokens })}</span>
                          <span>{t('chat.toolCount', { count: turnStats.tool_calls })}</span>
                          <span>{t('chat.retrievalCount', { count: turnStats.retrieval_calls })}</span>
                        </div>
                      )}
                    </summary>
                    <div className="mt-2 space-y-1.5">
                      {turn.toolTraces
                        .flatMap((toolMessage) => toolMessage.traces)
                        .map((trace: ToolTrace, index) => (
                          <div
                            key={`${trace.tool}_${index}`}
                            className="pb-1.5 border-b border-violet-100 last:border-0"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-block w-1.5 h-1.5 rounded-full ${
                                  trace.status === 'success'
                                    ? 'bg-green-500'
                                    : trace.status === 'error'
                                    ? 'bg-red-500'
                                    : 'bg-emerald-400'
                                }`}
                              />
                              <span className="font-medium text-sm text-violet-800">
                                {trace.tool}
                              </span>
                              <span
                                className={`text-xs ${
                                  trace.status === 'success'
                                    ? 'text-green-600'
                                    : trace.status === 'error'
                                    ? 'text-red-600'
                                    : 'text-emerald-600'
                                }`}
                              >
                                {trace.status === 'success'
                                  ? t('chat.traceSuccess')
                                  : trace.status === 'error'
                                  ? t('chat.traceError')
                                  : t('chat.traceRunning')}
                              </span>
                            </div>
                            {trace.args && Object.keys(trace.args).length > 0 && (
                              <div className="text-gray-500 text-xs mt-1 font-mono bg-violet-100/50 rounded-lg px-2 py-1">
                                {Object.entries(trace.args)
                                  .map(([k, v]) => `${k}: ${v}`)
                                  .join(', ')}
                              </div>
                            )}
                            <div className="text-gray-600 text-xs mt-1">
                              {trace.summary}
                            </div>
                            {trace.sources && trace.sources.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {trace.sources.map((src, si) => (
                                  <a
                                    key={`${src.url}_${si}`}
                                    href={src.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 hover:underline bg-violet-100/60 rounded-lg px-1.5 py-0.5"
                                  >
                                    {src.title}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </details>
                </div>
              </div>
            )}

            {turn.assistant && (
              <div className="flex justify-start">
                <div className="max-w-4xl px-4 py-3 rounded-2xl bg-surface text-on-surface border border-outline/60 shadow-surface">
                  <div className="prose prose-sm max-w-none prose-slate">
                    {turn.assistant.reasoning && (
                      <details
                        className="mb-4 border border-gray-200 rounded-lg bg-white overflow-hidden"
                        open={turn.assistant.isReasoning}
                      >
                        <summary className="px-4 py-2 bg-gray-50 cursor-pointer text-xs font-medium text-gray-500 hover:bg-gray-100 select-none flex items-center">
                          <span>{t('chat.reasoning')}</span>
                        </summary>
                        <div
                          ref={turn.assistant.isReasoning ? reasoningBoxRef : undefined}
                          className="px-4 py-3 text-gray-600 text-sm bg-gray-50/50 whitespace-pre-wrap border-t border-gray-100 max-h-60 overflow-y-auto"
                        >
                          {turn.assistant.reasoning}
                        </div>
                      </details>
                    )}
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {turn.assistant.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}

            {turn.sources.length > 0 && (
              <div className="flex justify-start">
                <div className="max-w-4xl px-4 py-3 rounded-2xl bg-blue-50 text-gray-900">
                  <div className="font-semibold mb-2 text-sm">{t('chat.sources')}</div>
                  {turn.sources
                    .flatMap((sourceMessage) => sourceMessage.sources)
                    .map((src, index) => (
                      <div
                        key={`${src.url}_${index}`}
                        className="mb-2 pb-2 border-b border-blue-100 last:border-0"
                      >
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline font-medium text-sm"
                        >
                          {src.title}
                        </a>
                        <span className="text-gray-500 ml-2 text-xs">
                          ({Math.round(src.similarity * 100)}%)
                        </span>
                        {src.text_snippet && (
                          <div className="text-gray-600 text-xs mt-1">
                            {src.text_snippet.substring(0, 100)}...
                          </div>
                        )}
                      </div>
                    ))}
                  {sourceTokens && sourceTokens > 0 && (
                    <div className="text-gray-500 text-xs mt-2">
                      {t('chat.consumedTokens', { count: sourceTokens })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
