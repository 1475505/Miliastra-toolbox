import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchShare, ShareRecord } from '../utils/share'
import ConversationView, { buildConversationTurns } from './ConversationView'
import PageHeader from './ui/PageHeader'
import { LoadingSpinnerIcon } from './ui/icons'

interface SharePageProps {
  shareId: string
}

type LoadState = 'loading' | 'ready' | 'pending' | 'missing' | 'error'

const POLL_INTERVAL_MS = 3000

/** 分享页：只读渲染分享的对话；异步任务未完成时轮询直到出结果 */
export default function SharePage({ shareId }: SharePageProps) {
  const { t } = useTranslation()
  const [record, setRecord] = useState<ShareRecord | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | undefined

    const poll = async () => {
      try {
        const rec = await fetchShare(shareId)
        if (cancelled) return
        if (!rec) {
          setState('missing')
          return
        }
        setRecord(rec)
        if (rec.status === 'pending') {
          setState('pending')
          pollTimer = setTimeout(poll, POLL_INTERVAL_MS)
        } else {
          setState('ready')
        }
      } catch (e) {
        if (cancelled) return
        setLoadError(e instanceof Error ? e.message : '')
        setState('error')
      }
    }

    poll()
    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
    }
  }, [shareId])

  const turns = record?.messages ? buildConversationTurns(record.messages) : []

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={record?.title || t('sharePage.title')}>
        <span className="text-xs text-on-surface-variant border border-outline rounded-full px-3 py-1">
          {t('sharePage.badge')}
        </span>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
        {state === 'loading' && (
          <div className="flex items-center justify-center gap-2 text-on-surface-variant text-sm mt-16">
            <LoadingSpinnerIcon className="w-4 h-4 animate-spin" />
            <span>{t('sharePage.loading')}</span>
          </div>
        )}

        {state === 'missing' && (
          <div className="text-center text-on-surface mt-16">
            <div className="text-lg font-medium">{t('sharePage.notFound')}</div>
            <div className="text-sm mt-2 text-on-surface-variant">
              {t('sharePage.notFoundHint')}
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="flex justify-start px-4">
            <div className="max-w-4xl px-4 py-3 rounded-2xl bg-error-container text-error border border-error/20 text-sm">
              {t('sharePage.loadFailed')}
              {loadError && `: ${loadError}`}
            </div>
          </div>
        )}

        {state === 'pending' && (
          <div className="text-center px-4">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-6 py-3 text-sm text-blue-700">
              <LoadingSpinnerIcon className="w-4 h-4 animate-spin" />
              <span>{t('sharePage.generating')}</span>
            </div>
          </div>
        )}

        {state === 'ready' && record && (
          <>
            {record.status === 'error' && (
              <div className="flex justify-start px-4">
                <div className="max-w-4xl px-4 py-3 rounded-2xl bg-error-container text-error border border-error/20 text-sm">
                  {t('sharePage.taskFailed')}
                  {record.error && `: ${record.error}`}
                </div>
              </div>
            )}
            {turns.length === 0 ? (
              <div className="text-center text-on-surface-variant text-sm mt-16">
                {t('sharePage.empty')}
              </div>
            ) : (
              <ConversationView turns={turns} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
