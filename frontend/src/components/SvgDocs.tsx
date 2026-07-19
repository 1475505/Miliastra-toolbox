import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import IconButton from './ui/IconButton'
import Button from './ui/Button'
import Input from './ui/Input'
import {
  MenuIcon,
  ChevronDownIcon,
  ZoomOutIcon,
  ZoomInIcon,
  OpenExternalIcon,
} from './ui/icons'

interface SvgItem {
  number: string
  title: string
  filename: string | null
}

interface SvgSection {
  title: string
  level: number
  items: SvgItem[]
}

interface SvgIndexResponse {
  sections: SvgSection[]
}

interface SvgLink {
  href: string
  text: string
}

/** 从路径 /svg/<slug> 中提取 slug（如 "31-技能"），兼容旧的纯数字格式 */
function getDocIdFromPath(): string | null {
  const m = window.location.pathname.match(/^\/svg\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

/** 根据 slug 在条目列表中查找匹配项（优先 filename stem，兼容纯数字编号） */
function findItemBySlug(items: SvgItem[], slug: string): SvgItem | undefined {
  return items.find((item) => {
    if (!item.filename) return false
    const stem = item.filename.replace(/\.svg$/, '')
    return stem === slug || item.number === slug
  })
}

export default function SvgDocs() {
  const { t } = useTranslation()
  const [sections, setSections] = useState<SvgSection[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [svgScale, setSvgScale] = useState(1)
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [svgLoading, setSvgLoading] = useState(false)
  const [svgLinks, setSvgLinks] = useState<SvgLink[]>([])
  const [docsOpen, setDocsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  )

  const pendingDocId = useRef<string | null>(getDocIdFromPath())

  useEffect(() => {
    fetch('/api/v1/svg/index')
      .then((r) => r.json())
      .then((data: SvgIndexResponse) => {
        setSections(data.sections)
        const expanded = new Set<string>()
        data.sections.forEach((s) => {
          if (s.level === 2) expanded.add(s.title)
        })
        setExpandedSections(expanded)

        if (pendingDocId.current) {
          const slug = pendingDocId.current
          const allItems = data.sections.flatMap((s) => s.items)
          const match = findItemBySlug(allItems, slug)
          if (match?.filename) setSelectedFilename(match.filename)
          pendingDocId.current = null
        }
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedFilename) {
      setSvgContent(null)
      setSvgLinks([])
      setDocsOpen(false)
      return
    }
    setSvgLoading(true)
    setSvgContent(null)
    setSvgLinks([])
    setDocsOpen(false)
    fetch(`/api/v1/svg/raw/${encodeURIComponent(selectedFilename)}`)
      .then((r) => r.text())
      .then((text) => {
        const parser = new DOMParser()
        const doc = parser.parseFromString(text, 'image/svg+xml')
        const extracted: SvgLink[] = []
        doc.querySelectorAll('a').forEach((a) => {
          a.setAttribute('target', '_blank')
          a.setAttribute('rel', 'noreferrer')
          const href =
            a.getAttribute('href') ||
            a.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
            ''
          const text = a.textContent?.trim() || href
          if (href) extracted.push({ href, text })
        })
        setSvgContent(new XMLSerializer().serializeToString(doc))
        setSvgLinks(extracted)
      })
      .finally(() => setSvgLoading(false))
  }, [selectedFilename])

  useEffect(() => {
    const handlePop = () => {
      const slug = getDocIdFromPath()
      if (!slug) {
        setSelectedFilename(null)
        return
      }
      const match = findItemBySlug(
        sections.flatMap((s) => s.items),
        slug
      )
      setSelectedFilename(match?.filename ?? null)
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [sections])

  const filteredSections = useMemo(() => {
    if (!search.trim()) return sections
    const q = search.trim().toLowerCase()
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            item.title.toLowerCase().includes(q) || item.number.includes(q)
        ),
      }))
      .filter((section) => section.items.length > 0)
  }, [sections, search])

  useEffect(() => {
    if (search.trim()) {
      setExpandedSections(new Set(filteredSections.map((s) => s.title)))
    }
  }, [search, filteredSections])

  const toggleSection = (title: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  const selectItem = (item: SvgItem) => {
    if (!item.filename) return
    setSelectedFilename(item.filename)
    const newPath = `/svg/${item.number}`
    if (window.location.pathname !== newPath) {
      window.history.pushState({}, '', newPath)
    }
    if (window.innerWidth < 768) {
      setSidebarOpen(false)
    }
  }

  const selectedItem = useMemo(
    () =>
      sections
        .flatMap((s) => s.items)
        .find((item) => item.filename === selectedFilename),
    [sections, selectedFilename]
  )

  return (
    <div className="flex h-full overflow-hidden relative">
      {sidebarOpen && (
        <div
          className="md:hidden absolute inset-0 z-10 bg-black/40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left catalog panel */}
      <div
        className={[
          'flex flex-col bg-surface/90 backdrop-blur-md',
          'transition-all duration-200 ease-in-out',
          'absolute inset-y-0 left-0 z-20 w-72 shadow-2xl border-r border-outline',
          'md:relative md:z-auto md:flex-shrink-0 md:shadow-none md:translate-x-0',
          sidebarOpen
            ? 'translate-x-0 md:w-56'
            : '-translate-x-full md:w-0 md:overflow-hidden md:border-r-0',
        ].join(' ')}
      >
        <div className="p-3 border-b border-outline">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
              {t('svg.title')}
            </h2>
            <IconButton
              onClick={() => setSidebarOpen(false)}
              label={t('svg.collapseToc')}
              className="md:hidden"
            >
              <ChevronDownIcon className="w-4 h-4 rotate-90" />
            </IconButton>
          </div>
          <Input
            type="text"
            placeholder={t('svg.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="py-1.5 text-xs"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {loading ? (
            <div className="text-xs text-on-surface-variant p-3 text-center">
              {t('common.loading')}
            </div>
          ) : filteredSections.length === 0 ? (
            <div className="text-xs text-on-surface-variant p-3 text-center">
              {t('svg.noMatch')}
            </div>
          ) : (
            filteredSections.map((section) =>
              section.level === 2 ? (
                <div key={section.title}>
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-variant rounded-lg transition-colors duration-200"
                  >
                    <span>{section.title}</span>
                    <ChevronDownIcon
                      className={`w-3.5 h-3.5 text-on-surface-variant transition-transform duration-200 ${
                        expandedSections.has(section.title) ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {expandedSections.has(section.title) && (
                    <div className="ml-1 mt-0.5 space-y-0.5">
                      {section.items.map((item) => (
                        <button
                          key={item.number}
                          onClick={() => selectItem(item)}
                          disabled={!item.filename}
                          title={item.title}
                          className={[
                            'w-full text-left px-2.5 py-1 text-xs rounded-full transition-colors duration-200 truncate',
                            selectedFilename === item.filename
                              ? 'bg-primary-container text-on-primary-container font-medium'
                              : item.filename
                              ? 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                              : 'text-on-surface-variant/40 cursor-not-allowed',
                          ].join(' ')}
                        >
                          {item.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div key={section.title}>
                  <div className="px-2 py-1.5 text-xs font-bold text-on-surface border-t border-outline mt-1 pt-2">
                    {section.title}
                  </div>
                  <div className="ml-1 mt-0.5 space-y-0.5">
                    {section.items.map((item) => (
                      <button
                        key={`h1-${section.title}-${item.number}`}
                        onClick={() => selectItem(item)}
                        disabled={!item.filename}
                        title={item.title}
                        className={[
                          'w-full text-left px-2.5 py-1 text-xs rounded-full transition-colors duration-200 truncate',
                          selectedFilename === item.filename
                            ? 'bg-primary-container text-on-primary-container font-medium'
                            : item.filename
                            ? 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                            : 'text-on-surface-variant/40 cursor-not-allowed',
                        ].join(' ')}
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>
                </div>
              )
            )
          )}
        </div>
      </div>

      {/* Right SVG viewer */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top toolbar */}
        <div className="flex items-center gap-2 pl-12 pr-4 lg:px-6 min-h-[3.5rem] border-b border-outline bg-surface/70 backdrop-blur-md flex-shrink-0">
          <IconButton
            onClick={() => setSidebarOpen((s) => !s)}
            label={t('svg.toggleToc')}
            className="flex-shrink-0"
          >
            <MenuIcon className="w-5 h-5" />
          </IconButton>
          {selectedFilename ? (
            <>
              <span className="flex-1 text-sm font-medium text-on-surface truncate">
                {selectedItem?.title ?? selectedFilename}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <IconButton
                  onClick={() => setSvgScale((s) => Math.max(0.25, s - 0.25))}
                  label={t('svg.zoomOut')}
                >
                  <ZoomOutIcon className="w-4 h-4" />
                </IconButton>
                <span className="text-xs text-on-surface-variant w-12 text-center tabular-nums">
                  {Math.round(svgScale * 100)}%
                </span>
                <IconButton
                  onClick={() => setSvgScale((s) => Math.min(4, s + 0.25))}
                  label={t('svg.zoomIn')}
                >
                  <ZoomInIcon className="w-4 h-4" />
                </IconButton>
                <Button
                  variant="outlined"
                  size="sm"
                  onClick={() => setSvgScale(1)}
                >
                  {t('common.reset')}
                </Button>
                <div className="relative">
                  <Button
                    variant={docsOpen ? 'tonal' : 'outlined'}
                    size="sm"
                    onClick={() => setDocsOpen((v) => !v)}
                  >
                    {t('svg.relatedDocs')}
                  </Button>
                  {docsOpen && (
                    <div className="absolute right-0 top-full mt-1 z-30 min-w-max bg-surface/95 backdrop-blur-lg border border-outline rounded-2xl shadow-lg p-3 flex flex-col gap-1.5">
                      {svgLinks.length > 0 ? (
                        svgLinks.map((link, i) => (
                          <a
                            key={i}
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary hover:text-primary/80 hover:underline whitespace-nowrap"
                          >
                            {link.text}
                          </a>
                        ))
                      ) : (
                        <a
                          href="https://act.mihoyo.com/ys/ugc/tutorial/detail/mhs2w008wf14"
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary hover:text-primary/80 hover:underline whitespace-nowrap"
                        >
                          {t('svg.academy')}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <span className="text-sm font-medium text-on-surface">
              {t('svg.docTitle')}
            </span>
          )}
        </div>

        {selectedFilename ? (
          <div className="flex-1 overflow-auto p-4">
            {svgLoading ? (
              <div className="flex h-full items-center justify-center text-on-surface-variant text-sm">
                {t('common.loading')}
              </div>
            ) : svgContent ? (
              <div className="space-y-6 pb-6">
                <div
                  style={{ zoom: svgScale }}
                  // SVG 来自受控知识库，已确认无 <script> 标签
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: svgContent }}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-on-surface-variant select-none">
            <div className="text-center space-y-4">
              <OpenExternalIcon className="w-16 h-16 mx-auto opacity-40" />
              <div className="text-sm">{t('svg.selectFromToc')}</div>
              <a
                href="https://act.mihoyo.com/ys/ugc/tutorial/detail/mhs2w008wf14"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary text-sm rounded-full transition-colors duration-200 hover:bg-primary/90 shadow-sm"
              >
                {t('svg.openAcademy')}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
