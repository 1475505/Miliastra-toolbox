import { useEffect, useState } from 'react'

import PageHeader from './ui/PageHeader'
import Surface from './ui/Surface'
import Button from './ui/Button'
import Input from './ui/Input'
import Chip from './ui/Chip'

interface GadgetItem {
  list_id: number
  name: string
  size_x: number
  size_y: number
  size_z: number
}

interface EffectItem {
  id: number
  name: string
  duration: number
  radius: number
}

interface BgmItem {
  bgm_id: number
  name: string
  duration_sec: number
  category_name: string
}

interface TranslationItem {
  rowid: number
  chs: string
  cht: string
  de: string
  en: string
  es: string
  fr: string
  id: string
  it: string
  jp: string
  kr: string
  pt: string
  ru: string
  th: string
  tr: string
  vi: string
}

type LangKey = keyof Omit<TranslationItem, 'rowid'>

const LANGUAGES = [
  { key: 'chs' as LangKey, label: '简中' },
  { key: 'cht' as LangKey, label: '繁中' },
  { key: 'en' as LangKey, label: '英语' },
  { key: 'jp' as LangKey, label: '日语' },
  { key: 'kr' as LangKey, label: '韩语' },
  { key: 'de' as LangKey, label: '德语' },
  { key: 'fr' as LangKey, label: '法语' },
  { key: 'es' as LangKey, label: '西语' },
  { key: 'it' as LangKey, label: '意语' },
  { key: 'pt' as LangKey, label: '葡语' },
  { key: 'ru' as LangKey, label: '俄语' },
  { key: 'th' as LangKey, label: '泰语' },
  { key: 'tr' as LangKey, label: '土语' },
  { key: 'vi' as LangKey, label: '越语' },
  { key: 'id' as LangKey, label: '印尼语' },
]

interface DataResponse<T> {
  success: boolean
  data: {
    total: number
    items: T[]
  }
  detail?: string
}

interface TranslationResponse {
  success: boolean
  data: {
    exact_match: boolean
    query: string
    total: number
    message?: string
    results: TranslationItem[]
  }
  detail?: string
}

function buildQuery(idInput: string, nameInput: string): string {
  const id = idInput.trim()
  const name = nameInput.trim()
  const params = new URLSearchParams()

  if (id) {
    params.set('id', id)
  } else if (name) {
    params.set('name', name)
  }

  params.set('limit', '20')
  params.set('offset', '0')
  return params.toString()
}

function isValidInteger(value: string): boolean {
  return /^\d+$/.test(value.trim())
}

