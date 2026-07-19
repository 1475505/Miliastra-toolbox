import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()

  const LANGUAGES = [
    { key: 'chs' as LangKey, label: t('data.langChs') },
    { key: 'cht' as LangKey, label: t('data.langCht') },
    { key: 'en' as LangKey, label: t('data.langEn') },
    { key: 'jp' as LangKey, label: t('data.langJp') },
    { key: 'kr' as LangKey, label: t('data.langKr') },
    { key: 'de' as LangKey, label: t('data.langDe') },
    { key: 'fr' as LangKey, label: t('data.langFr') },
    { key: 'es' as LangKey, label: t('data.langEs') },
    { key: 'it' as LangKey, label: t('data.langIt') },
    { key: 'pt' as LangKey, label: t('data.langPt') },
    { key: 'ru' as LangKey, label: t('data.langRu') },
    { key: 'th' as LangKey, label: t('data.langTh') },
    { key: 'tr' as LangKey, label: t('data.langTr') },
    { key: 'vi' as LangKey, label: t('data.langVi') },
    { key: 'id' as LangKey, label: t('data.langId') },
  ]

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
      setGadgetError(t('data.enterIdOrName'))
      return
    }
    if (id && !isValidInteger(id)) {
      setGadgetError(t('data.idMustBeInteger'))
      return
    }

    setGadgetLoading(true)
    setGadgetError('')
    setGadgetHasSearched(true)

    try {
      const response = await fetch(`/api/v1/data/gadgets?${buildQuery(id, name)}`)
      const payload = (await response.json()) as DataResponse<GadgetItem>
      if (!response.ok || !payload.success) {
        throw new Error(payload.detail || t('data.queryFailed'))
      }
      setGadgetItems(payload.data.items)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('data.queryFailed')
      setGadgetError(message)
      setGadgetItems([])
    } finally {
      setGadgetLoading(false)
    }
  }

  const queryTranslations = async () => {
    const query = translateQuery.trim()

    if (!query) {
      setTranslateError(t('data.enterKeyword'))
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
        typeof payload.detail === 'string' ? payload.detail : t('data.queryFailed')

      if (!response.ok || !payload.success) {
        throw new Error(detail)
      }

      setTranslateExactMatch(payload.data.exact_match)
      setTranslateMessage(payload.data.message || '')
      setTranslateItems(payload.data.results)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('data.queryFailed')
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
      setEffectError(t('data.enterIdOrName'))
      return
    }
    if (id && !isValidInteger(id)) {
      setEffectError(t('data.idMustBeInteger'))
      return
    }

    setEffectLoading(true)
    setEffectError('')
    setEffectHasSearched(true)

    try {
      const response = await fetch(`/api/v1/data/effects?${buildQuery(id, name)}`)
      const payload = (await response.json()) as DataResponse<EffectItem>
      if (!response.ok || !payload.success) {
        throw new Error(payload.detail || t('data.queryFailed'))
      }
      setEffectItems(payload.data.items)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('data.queryFailed')
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
      setBgmError(t('data.enterIdOrName'))
      return
    }
    if (id && !isValidInteger(id)) {
      setBgmError(t('data.idMustBeInteger'))
      return
    }

    setBgmLoading(true)
    setBgmError('')
    setBgmHasSearched(true)

    try {
      const response = await fetch(`/api/v1/data/bgm?${buildQuery(id, name)}`)
      const payload = (await response.json()) as DataResponse<BgmItem>
      if (!response.ok || !payload.success) {
        throw new Error(payload.detail || t('data.queryFailed'))
      }
      setBgmItems(payload.data.items)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('data.queryFailed')
      setBgmError(message)
      setBgmItems([])
    } finally {
      setBgmLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={t('data.title')} />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
        {/* 术语翻译查询 */}
        <Surface className="!p-0 overflow-hidden">
          <div className="p-5">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-on-surface">
                  {t('data.translateQuery')}
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  {t('data.translateDesc')}
                </p>
              </div>
              {translateHasSearched && !translateError && (
                <Chip variant={translateExactMatch ? 'primary' : 'default'}>
                  {translateExactMatch ? t('data.hasExactMatch') : t('data.fuzzyOnly')}
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
                placeholder={t('data.translatePlaceholder')}
              />
              <Button
                onClick={() => {
                  void queryTranslations()
                }}
                disabled={translateLoading}
              >
                {translateLoading ? t('common.querying') : t('common.query')}
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
                  {t('common.noResults')}
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

                  <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur border-y border-outline px-5 py-2 -mx-5">
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
            {t('data.gadgetQuery')}
          </h3>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] mb-3">
            <Input
              type="text"
              value={gadgetId}
              onChange={(e) => setGadgetId(e.target.value)}
              placeholder={t('data.gadgetIdPlaceholder')}
            />
            <Input
              type="text"
              value={gadgetName}
              onChange={(e) => setGadgetName(e.target.value)}
              placeholder={t('data.gadgetNamePlaceholder')}
            />
            <Button onClick={queryGadgets} disabled={gadgetLoading}>
              {gadgetLoading ? t('common.querying') : t('common.query')}
            </Button>
          </div>
          <p className="text-xs text-on-surface-variant mb-2">
            {t('data.idOrNameHint')}
          </p>
          {gadgetError && (
            <p className="text-sm text-error mb-2">{gadgetError}</p>
          )}

          {gadgetHasSearched && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-outline rounded-xl overflow-hidden border-separate border-spacing-0">
                <thead className="bg-surface-variant">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      ID
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      {t('data.colName')}
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
                        {t('common.noData')}
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
            {t('data.effectQuery')}
          </h3>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] mb-3">
            <Input
              type="text"
              value={effectId}
              onChange={(e) => setEffectId(e.target.value)}
              placeholder={t('data.effectIdPlaceholder')}
            />
            <Input
              type="text"
              value={effectName}
              onChange={(e) => setEffectName(e.target.value)}
              placeholder={t('data.effectNamePlaceholder')}
            />
            <Button onClick={queryEffects} disabled={effectLoading}>
              {effectLoading ? t('common.querying') : t('common.query')}
            </Button>
          </div>
          <p className="text-xs text-on-surface-variant mb-2">
            {t('data.idOrNameHint')}
          </p>
          {effectError && (
            <p className="text-sm text-error mb-2">{effectError}</p>
          )}

          {effectHasSearched && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-outline rounded-xl overflow-hidden border-separate border-spacing-0">
                <thead className="bg-surface-variant">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      ID
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      {t('data.colName')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      {t('data.colDuration')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      {t('data.colRadius')}
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
                        {t('common.noData')}
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
            {t('data.bgmQuery')}
          </h3>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] mb-3">
            <Input
              type="text"
              value={bgmId}
              onChange={(e) => setBgmId(e.target.value)}
              placeholder={t('data.bgmIdPlaceholder')}
            />
            <Input
              type="text"
              value={bgmName}
              onChange={(e) => setBgmName(e.target.value)}
              placeholder={t('data.bgmNamePlaceholder')}
            />
            <Button onClick={queryBgm} disabled={bgmLoading}>
              {bgmLoading ? t('common.querying') : t('common.query')}
            </Button>
          </div>
          <p className="text-xs text-on-surface-variant mb-2">
            {t('data.idOrNameHint')}
          </p>
          {bgmError && <p className="text-sm text-error mb-2">{bgmError}</p>}

          {bgmHasSearched && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-outline rounded-xl overflow-hidden border-separate border-spacing-0">
                <thead className="bg-surface-variant">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      ID
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      {t('data.colName')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      {t('data.colDurationSec')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-on-surface">
                      {t('data.colCategory')}
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
                        {t('common.noData')}
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
