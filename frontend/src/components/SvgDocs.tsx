import { useState, useEffect, useMemo } from 'react'

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

export default function SvgDocs() {
  const [sections, setSections] = useState<SvgSection[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [svgScale, setSvgScale] = useState(1)

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
      })
      .finally(() => setLoading(false))
  }, [])

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
                          onClick={() =>
                            item.filename && setSelectedFilename(item.filename)
                          }
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
                        onClick={() =>
                          item.filename && setSelectedFilename(item.filename)
                        }
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

            {/* SVG 图片区域 */}
            <div className="flex-1 overflow-auto p-4">
              <img
                src={`/api/v1/svg/file/${encodeURIComponent(selectedFilename)}`}
                alt={selectedItem?.title ?? selectedFilename}
                style={{
                  transform: `scale(${svgScale})`,
                  transformOrigin: 'top left',
                }}
                className="max-w-none"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 select-none">
            <div className="text-center space-y-2">
              <div className="text-5xl">📊</div>
              <div className="text-sm">从左侧目录选择图表查看</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
