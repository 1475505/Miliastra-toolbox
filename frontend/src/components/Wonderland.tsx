import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import PageHeader from './ui/PageHeader'
import Surface from './ui/Surface'
import Button from './ui/Button'
import Input from './ui/Input'
import Select from './ui/Select'
import Chip from './ui/Chip'
import IconButton from './ui/IconButton'
import Modal from './ui/Modal'
import {
  PlusIcon,
  TrashIcon,
  OpenExternalIcon,
  LoadingSpinnerIcon,
} from './ui/icons'

type WonderlandView = 'info' | 'comments' | 'batch'

interface LevelImage {
  url: string
}

interface LevelInfo {
  level_id: string
  level_name: string
  desc: string
  level_intro: string
  cover_img: string
  images: LevelImage[]
  video_url: string
  video_cover: string
  hot_score: string
  good_rate: string
  play_type: string
  play_cate: string
  play_tags: string[]
  show_limit_play_num_str: string
  view_url: string
}

interface ReplyItem {
  content: string
  created_at: number
  is_recommend: boolean
  floor_id: number
  nickname: string
  like_count: number
}

interface ReplyStats {
  total_24h: number
  bad_24h: number
  rate_24h: number
  total_72h: number
  bad_72h: number
  rate_72h: number
}

interface RepliesData {
  level_id: string
  stats: ReplyStats
  recent_comments: ReplyItem[]
  bad_comments: ReplyItem[]
  view_url: string
}

interface ApiResponse<T> {
  success: boolean
  data: T
  detail?: string
}

interface SubscribedGuid {
  guid: string
  alias: string
}

interface BatchResult {
  guid: string
  alias: string
  status: 'success' | 'error'
  data?: RepliesData
  error?: string
}

const STORAGE_KEY = 'qiyu_subscribed_guids'
const MAX_SUBSCRIBED = 5
const BATCH_COOLDOWN_SEC = 15
const DEFAULT_REVIEW = '非常优秀的奇域，推荐大家游玩~'

function loadSubscribed(): SubscribedGuid[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (Array.isArray(arr)) {
      return arr
        .map((item): SubscribedGuid => {
          if (typeof item === 'string') {
            return { guid: item, alias: '' }
          }
          if (typeof item === 'object' && item !== null && 'guid' in item) {
            const obj = item as { guid: unknown; alias?: unknown }
            return {
              guid: typeof obj.guid === 'string' ? obj.guid : '',
              alias: typeof obj.alias === 'string' ? obj.alias : '',
            }
          }
          return { guid: '', alias: '' }
        })
        .filter((s) => s.guid)
        .slice(0, MAX_SUBSCRIBED)
    }
    return []
  } catch {
    return []
  }
}