export default function DataQuery() {
  const [translateQuery, setTranslateQuery] = useState('')
  const [translateLoading, setTranslateLoading] = useState(false)
  const [translateError, setTranslateError] = useState('')
  const [translateHasSearched, setTranslateHasSearched] = useState(false)
  const [translateExactMatch, setTranslateExactMatch] = useState(false)
  const [translateMessage, setTranslateMessage] = useState('')
  const [translateItems, setTranslateItems] = useState<TranslationItem[]>([])
  const [activeLang, setActiveLang] = useState<LangKey | null>(null)
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null)

  useEffect(() => {
    if (translateItems.length > 0) {
      setSelectedRowId(translateItems[0].rowid)
    } else {
      setSelectedRowId(null)
    }
  }, [translateItems])

  const scrollToLang = (key: LangKey) => {
    setActiveLang(key)
    const el = document.querySelector(`[data-lang="${key}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  const [gadgetId, setGadgetId] = useState('')
  const [gadgetName, setGadgetName] = useState('')
  const [gadgetLoading, setGadgetLoading] = useState(false)
  const [gadgetError, setGadgetError] = useState('')
  const [gadgetHasSearched, setGadgetHasSearched] = useState(false)
  const [gadgetItems, setGadgetItems] = useState<GadgetItem[]>([])

  const [effectId, setEffectId] = useState('')
  const [effectName, setEffectName] = useState('')
  const [effectLoading, setEffectLoading] = useState(false)
  const [effectError, setEffectError] = useState('')
  const [effectHasSearched, setEffectHasSearched] = useState(false)
  const [effectItems, setEffectItems] = useState<EffectItem[]>([])

  const [bgmId, setBgmId] = useState('')
  const [bgmName, setBgmName] = useState('')
  const [bgmLoading, setBgmLoading] = useState(false)
  const [bgmError, setBgmError] = useState('')
  const [bgmHasSearched, setBgmHasSearched] = useState(false)
  const [bgmItems, setBgmItems] = useState<BgmItem[]>([])

  const queryGadgets = async () => {
    const id = gadgetId.trim()
    const name = gadgetName.trim()

    if (!id && !name) {
      setGadgetError('请输入 ID 或中文名')
      return
    }
    if (id && !isValidInteger(id)) {
      setGadgetError('ID 必须为整数')
      return
    }

    setGadgetLoading(true)
    setGadgetError('')
    setGadgetHasSearched(true)

    try {
      const response = await fetch(`/api/v1/data/gadgets?${buildQuery(id, name)}`)
      const payload = (await response.json()) as DataResponse<GadgetItem>
      if (!response.ok || !payload.success) {
        throw new Error(payload.detail || '查询失败')
      }
      setGadgetItems(payload.data.items)
    } catch (error) {
      const message = error instanceof Error ? error.message : '查询失败'
      setGadgetError(message)
      setGadgetItems([])
    } finally {
      setGadgetLoading(false)
    }
  }

  const queryTranslations = async () => {
    const query = translateQuery.trim()

    if (!query) {
      setTranslateError('请输入中文术语关键词')
      return
    }

    setTranslateLoading(true)
    setTranslateError('')
    setTranslateHasSearched(true)

    try {
      const response = await fetch(
        `/api/v1/translate/terms?query=${encodeURIComponent(query)}`
      )
      const payload = (await response.json()) as TranslationResponse
      const detail =
        typeof payload.detail === 'string' ? payload.detail : '查询失败'

      if (!response.ok || !payload.success) {
        throw new Error(detail)
      }

      setTranslateExactMatch(payload.data.exact_match)
      setTranslateMessage(payload.data.message || '')
      setTranslateItems(payload.data.results)
    } catch (error) {
      const message = error instanceof Error ? error.message : '查询失败'
      setTranslateError(message)
      setTranslateExactMatch(false)
      setTranslateMessage('')
      setTranslateItems([])
    } finally {
      setTranslateLoading(false)
    }
  }

  const queryEffects = async () => {
    const id = effectId.trim()
    const name = effectName.trim()

    if (!id && !name) {
      setEffectError('请输入 ID 或中文名')
      return
    }
    if (id && !isValidInteger(id)) {
      setEffectError('ID 必须为整数')
      return
    }

    setEffectLoading(true)
    setEffectError('')
    setEffectHasSearched(true)

    try {
      const response = await fetch(`/api/v1/data/effects?${buildQuery(id, name)}`)
      const payload = (await response.json()) as DataResponse<EffectItem>
      if (!response.ok || !payload.success) {
        throw new Error(payload.detail || '查询失败')
      }
      setEffectItems(payload.data.items)
    } catch (error) {
      const message = error instanceof Error ? error.message : '查询失败'
      setEffectError(message)
      setEffectItems([])
    } finally {
      setEffectLoading(false)
    }
  }

  const queryBgm = async () => {
    const id = bgmId.trim()
    const name = bgmName.trim()

    if (!id && !name) {
      setBgmError('请输入 ID 或中文名')
      return
    }
    if (id && !isValidInteger(id)) {
      setBgmError('ID 必须为整数')
      return
    }

    setBgmLoading(true)
    setBgmError('')
    setBgmHasSearched(true)

    try {
      const response = await fetch(`/api/v1/data/bgm?${buildQuery(id, name)}`)
      const payload = (await response.json()) as DataResponse<BgmItem>
      if (!response.ok || !payload.success) {
        throw new Error(payload.detail || '查询失败')
      }
      setBgmItems(payload.data.items)
    } catch (error) {
      const message = error instanceof Error ? error.message : '查询失败'
      setBgmError(message)
      setBgmItems([])
    } finally {
      setBgmLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="数据查询" />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
        {/* 术语翻译查询 */}
        <Surface className="!p-0 overflow-hidden">
          <div className="p-5">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-on-surface">
                  术语翻译查询
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  按中文术语查询 15 语言翻译，候选顺序为精确匹配优先，整体最多返回 10 条。
                </p>
              </div>
              {translateHasSearched && !translateError && (
                <Chip variant={translateExactMatch ? 'primary' : 'default'}>
                  {translateExactMatch ? '含精确匹配' : '仅模糊候选'}
                </Chip>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto] mb-3">
              <Input
                type="text"
                value={translateQuery}
                onChange={(e) => setTranslateQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void queryTranslations()
                  }
                }}
                placeholder="输入中文术语，例如：黑名单"
              />
              <Button
                onClick={() => {
                  void queryTranslations()
                }}
                disabled={translateLoading}
              >
                {translateLoading ? '查询中...' : '查询'}
              </Button>
            </div>
            {translateError && (
              <p className="text-sm text-error mb-2">{translateError}</p>
            )}
            {translateMessage && !translateError && (
              <p className="text-sm text-on-surface-variant mb-2">
                {translateMessage}
              </p>
            )}
          </div>

          {translateHasSearched && (
            <div className="px-5 pb-5">
              {translateItems.length === 0 ? (
                <p className="text-sm text-on-surface-variant py-3">
                  未找到结果
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto pb-1">
                    <div className="flex gap-2 flex-nowrap">
                      {translateItems.map((item) => (
                        <button
                          key={item.rowid}
                          onClick={() => setSelectedRowId(item.rowid)}
                          className={[
                            'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200',
                            selectedRowId === item.rowid
                              ? 'bg-primary text-on-primary'
                              : 'bg-surface-variant text-on-surface-variant hover:bg-outline-variant',
                          ].join(' ')}
                        >
                          {item.chs}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur border-y border-outline px-4 py-2 -mx-5">
                    <div className="flex gap-1.5 flex-nowrap">
                      {LANGUAGES.map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => scrollToLang(key)}
                          className={[
                            'shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors duration-200',
                            activeLang === key
                              ? 'bg-primary-container text-on-primary-container ring-1 ring-primary'
                              : 'bg-surface-variant text-on-surface-variant hover:bg-outline-variant',
                          ].join(' ')}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(() => {
                    const item = translateItems.find(
                      (i) => i.rowid === selectedRowId
                    )
                    if (!item) return null
                    return (
                      <Surface>
                        <div className="text-xs text-on-surface-variant mb-2 font-mono">
                          RowID: {item.rowid}
                        </div>
                        <div className="space-y-0.5">
                          {LANGUAGES.map(({ key, label }) => (
                            <div
                              key={key}
                              data-lang={key}
                              className={[
                                'flex gap-3 rounded-lg px-3 py-1.5 transition-colors duration-200',
                                activeLang === key
                                  ? 'bg-primary-container/30 ring-1 ring-primary/30'
                                  : '',
                              ].join(' ')}
                            >
                              <span className="w-10 shrink-0 rounded-lg px-1 py-0.5 text-center text-xs font-medium bg-surface-variant text-on-surface-variant">
                                {label}
                              </span>
                              <span className="text-sm text-on-surface break-words whitespace-pre-wrap min-w-0">
                                {item[key]}
                              </span>
                            </div>
                          ))}
                        </div>
                      </Surface>
                    )
                  })()}
                </div>
              )}
            </div>
          )}
        </Surface>

        {/* 实体信息查询 */}
        <Surface>
          <h3 className="text-base font-semibold text-on-surface mb-3">
            实体信息查询
          </h3>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] mb-3">
            <Input
              type="text"
              value={gadgetId}
              onChange={(e) => setGadgetId(e.target.value)}
              placeholder="输入实体 ID（整数）"
            />
            <Input
              type="text"
              value={gadgetName}
              onChange={(e) => setGadgetName(e.target.value)}
              placeholder="输入实体中文名"
            />
            <Button onClick={queryGadgets} disabled={gadgetLoading}>
              {gadgetLoading ? '查询中...' : '查询'}
            </Button>
          </div>
          <p className="text-xs text-on-surface-variant mb-2">
            ID 和中文名二选一；同时填写时优先 ID。
          </p>
          {gadgetError && (
            <p className="text-sm text-error mb-2">{gadgetError}</p>
          )}

          {gadgetHasSearched && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-outline rounded-xl overflow-hidden">
                <thead className="bg-surface-variant">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      ID
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      中文名
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      X
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      Y
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      Z
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-surface">
                  {gadgetItems.length === 0 ? (
                    <tr>
                      <td
                        className="px-3 py-3 text-on-surface-variant"
                        colSpan={5}
                      >
                        未找到数据
                      </td>
                    </tr>
                  ) : (
                    gadgetItems.map((item) => (
                      <tr
                        key={item.list_id}
                        className="border-t border-outline"
                      >
                        <td className="px-3 py-2">{item.list_id}</td>
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2">{item.size_x}</td>
                        <td className="px-3 py-2">{item.size_y}</td>
                        <td className="px-3 py-2">{item.size_z}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Surface>

        {/* 特效信息查询 */}
        <Surface>
          <h3 className="text-base font-semibold text-on-surface mb-3">
            特效信息查询
          </h3>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] mb-3">
            <Input
              type="text"
              value={effectId}
              onChange={(e) => setEffectId(e.target.value)}
              placeholder="输入特效 ID（整数）"
            />
            <Input
              type="text"
              value={effectName}
              onChange={(e) => setEffectName(e.target.value)}
              placeholder="输入特效中文名"
            />
            <Button onClick={queryEffects} disabled={effectLoading}>
              {effectLoading ? '查询中...' : '查询'}
            </Button>
          </div>
          <p className="text-xs text-on-surface-variant mb-2">
            ID 和中文名二选一；同时填写时优先 ID。
          </p>
          {effectError && (
            <p className="text-sm text-error mb-2">{effectError}</p>
          )}

          {effectHasSearched && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-outline rounded-xl overflow-hidden">
                <thead className="bg-surface-variant">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      ID
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      中文名
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      持续时长
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      半径
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-surface">
                  {effectItems.length === 0 ? (
                    <tr>
                      <td
                        className="px-3 py-3 text-on-surface-variant"
                        colSpan={4}
                      >
                        未找到数据
                      </td>
                    </tr>
                  ) : (
                    effectItems.map((item) => (
                      <tr key={item.id} className="border-t border-outline">
                        <td className="px-3 py-2">{item.id}</td>
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2">{item.duration}</td>
                        <td className="px-3 py-2">{item.radius}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Surface>

        {/* 音乐信息查询 */}
        <Surface>
          <h3 className="text-base font-semibold text-on-surface mb-3">
            音乐信息查询
          </h3>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] mb-3">
            <Input
              type="text"
              value={bgmId}
              onChange={(e) => setBgmId(e.target.value)}
              placeholder="输入音乐 ID（整数）"
            />
            <Input
              type="text"
              value={bgmName}
              onChange={(e) => setBgmName(e.target.value)}
              placeholder="输入音乐中文名"
            />
            <Button onClick={queryBgm} disabled={bgmLoading}>
              {bgmLoading ? '查询中...' : '查询'}
            </Button>
          </div>
          <p className="text-xs text-on-surface-variant mb-2">
            ID 和中文名二选一；同时填写时优先 ID。
          </p>
          {bgmError && <p className="text-sm text-error mb-2">{bgmError}</p>}

          {bgmHasSearched && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-outline rounded-xl overflow-hidden">
                <thead className="bg-surface-variant">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      ID
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      中文名
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      持续时长（秒）
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      类别
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-surface">
                  {bgmItems.length === 0 ? (
                    <tr>
                      <td
                        className="px-3 py-3 text-on-surface-variant"
                        colSpan={4}
                      >
                        未找到数据
                      </td>
                    </tr>
                  ) : (
                    bgmItems.map((item) => (
                      <tr key={item.bgm_id} className="border-t border-outline">
                        <td className="px-3 py-2">{item.bgm_id}</td>
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2">{item.duration_sec}</td>
                        <td className="px-3 py-2">{item.category_name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Surface>
      </div>
    </div>
  )
}
