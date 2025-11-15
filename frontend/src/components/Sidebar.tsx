import { useState } from 'react'
import { Tab } from '../types'
import ConfigModal from './ConfigModal'

interface SidebarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  onConfigSaved?: () => void
}

export default function Sidebar({ activeTab, onTabChange, onConfigSaved }: SidebarProps) {
  const [showConfig, setShowConfig] = useState(false)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chat', label: '知识库问答' },
    { id: 'share', label: '素材分享' },
    { id: 'tools', label: '工具链接' },
  ]

  return (
    <>
      <aside className="w-64 border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-gray-900">千星工具箱</h1>
        </div>

        <nav className="flex-1 p-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full text-left px-4 py-3 rounded-lg mb-2 transition-colors ${
                activeTab === tab.id
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={() => setShowConfig(true)}
            className="w-full px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
          >
            ⚙️ OpenAI 配置
          </button>
        </div>
      </aside>

      {showConfig && <ConfigModal onClose={() => setShowConfig(false)} onConfigSaved={onConfigSaved} />}
    </>
  )
}
