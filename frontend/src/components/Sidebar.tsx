import { useState } from 'react'
import { Tab } from '../types'
import ConfigModal from './ConfigModal'

interface SidebarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  onConfigSaved?: () => void
  isOpen?: boolean
  onToggle?: () => void
}

export default function Sidebar({ activeTab, onTabChange, onConfigSaved, isOpen = true, onToggle }: SidebarProps) {
  const [showConfig, setShowConfig] = useState(false)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chat', label: '知识库问答' },
    { id: 'share', label: '素材分享' },
    { id: 'tools', label: '工具链接' },
  ]

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
          onClick={onToggle}
        />
      )}
      
      <aside className={`flex w-64 flex-col border-r border-white/30 bg-white/30 text-slate-900 backdrop-blur-2xl shadow-[0_20px_60px_rgba(15,23,42,0.12)] transition-transform duration-300 lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } fixed lg:relative h-full z-50 lg:z-auto`}>
        <div className="border-b border-white/30 p-4 lg:p-6 flex items-center justify-between">
          <h1 className="text-lg lg:text-xl font-semibold">千星工具箱</h1>
          {/* Mobile close button */}
          <button
            onClick={onToggle}
            className="lg:hidden p-1 hover:bg-white/30 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`mb-3 w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-yellow-200/90 text-slate-900 shadow-lg shadow-yellow-300/30 border border-yellow-300 font-semibold'
                  : 'text-slate-600 hover:bg-white/30 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="border-t border-white/20 p-4">
          <button
            onClick={() => setShowConfig(true)}
            className="w-full rounded-2xl px-4 py-3 text-sm font-medium text-slate-600 transition-all hover:bg-white/30 hover:text-slate-900"
          >
            ⚙️ OpenAI 配置
          </button>
        </div>
      </aside>

      {showConfig && <ConfigModal onClose={() => setShowConfig(false)} onConfigSaved={onConfigSaved} />}
    </>
  )
}
