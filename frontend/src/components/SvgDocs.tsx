import { useState, useEffect, useMemo, useRef } from 'react'

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
  const [sections, setSections] = useState<SvgSection[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [svgScale, setSvgScale] = useState(1)
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [svgLoading, setSvgLoading] = useState(false)
  const [svgLinks, setSvgLinks] = useState<SvgLink[]>([])

  // slug present in the URL before index loads (e.g. /svg/31-技能 → "31-技能")
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

        // Apply slug from URL if present
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

  // Fetch SVG content and patch all <a> links to open in new tab
  useEffect(() => {
    if (!selectedFilename) {
      setSvgContent(null)
      setSvgLinks([])
      return
    }
    setSvgLoading(true)
    setSvgContent(null)
    setSvgLinks([])
    fetch(`/api/v1/svg/raw/${encodeURIComponent(selectedFilename)}`)
      .then((r) => r.text())
      .then((text) => {
        const parser = new DOMParser()
        const doc = parser.parseFromString(text, 'image/svg+xml')
        const extracted: SvgLink[] = []
        // Inject target="_blank" + rel="noreferrer" and extract link metadata
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

  // Sync selection when browser navigates back/forward within /svg/*
  useEffect(() => {
    const handlePop = () => {
      const slug = getDocIdFromPath()
      if (!slug) {
        setSelectedFilename(null)
        return
      }
      const match = findItemBySlug(sections.flatMap((s) => s.items), slug)
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
    // Use number as slug: "31-技能.svg" → "/svg/31"（兼容旧的 /svg/31-技能 格式）
    const newPath = `/svg/${item.number}`
    if (window.location.pathname !== newPath) {
      window.history.pushState({}, '', newPath)
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
    <div className="flex h-full overflow-hidden">
      {/* 左侧目录面板 */}
      <div className="w-56 flex-shrink-0 border-r border-white/20 bg-emerald-50/60 flex flex-col">
        <div className="p-3 border-b border-emerald-100">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            一图流文档
          </h2>
          <input
            type="text"
            placeholder="搜索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm bg-white/70 border border-emerald-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-300 placeholder-slate-400"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {loading ? (
            <div className="text-xs text-slate-400 p-3 text-center">加载中...</div>
          ) : filteredSections.length === 0 ? (
            <div className="text-xs text-slate-400 p-3 text-center">无匹配结果</div>
          ) : (
            filteredSections.map((section) =>
              section.level === 2 ? (
                <div key={section.title}>
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100/70 rounded-lg transition-colors"
                  >
                    <span>{section.title}</span>
                    <span
                      className={`text-emerald-500 transition-transform duration-200 ${
                        expandedSections.has(section.title) ? 'rotate-180' : ''
                      }`}
                    >
                      ▾
                    </span>
                  </button>
                  {expandedSections.has(section.title) && (
                    <div className="ml-1 mt-0.5 space-y-0.5">
                      {section.items.map((item) => (
                        <button
                          key={item.number}
                          onClick={() => selectItem(item)}
                          disabled={!item.filename}
                          title={item.title}
                          className={`w-full text-left px-2.5 py-1 text-xs rounded-lg transition-all truncate ${
                            selectedFilename === item.filename
                              ? 'bg-emerald-200/80 text-emerald-900 font-medium'
                              : item.filename
                              ? 'text-slate-600 hover:bg-emerald-100/60 hover:text-slate-900'
                              : 'text-slate-300 cursor-not-allowed'
                          }`}
                        >
                          {item.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* H1 sections (版本更新等) */
                <div key={section.title}>
                  <div className="px-2 py-1.5 text-xs font-bold text-amber-700 border-t border-amber-200/60 mt-1 pt-2">
                    {section.title}
                  </div>
                  <div className="ml-1 mt-0.5 space-y-0.5">
                    {section.items.map((item) => (
                      <button
                        key={`h1-${section.title}-${item.number}`}
                        onClick={() => selectItem(item)}
                        disabled={!item.filename}
                        title={item.title}
                        className={`w-full text-left px-2.5 py-1 text-xs rounded-lg transition-all truncate ${
                          selectedFilename === item.filename
                            ? 'bg-amber-100 text-amber-900 font-medium'
                            : item.filename
                            ? 'text-slate-600 hover:bg-amber-50 hover:text-slate-900'
                            : 'text-slate-300 cursor-not-allowed'
                        }`}
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

      {/* 右侧 SVG 查看器 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedFilename ? (
          <>
            {/* 标题栏 + 缩放控件 */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/20 bg-white/20 flex-shrink-0">
              <span className="text-sm font-medium text-slate-700 truncate mr-4">
                {selectedItem?.title ?? selectedFilename}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => setSvgScale((s) => Math.max(0.25, s - 0.25))}
                  className="px-2 py-1 text-xs bg-white/50 hover:bg-white/80 rounded-lg border border-white/40 transition-colors"
                >
                  −
                </button>
                <span className="text-xs text-slate-500 w-12 text-center tabular-nums">
                  {Math.round(svgScale * 100)}%
                </span>
                <button
                  onClick={() => setSvgScale((s) => Math.min(4, s + 0.25))}
                  className="px-2 py-1 text-xs bg-white/50 hover:bg-white/80 rounded-lg border border-white/40 transition-colors"
                >
                  +
                </button>
                <button
                  onClick={() => setSvgScale(1)}
                  className="px-2 py-1 text-xs bg-white/50 hover:bg-white/80 rounded-lg border border-white/40 transition-colors"
                >
                  重置
                </button>
              </div>
            </div>

            {/* Inline SVG 区域 */}
            <div className="flex-1 overflow-auto p-4">
              {svgLoading ? (
                <div className="flex h-full items-center justify-center text-slate-400 text-sm">
                  加载中...
                </div>
              ) : svgContent ? (
                <div className="space-y-6 pb-6">
                  <div
                    style={{ zoom: svgScale }}
                    // SVG 来自受控知识库，已确认无 <script> 标签
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: svgContent }}
                  />

                  <div className="mt-2 pt-2 border-t border-white/20 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-xs text-slate-400 flex-shrink-0">相关文档</span>
                    {svgLinks.length > 0 ? (
                      svgLinks.map((link, i) => (
                        <a
                          key={i}
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-emerald-600 hover:text-emerald-800 hover:underline"
                        >
                          {link.text}
                        </a>
                      ))
                    ) : (
                      <a
                        href="https://act.mihoyo.com/ys/ugc/tutorial/detail/mhs2w008wf14"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-emerald-600 hover:text-emerald-800 hover:underline"
                      >
                        奇匠学院
                      </a>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 select-none">
            <div className="text-center space-y-4">
              <div className="text-5xl">📊</div>
              <div className="text-sm">从左侧目录选择图表查看</div>
              <a
                href="https://act.mihoyo.com/ys/ugc/tutorial/detail/mhs2w008wf14"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500/80 hover:bg-emerald-500 text-white text-sm rounded-xl transition-colors shadow-sm"
              >
                🎓 打开奇匠学院
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