function saveSubscribed(items: SubscribedGuid[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function sanitizeGuid(input: string): string {
  return input.replace(/\D/g, '')
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

function getParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

function syncUrl(guid: string, view: WonderlandView, replace: boolean): void {
  const params = new URLSearchParams()
  if (view !== 'batch') {
    params.set('guid', guid)
    params.set('type', view)
  }
  const qs = params.toString()
  const newUrl = qs ? `/wonderland?${qs}` : '/wonderland'
  if (window.location.pathname + window.location.search !== newUrl) {
    if (replace) {
      window.history.replaceState({}, '', newUrl)
    } else {
      window.history.pushState({}, '', newUrl)
    }
  }
}

function guidLabel(item: SubscribedGuid): string {
  return item.alias || item.guid
}

export default function Wonderland() {
  const { t } = useTranslation()

  const [guidInput, setGuidInput] = useState('')
  const [selectedGuid, setSelectedGuid] = useState('')
  const [activeView, setActiveView] = useState<WonderlandView>('info')
  const [currentGuid, setCurrentGuid] = useState('')

  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(null)
  const [levelLoading, setLevelLoading] = useState(false)
  const [levelError, setLevelError] = useState('')
  const [levelLoaded, setLevelLoaded] = useState(false)

  const [replies, setReplies] = useState<RepliesData | null>(null)
  const [repliesLoading, setRepliesLoading] = useState(false)
  const [repliesError, setRepliesError] = useState('')
  const [repliesLoaded, setRepliesLoaded] = useState(false)

  const [subscribed, setSubscribed] = useState<SubscribedGuid[]>(() => loadSubscribed())
  const [modalOpen, setModalOpen] = useState(false)
  const [modalGuidInput, setModalGuidInput] = useState('')
  const [modalAliasInput, setModalAliasInput] = useState('')

  const [batchResults, setBatchResults] = useState<BatchResult[]>([])
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchCooldown, setBatchCooldown] = useState(0)

  const autoQueriedRef = useRef(false)

  const queryLevel = useCallback(
    async (guid: string) => {
      const clean = sanitizeGuid(guid)
      if (!clean) {
        setLevelError(t('wonderland.guidRequired'))
        return
      }
      setLevelLoading(true)
      setLevelError('')
      setLevelLoaded(true)
      try {
        const resp = await fetch(`/api/v1/wonderland/level?guid=${encodeURIComponent(clean)}`)
        const payload = (await resp.json()) as ApiResponse<LevelInfo>
        if (!resp.ok || !payload.success) {
          throw new Error(payload.detail || t('wonderland.queryFailed'))
        }
        setLevelInfo(payload.data)
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('wonderland.queryFailed')
        setLevelError(msg)
        setLevelInfo(null)
      } finally {
        setLevelLoading(false)
      }
    },
    [t]
  )

  const queryReplies = useCallback(
    async (guid: string) => {
      const clean = sanitizeGuid(guid)
      if (!clean) {
        setRepliesError(t('wonderland.guidRequired'))
        return
      }
      setRepliesLoading(true)
      setRepliesError('')
      setRepliesLoaded(true)
      try {
        const resp = await fetch(`/api/v1/wonderland/replies?guid=${encodeURIComponent(clean)}`)
        const payload = (await resp.json()) as ApiResponse<RepliesData>
        if (!resp.ok || !payload.success) {
          throw new Error(payload.detail || t('wonderland.queryFailed'))
        }
        setReplies(payload.data)
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('wonderland.queryFailed')
        setRepliesError(msg)
        setReplies(null)
      } finally {
        setRepliesLoading(false)
      }
    },
    [t]
  )

  const queryBatchReplies = useCallback(
    async (items: SubscribedGuid[]) => {
      if (items.length === 0) return
      setBatchLoading(true)
      setBatchResults([])
      const results = await Promise.allSettled(
        items.map(async (item) => {
          const resp = await fetch(`/api/v1/wonderland/replies?guid=${encodeURIComponent(item.guid)}`)
          const payload = (await resp.json()) as ApiResponse<RepliesData>
          if (!resp.ok || !payload.success) {
            throw new Error(payload.detail || t('wonderland.queryFailed'))
          }
          return { guid: item.guid, alias: item.alias, status: 'success' as const, data: payload.data }
        })
      )
      const mapped: BatchResult[] = results.map((r, i) => {
        const item = items[i]
        if (r.status === 'fulfilled') {
          return r.value
        }
        const msg = r.reason instanceof Error ? r.reason.message : t('wonderland.queryFailed')
        return { guid: item.guid, alias: item.alias, status: 'error' as const, error: msg }
      })
      setBatchResults(mapped)
      setBatchLoading(false)
    },
    [t]
  )

  const handleQuery = (view: WonderlandView) => {
    const clean = sanitizeGuid(guidInput)
    if (!clean) {
      if (view === 'info') setLevelError(t('wonderland.guidRequired'))
      else setRepliesError(t('wonderland.guidRequired'))
      return
    }
    setGuidInput(clean)
    setCurrentGuid(clean)
    setActiveView(view)
    syncUrl(clean, view, false)
    if (view === 'info') {
      void queryLevel(clean)
    } else {
      void queryReplies(clean)
    }
  }

  const handleViewSwitch = (view: WonderlandView) => {
    if (!currentGuid) return
    setActiveView(view)
    syncUrl(currentGuid, view, false)
    if (view === 'info' && !levelLoaded) {
      void queryLevel(currentGuid)
    } else if (view === 'comments' && !repliesLoaded) {
      void queryReplies(currentGuid)
    }
  }

  const handleBatchQuery = () => {
    if (subscribed.length === 0 || batchCooldown > 0 || batchLoading) return
    setActiveView('batch')
    setBatchCooldown(BATCH_COOLDOWN_SEC)
    void queryBatchReplies(subscribed)
  }

  const handleBatchGuidClick = (guid: string) => {
    setGuidInput(guid)
    setCurrentGuid(guid)
    setSelectedGuid(guid)
    setRepliesLoaded(false)
    setActiveView('comments')
    syncUrl(guid, 'comments', false)
    void queryReplies(guid)
  }

  const handleSelectChange = (guid: string) => {
    setSelectedGuid(guid)
    if (guid) {
      setGuidInput(guid)
    }
  }

  const handleAddFromModal = () => {
    const clean = sanitizeGuid(modalGuidInput)
    if (!clean) return
    if (subscribed.some((s) => s.guid === clean)) return
    if (subscribed.length >= MAX_SUBSCRIBED) return
    const next = [...subscribed, { guid: clean, alias: modalAliasInput.trim() }]
    setSubscribed(next)
    saveSubscribed(next)
    setModalGuidInput('')
    setModalAliasInput('')
  }

  const handleUpdateAlias = (guid: string, alias: string) => {
    const next = subscribed.map((s) => (s.guid === guid ? { ...s, alias } : s))
    setSubscribed(next)
    saveSubscribed(next)
  }

  const handleRemoveSubscribed = (guid: string) => {
    const next = subscribed.filter((s) => s.guid !== guid)
    setSubscribed(next)
    saveSubscribed(next)
    if (selectedGuid === guid) {
      setSelectedGuid('')
    }
  }

  // Batch cooldown countdown
  useEffect(() => {
    if (batchCooldown <= 0) return
    const timer = setInterval(() => {
      setBatchCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [batchCooldown > 0])

  // Auto-query from URL params on mount
  useEffect(() => {
    if (autoQueriedRef.current) return
    autoQueriedRef.current = true
    const guid = getParam('guid')
    if (guid) {
      const clean = sanitizeGuid(guid)
      if (!clean) return
      const view: WonderlandView = getParam('type') === 'comments' ? 'comments' : 'info'
      setGuidInput(clean)
      setCurrentGuid(clean)
      setActiveView(view)
      if (subscribed.some((s) => s.guid === clean)) {
        setSelectedGuid(clean)
      }
      syncUrl(clean, view, true)
      if (view === 'info') {
        void queryLevel(clean)
      } else {
        void queryReplies(clean)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync URL on popstate (back/forward)
  useEffect(() => {
    const handlePop = () => {
      const guid = getParam('guid')
      if (!guid) {
        setCurrentGuid('')
        return
      }
      const clean = sanitizeGuid(guid)
      const view: WonderlandView = getParam('type') === 'comments' ? 'comments' : 'info'
      setGuidInput(clean)
      setCurrentGuid(clean)
      setActiveView(view)
      if (view === 'info') {
        void queryLevel(clean)
      } else {
        void queryReplies(clean)
      }
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [queryLevel, queryReplies])

  const batchDisabled = batchLoading || subscribed.length === 0 || batchCooldown > 0
  const batchLabel = batchLoading
    ? t('common.querying')
    : `${t('wonderland.batchComments')} (${subscribed.length})${batchCooldown > 0 ? ` · ${batchCooldown}s` : ''}`

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={t('wonderland.title')} />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
        {/* GUID selector + input + actions */}
        <Surface>
          {/* Row 1: edit button + dropdown + batch button */}
          <div className="flex items-center gap-2 mb-3">
            <IconButton
              onClick={() => setModalOpen(true)}
              label={t('wonderland.manageSubscriptions')}
              className="shrink-0"
            >
              <PlusIcon className="w-5 h-5" />
            </IconButton>
            <Select
              value={selectedGuid}
              onChange={(e) => handleSelectChange(e.target.value)}
              className="flex-1 min-w-0"
            >
              <option value="">{t('wonderland.selectGuid')} ({subscribed.length}/{MAX_SUBSCRIBED})</option>
              {subscribed.map((item) => (
                <option key={item.guid} value={item.guid}>
                  {guidLabel(item)}
                </option>
              ))}
            </Select>
            <Button
              variant="tonal"
              size="sm"
              onClick={handleBatchQuery}
              disabled={batchDisabled}
              className="shrink-0 whitespace-nowrap"
              title={t('wonderland.batchCommentsDesc')}
            >
              {batchLabel}
            </Button>
          </div>

          {/* Row 2: input + two buttons */}
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <Input
              type="text"
              value={guidInput}
              onChange={(e) => setGuidInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleQuery('info')
                }
              }}
              placeholder={t('wonderland.guidPlaceholder')}
            />
            <Button variant="tonal" onClick={() => handleQuery('info')} disabled={levelLoading}>
              {levelLoading ? t('common.querying') : t('wonderland.viewInfo')}
            </Button>
            <Button variant="tonal" onClick={() => handleQuery('comments')} disabled={repliesLoading}>
              {repliesLoading ? t('common.querying') : t('wonderland.viewComments')}
            </Button>
          </div>
          <p className="text-xs text-on-surface-variant mt-3">{t('wonderland.enterGuidHint')}</p>
        </Surface>

        {/* Results */}
        {(currentGuid || activeView === 'batch') && (
          <Surface className="!p-0 overflow-hidden">
            {/* View toggle (only for individual views) */}
            {activeView !== 'batch' && (
            <div className="flex border-b border-outline">
              <button
                onClick={() => handleViewSwitch('info')}
                className={[
                  'flex-1 px-4 py-3 text-sm font-medium transition-colors duration-200',
                  activeView === 'info'
                    ? 'bg-primary-container text-on-primary-container'
                    : 'text-on-surface-variant hover:bg-surface-variant',
                ].join(' ')}
              >
                {t('wonderland.tabInfo')}
              </button>
              <button
                onClick={() => handleViewSwitch('comments')}
                className={[
                  'flex-1 px-4 py-3 text-sm font-medium transition-colors duration-200 border-l border-outline',
                  activeView === 'comments'
                    ? 'bg-primary-container text-on-primary-container'
                    : 'text-on-surface-variant hover:bg-surface-variant',
                ].join(' ')}
              >
                {t('wonderland.tabComments')}
              </button>
            </div>
            )}

            <div className="p-5">
              {/* Batch view */}
              {activeView === 'batch' &&
                (batchLoading ? (
                  <div className="flex items-center justify-center py-12 text-on-surface-variant">
                    <LoadingSpinnerIcon className="w-5 h-5 animate-spin mr-2" />
                    {t('common.loading')}
                  </div>
                ) : batchResults.length > 0 ? (
                  <BatchRepliesView results={batchResults} t={t} onGuidClick={handleBatchGuidClick} />
                ) : (
                  <p className="text-sm text-on-surface-variant py-6 text-center">
                    {t('wonderland.enterGuidHint')}
                  </p>
                ))}

              {/* Level info view */}
              {activeView === 'info' &&
                (levelLoading ? (
                  <div className="flex items-center justify-center py-12 text-on-surface-variant">
                    <LoadingSpinnerIcon className="w-5 h-5 animate-spin mr-2" />
                    {t('common.loading')}
                  </div>
                ) : levelError ? (
                  <p className="text-sm text-error py-6 text-center">{levelError}</p>
                ) : levelInfo ? (
                  <LevelInfoView info={levelInfo} t={t} />
                ) : (
                  <p className="text-sm text-on-surface-variant py-6 text-center">
                    {t('wonderland.enterGuidHint')}
                  </p>
                ))}

              {/* Comments view */}
              {activeView === 'comments' &&
                (repliesLoading ? (
                  <div className="flex items-center justify-center py-12 text-on-surface-variant">
                    <LoadingSpinnerIcon className="w-5 h-5 animate-spin mr-2" />
                    {t('common.loading')}
                  </div>
                ) : repliesError ? (
                  <p className="text-sm text-error py-6 text-center">{repliesError}</p>
                ) : replies ? (
                  <RepliesView data={replies} t={t} />
                ) : (
                  <p className="text-sm text-on-surface-variant py-6 text-center">
                    {t('wonderland.enterGuidHint')}
                  </p>
                ))}
            </div>
          </Surface>
        )}
      </div>

      {/* Manage subscriptions modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t('wonderland.manageSubscriptions')}
        footer={
          <Button variant="filled" onClick={() => setModalOpen(false)}>
            {t('common.confirm')}
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-on-surface-variant">
              {subscribed.length}/{MAX_SUBSCRIBED}
            </span>
            {subscribed.length >= MAX_SUBSCRIBED && (
              <Chip variant="primary">{t('wonderland.subscribeFull')}</Chip>
            )}
          </div>

          {subscribed.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-2">{t('wonderland.noSubscribed')}</p>
          ) : (
            <div className="space-y-2">
              {subscribed.map((item) => (
                <div
                  key={item.guid}
                  className="flex items-center gap-2 rounded-lg bg-surface-variant/50 px-3 py-2"
                >
                  <span className="font-mono text-xs text-on-surface-variant shrink-0 w-32 truncate">
                    {item.guid}
                  </span>
                  <Input
                    type="text"
                    value={item.alias}
                    onChange={(e) => handleUpdateAlias(item.guid, e.target.value)}
                    placeholder={t('wonderland.aliasPlaceholder')}
                    className="flex-1 py-1 text-xs"
                  />
                  <button
                    onClick={() => handleRemoveSubscribed(item.guid)}
                    className="p-1 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container transition-colors shrink-0"
                    title={t('common.remove')}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 pt-2 border-t border-outline">
            <div className="flex-1">
              <label className="block text-xs text-on-surface-variant mb-1">GUID</label>
              <Input
                type="text"
                value={modalGuidInput}
                onChange={(e) => setModalGuidInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddFromModal()
                  }
                }}
                placeholder={t('wonderland.guidToAddPlaceholder')}
                disabled={subscribed.length >= MAX_SUBSCRIBED}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-on-surface-variant mb-1">{t('wonderland.alias')}</label>
              <Input
                type="text"
                value={modalAliasInput}
                onChange={(e) => setModalAliasInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddFromModal()
                  }
                }}
                placeholder={t('wonderland.aliasPlaceholder')}
                disabled={subscribed.length >= MAX_SUBSCRIBED}
              />
            </div>
            <Button
              variant="outlined"
              size="sm"
              onClick={handleAddFromModal}
              disabled={subscribed.length >= MAX_SUBSCRIBED || !sanitizeGuid(modalGuidInput)}
              className="shrink-0"
            >
              <PlusIcon className="w-4 h-4" />
              {t('wonderland.addGuid')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

interface LevelInfoViewProps {
  info: LevelInfo
  t: (key: string, options?: Record<string, unknown>) => string
}

function LevelInfoView({ info, t }: LevelInfoViewProps) {
  return (
    <div className="space-y-4">
      {/* Header: cover + title + stats */}
      <div className="flex flex-col gap-4 md:flex-row">
        {info.cover_img && (
          <img
            src={info.cover_img}
            alt={info.level_name}
            className="w-full md:w-64 aspect-[16/9] object-cover rounded-xl border border-outline shrink-0"
          />
        )}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-lg font-semibold text-on-surface break-words">
              {info.level_name}
            </h3>
            <span className="text-xs text-on-surface-variant font-mono shrink-0">
              ID: {info.level_id}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {info.play_type && (
              <Chip variant="primary">{t('wonderland.playType')}: {info.play_type}</Chip>
            )}
            {info.show_limit_play_num_str && (
              <Chip>{t('wonderland.playerCount')}: {info.show_limit_play_num_str}</Chip>
            )}
            {info.play_tags.map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {info.hot_score && (
              <div>
                <span className="text-on-surface-variant">{t('wonderland.hotScore')}: </span>
                <span className="font-medium text-on-surface">{info.hot_score}</span>
              </div>
            )}
            {info.good_rate && (
              <div>
                <span className="text-on-surface-variant">{t('wonderland.goodRate')}: </span>
                <span className="font-medium text-on-surface">{info.good_rate}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {info.desc && (
        <div>
          <h4 className="text-sm font-semibold text-on-surface mb-1">{t('wonderland.desc')}</h4>
          <p className="text-sm text-on-surface-variant whitespace-pre-wrap break-words">
            {info.desc}
          </p>
        </div>
      )}

      {/* Intro */}
      {info.level_intro && (
        <div>
          <h4 className="text-sm font-semibold text-on-surface mb-1">{t('wonderland.intro')}</h4>
          <p className="text-sm text-on-surface-variant whitespace-pre-wrap break-words">
            {info.level_intro}
          </p>
        </div>
      )}

      {/* Images */}
      {info.images.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-on-surface mb-2">{t('wonderland.images')}</h4>
          <div className="flex flex-wrap gap-3">
            {info.images.map((img, i) => (
              <a
                key={i}
                href={img.url}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <img
                  src={img.url}
                  alt={`${t('wonderland.images')} ${i + 1}`}
                  className="w-44 aspect-[16/9] object-cover rounded-lg border border-outline hover:border-primary transition-colors"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Video */}
      {info.video_url && (
        <div>
          <h4 className="text-sm font-semibold text-on-surface mb-2">{t('wonderland.video')}</h4>
          <a
            href={info.video_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <OpenExternalIcon className="w-4 h-4" />
            {t('wonderland.video')}
          </a>
        </div>
      )}

      {/* External link */}
      <div className="pt-2 border-t border-outline">
        <a
          href={info.view_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <OpenExternalIcon className="w-4 h-4" />
          {t('wonderland.viewOnMiyoushe')}
        </a>
      </div>
    </div>
  )
}

interface RepliesViewProps {
  data: RepliesData
  t: (key: string, options?: Record<string, unknown>) => string
}

function RepliesView({ data, t }: RepliesViewProps) {
  const { stats } = data

  // Group default reviews by day, separate other comments
  const defaultByDay = new Map<string, number>()
  const otherComments: ReplyItem[] = []
  for (const reply of data.recent_comments) {
    if (reply.content === DEFAULT_REVIEW) {
      const day = formatTimestamp(reply.created_at).slice(0, 5)
      defaultByDay.set(day, (defaultByDay.get(day) ?? 0) + 1)
    } else {
      otherComments.push(reply)
    }
  }
  const sortedDays = Array.from(defaultByDay.keys()).sort().reverse()

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-outline p-3">
          <div className="text-xs text-on-surface-variant mb-1">{t('wonderland.stats24h')}</div>
          <div className="text-sm space-y-0.5">
            <div>
              <span className="text-on-surface-variant">{t('wonderland.commentsCount')}: </span>
              <span className="font-medium text-on-surface">{stats.total_24h}</span>
            </div>
            <div>
              <span className="text-on-surface-variant">{t('wonderland.badCount')}: </span>
              <span className="font-medium text-on-surface">{stats.bad_24h}</span>
            </div>
            <div>
              <span className="text-on-surface-variant">{t('wonderland.badRate')}: </span>
              <span className="font-medium text-on-surface">{stats.rate_24h}%</span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-outline p-3">
          <div className="text-xs text-on-surface-variant mb-1">{t('wonderland.stats72h')}</div>
          <div className="text-sm space-y-0.5">
            <div>
              <span className="text-on-surface-variant">{t('wonderland.commentsCount')}: </span>
              <span className="font-medium text-on-surface">{stats.total_72h}</span>
            </div>
            <div>
              <span className="text-on-surface-variant">{t('wonderland.badCount')}: </span>
              <span className="font-medium text-on-surface">{stats.bad_72h}</span>
            </div>
            <div>
              <span className="text-on-surface-variant">{t('wonderland.badRate')}: </span>
              <span className="font-medium text-on-surface">{stats.rate_72h}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* External link */}
      <a
        href={data.view_url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <OpenExternalIcon className="w-4 h-4" />
        {t('wonderland.viewCommentsOnMiyoushe')}
      </a>

      {/* Recent comments */}
      <div>
        <h4 className="text-sm font-semibold text-on-surface mb-2">{t('wonderland.recentComments')}</h4>
        {data.recent_comments.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t('wonderland.noComments')}</p>
        ) : (
          <div className="space-y-2">
            {sortedDays.map((day) => (
              <div
                key={day}
                className="flex items-center gap-2 rounded-lg bg-surface-variant/50 px-3 py-2 text-sm"
              >
                <span className="text-xs text-on-surface-variant font-mono">{day}</span>
                <span className="text-on-surface-variant">({t('wonderland.defaultReviewCount', { count: defaultByDay.get(day) })})</span>
                <span className="text-on-surface truncate">{DEFAULT_REVIEW}</span>
              </div>
            ))}
            {otherComments.map((reply, i) => (
              <ReplyRow key={`${reply.floor_id}-${i}`} reply={reply} t={t} />
            ))}
          </div>
        )}
      </div>

      {/* Bad reviews */}
      <div>
        <h4 className="text-sm font-semibold text-on-surface mb-2">{t('wonderland.badReviews')}</h4>
        {data.bad_comments.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t('wonderland.noBadReviews')}</p>
        ) : (
          <div className="space-y-2">
            {data.bad_comments.map((reply, i) => (
              <ReplyRow key={`bad-${reply.floor_id}-${i}`} reply={reply} t={t} bad />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface ReplyRowProps {
  reply: ReplyItem
  t: (key: string, options?: Record<string, unknown>) => string
  bad?: boolean
}

function ReplyRow({ reply, t, bad = false }: ReplyRowProps) {
  return (
    <div
      className={[
        'rounded-lg border px-3 py-2 text-sm',
        bad ? 'border-error/30 bg-error-container/20' : 'border-outline',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 mb-1">
        {bad && (
          <Chip variant="error">{t('wonderland.badReviewMark')}</Chip>
        )}
        <span className="text-xs text-on-surface-variant font-mono">
          #{reply.floor_id}
        </span>
        {reply.nickname && (
          <span className="text-xs text-on-surface-variant">{reply.nickname}</span>
        )}
        <span className="text-xs text-on-surface-variant ml-auto">
          {formatTimestamp(reply.created_at)}
        </span>
      </div>
      <p className="text-on-surface whitespace-pre-wrap break-words">{reply.content}</p>
      {reply.like_count > 0 && (
        <div className="mt-1 text-xs text-on-surface-variant">
          {t('wonderland.likeCount', { count: reply.like_count })}
        </div>
      )}
    </div>
  )
}

interface BatchRepliesViewProps {
  results: BatchResult[]
  t: (key: string, options?: Record<string, unknown>) => string
  onGuidClick: (guid: string) => void
}

function BatchRepliesView({ results, t, onGuidClick }: BatchRepliesViewProps) {
  return (
    <div className="space-y-4">
      {results.map((result) => (
        <div
          key={result.guid}
          className="rounded-xl border border-outline overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-surface-variant/60">
            <button
              onClick={() => onGuidClick(result.guid)}
              className="text-sm font-medium text-primary hover:underline min-w-0 truncate"
              title={t('wonderland.selectSubscribed')}
            >
              {result.alias || result.guid}
              {result.alias && (
                <span className="font-mono text-xs text-on-surface-variant ml-2">{result.guid}</span>
              )}
            </button>
            {result.status === 'error' ? (
              <Chip variant="error">{t('wonderland.queryFailed')}</Chip>
            ) : result.data ? (
              <div className="flex gap-3 text-xs text-on-surface-variant shrink-0">
                <span>
                  {t('wonderland.stats72h')}: {result.data.stats.total_72h}
                  {t('wonderland.commentsCount')}
                </span>
                <span>
                  {t('wonderland.badCount')}: {result.data.stats.bad_72h}
                </span>
                <span>
                  {t('wonderland.badRate')}: {result.data.stats.rate_72h}%
                </span>
              </div>
            ) : null}
          </div>

          {/* Body */}
          <div className="px-4 py-3">
            {result.status === 'error' ? (
              <p className="text-sm text-error">{result.error || t('wonderland.queryFailed')}</p>
            ) : result.data ? (
              <div className="space-y-2">
                {result.data.recent_comments.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">{t('wonderland.noComments')}</p>
                ) : (
                  result.data.recent_comments.slice(0, 5).map((reply, i) => (
                    <ReplyRow
                      key={`${result.guid}-${reply.floor_id}-${i}`}
                      reply={reply}
                      t={t}
                      bad={!reply.is_recommend}
                    />
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}
