import { useEffect, useState } from 'react'

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
  { key: 'chs' as LangKey, label: '简中', color: 'bg-red-100 text-red-700 hover:bg-red-200' },
  { key: 'cht' as LangKey, label: '繁中', color: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
  { key: 'en' as LangKey, label: '英语', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
  { key: 'jp' as LangKey, label: '日语', color: 'bg-pink-100 text-pink-700 hover:bg-pink-200' },
  { key: 'kr' as LangKey, label: '韩语', color: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
  { key: 'de' as LangKey, label: '德语', color: 'bg-green-100 text-green-700 hover:bg-green-200' },
  { key: 'fr' as LangKey, label: '法语', color: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' },
  { key: 'es' as LangKey, label: '西语', color: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' },
  { key: 'it' as LangKey, label: '意语', color: 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200' },
  { key: 'pt' as LangKey, label: '葡语', color: 'bg-teal-100 text-teal-700 hover:bg-teal-200' },
  { key: 'ru' as LangKey, label: '俄语', color: 'bg-slate-100 text-slate-700 hover:bg-slate-200' },
  { key: 'th' as LangKey, label: '泰语', color: 'bg-rose-100 text-rose-700 hover:bg-rose-200' },
  { key: 'tr' as LangKey, label: '土语', color: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
  { key: 'vi' as LangKey, label: '越语', color: 'bg-lime-100 text-lime-700 hover:bg-lime-200' },
  { key: 'id' as LangKey, label: '印尼语', color: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
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
      const response = await fetch(`/api/v1/translate/terms?query=${encodeURIComponent(query)}`)
      const payload = (await response.json()) as TranslationResponse
      const detail = typeof payload.detail === 'string' ? payload.detail : '查询失败'

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
      <div className="border-b border-slate-200 p-4 pl-16 lg:pl-6">
        <h2 className="text-xl font-semibold text-slate-800">数据查询</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

      <section className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">术语翻译查询</h3>
            <p className="text-xs text-slate-500 mt-1">按中文术语查询 15 语言翻译，候选顺序为精确匹配优先，整体最多返回 10 条。</p>
          </div>
          {translateHasSearched && !translateError && (
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
              translateExactMatch
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {translateExactMatch ? '含精确匹配' : '仅模糊候选'}
            </span>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto] mb-3">
          <input
            type="text"
            value={translateQuery}
            onChange={(e) => setTranslateQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void queryTranslations()
              }
            }}
            placeholder="输入中文术语，例如：黑名单"
            className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
          />
          <button
            onClick={() => {
              void queryTranslations()
            }}
            disabled={translateLoading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {translateLoading ? '查询中...' : '查询'}
          </button>
        </div>
        {translateError && <p className="text-sm text-red-600 mb-2">{translateError}</p>}
        {translateMessage && !translateError && <p className="text-sm text-slate-600 mb-2">{translateMessage}</p>}

        {translateHasSearched && (
          <div>
            {translateItems.length === 0 ? (
              <p className="text-sm text-slate-500 py-3">未找到结果</p>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto pb-1">
                  <div className="flex gap-2 flex-nowrap">
                    {translateItems.map((item) => (
                      <button
                        key={item.rowid}
                        onClick={() => setSelectedRowId(item.rowid)}
                        className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                          selectedRowId === item.rowid
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {item.chs}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sticky top-0 z-10 -mx-5 bg-white/95 backdrop-blur border-b border-slate-200 px-5 py-2 overflow-x-auto">
                  <div className="flex gap-1.5 flex-nowrap">
                    {LANGUAGES.map(({ key, label, color }) => (
                      <button
                        key={key}
                        onClick={() => scrollToLang(key)}
                        className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                          activeLang === key
                            ? `${color} ring-2 ring-emerald-400 ring-offset-1`
                            : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const item = translateItems.find((i) => i.rowid === selectedRowId)
                  if (!item) return null
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-400 mb-2 font-mono">RowID: {item.rowid}</div>
                      <div className="space-y-0.5">
                        {LANGUAGES.map(({ key, label, color }) => (
                          <div
                            key={key}
                            data-lang={key}
                            className={`flex gap-3 rounded-md px-3 py-1.5 transition-colors ${
                              activeLang === key ? 'bg-emerald-50/80 ring-1 ring-emerald-300' : ''
                            }`}
                          >
                            <span className={`w-10 shrink-0 rounded px-1 py-0.5 text-center text-xs font-medium ${color}`}>
                              {label}
                            </span>
                            <span className="text-sm text-slate-800 break-words whitespace-pre-wrap min-w-0">
                              {item[key]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800 mb-3">实体信息查询</h3>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] mb-3">
          <input
            type="text"
            value={gadgetId}
            onChange={(e) => setGadgetId(e.target.value)}
            placeholder="输入实体 ID（整数）"
            className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
          />
          <input
            type="text"
            value={gadgetName}
            onChange={(e) => setGadgetName(e.target.value)}
            placeholder="输入实体中文名"
            className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
          />
          <button
            onClick={queryGadgets}
            disabled={gadgetLoading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {gadgetLoading ? '查询中...' : '查询'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-2">ID 和中文名二选一；同时填写时优先 ID。</p>
        {gadgetError && <p className="text-sm text-red-600 mb-2">{gadgetError}</p>}

        {gadgetHasSearched && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-slate-200">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-left">中文名</th>
                  <th className="px-3 py-2 text-left">X</th>
                  <th className="px-3 py-2 text-left">Y</th>
                  <th className="px-3 py-2 text-left">Z</th>
                </tr>
              </thead>
              <tbody>
                {gadgetItems.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={5}>未找到数据</td>
                  </tr>
                ) : (
                  gadgetItems.map((item) => (
                    <tr key={item.list_id} className="border-t border-slate-200">
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
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800 mb-3">特效信息查询</h3>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] mb-3">
          <input
            type="text"
            value={effectId}
            onChange={(e) => setEffectId(e.target.value)}
            placeholder="输入特效 ID（整数）"
            className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
          />
          <input
            type="text"
            value={effectName}
            onChange={(e) => setEffectName(e.target.value)}
            placeholder="输入特效中文名"
            className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
          />
          <button
            onClick={queryEffects}
            disabled={effectLoading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {effectLoading ? '查询中...' : '查询'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-2">ID 和中文名二选一；同时填写时优先 ID。</p>
        {effectError && <p className="text-sm text-red-600 mb-2">{effectError}</p>}

        {effectHasSearched && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-slate-200">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-left">中文名</th>
                  <th className="px-3 py-2 text-left">持续时长</th>
                  <th className="px-3 py-2 text-left">半径</th>
                </tr>
              </thead>
              <tbody>
                {effectItems.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={4}>未找到数据</td>
                  </tr>
                ) : (
                  effectItems.map((item) => (
                    <tr key={item.id} className="border-t border-slate-200">
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
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800 mb-3">音乐信息查询</h3>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] mb-3">
          <input
            type="text"
            value={bgmId}
            onChange={(e) => setBgmId(e.target.value)}
            placeholder="输入音乐 ID（整数）"
            className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
          />
          <input
            type="text"
            value={bgmName}
            onChange={(e) => setBgmName(e.target.value)}
            placeholder="输入音乐中文名"
            className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
          />
          <button
            onClick={queryBgm}
            disabled={bgmLoading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {bgmLoading ? '查询中...' : '查询'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-2">ID 和中文名二选一；同时填写时优先 ID。</p>
        {bgmError && <p className="text-sm text-red-600 mb-2">{bgmError}</p>}

        {bgmHasSearched && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-slate-200">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-left">中文名</th>
                  <th className="px-3 py-2 text-left">持续时长（秒）</th>
                  <th className="px-3 py-2 text-left">类别</th>
                </tr>
              </thead>
              <tbody>
                {bgmItems.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={4}>未找到数据</td>
                  </tr>
                ) : (
                  bgmItems.map((item) => (
                    <tr key={item.bgm_id} className="border-t border-slate-200">
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
      </section>      </div>    </div>
  )
}
