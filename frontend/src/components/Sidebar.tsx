import { useState, useEffect } from 'react'
import { Tab, Conversation } from '../types'
import ConfigModal from './ConfigModal'
import { getAllConversations, deleteConversation, updateConversationTitle, deleteAllConversations } from '../utils/conversations'

interface SidebarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  onConfigSaved?: () => void
  isOpen?: boolean
  onToggle?: () => void
  currentConversationId?: string
  onConversationSelect?: (id: string) => void
  onConversationDeleted?: () => void
  conversationRefreshTrigger?: number
}

export default function Sidebar({ 
  activeTab, 
  onTabChange, 
  onConfigSaved, 
  isOpen = true, 
  onToggle,
  currentConversationId,
  onConversationSelect,
  onConversationDeleted,
  conversationRefreshTrigger
}: SidebarProps) {
  const [showConfig, setShowConfig] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [showClearHint, setShowClearHint] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(true)

  useEffect(() => {
    if (activeTab === 'chat') {
      // 只有在展开时才加载列表
      if (!isHistoryCollapsed) {
        loadConversations()
      }
      
      // 首次进入时显示清理提醒
      const hasSeenHint = localStorage.getItem('chat_clear_hint_seen')
      if (!hasSeenHint) {
        setShowClearHint(true)
        localStorage.setItem('chat_clear_hint_seen', 'true')
      }
    }
  }, [activeTab, conversationRefreshTrigger, isHistoryCollapsed])

  const loadConversations = () => {
    setConversations(getAllConversations().sort((a, b) => b.updatedAt - a.updatedAt))
  }

  const handleDeleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('确定删除此对话？')) {
      deleteConversation(id)
      loadConversations()
      if (currentConversationId === id) {
        onConversationDeleted?.()
      }
    }
  }

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('确定要清空所有历史对话吗？此操作不可恢复。')) {
      deleteAllConversations()
      loadConversations()
      onConversationDeleted?.()
    }
  }

  const startEditing = (conv: Conversation) => {
    setEditingId(conv.id)
    setEditTitle(conv.title)
  }

  const handleSaveTitle = (id: string) => {
    if (editTitle.trim()) {
      updateConversationTitle(id, editTitle.trim())
      loadConversations()
    }
    setEditingId(null)
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chat', label: '知识库问答' },
    { id: 'notes', label: '笔记' },
    { id: 'upload', label: '图床' },
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
      
      <aside className={`flex w-64 flex-col border-r border-emerald-100 bg-emerald-50/80 text-slate-900 shadow-sm transition-transform duration-300 lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } fixed lg:relative h-full z-50 lg:z-auto`}>
        <div className="border-b border-emerald-100 p-4 lg:p-6 flex items-center justify-between">
          <h1 className="text-lg lg:text-xl font-semibold">千星奇域工具箱</h1>
          {/* Mobile close button */}
          <button
            onClick={onToggle}
            className="lg:hidden p-1 hover:bg-emerald-100 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          {tabs.map((tab) => (
            <div key={tab.id}>
              <button
                onClick={() => onTabChange(tab.id)}
                className={`mb-3 w-full rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-emerald-200/70 text-emerald-900 shadow-sm border border-emerald-200 font-semibold'
                    : 'text-slate-600 hover:bg-emerald-100/60 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
              
              {tab.id === 'chat' && activeTab === 'chat' && (
                <div className="mb-4 ml-2">
                  {showClearHint && (
                    <div className="mb-3 p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700">
                      💡 提示：请及时清理不需要的对话
                      <button 
                        onClick={() => setShowClearHint(false)}
                        className="float-right text-orange-400 hover:text-orange-600"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  
                  <div 
                    className="flex items-center justify-between text-xs text-slate-500 mb-2 px-2 cursor-pointer hover:text-slate-700 select-none group/header"
                    onClick={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
                  >
                    <div className="flex items-center gap-2">
                       <span>对话历史</span>
                       <span className={`transform transition-transform duration-200 ${isHistoryCollapsed ? '-rotate-90' : 'rotate-0'}`}>
                         ▼
                       </span>
                    </div>
                    {!isHistoryCollapsed && conversations.length > 0 && (
                      <button
                        onClick={handleClearAll}
                        className="opacity-0 group-hover/header:opacity-100 transition-opacity text-red-400 hover:text-red-600 px-1 rounded hover:bg-red-50"
                        title="清空所有历史"
                      >
                        清空
                      </button>
                    )}
                  </div>
                  {!isHistoryCollapsed && (
                    conversations.length === 0 ? (
                      <div className="text-xs text-slate-400 px-2 py-2">暂无对话</div>
                    ) : (
                      <div className="space-y-1">
                        {conversations.map((conv) => (
                          <div
                            key={conv.id}
                            onClick={() => onConversationSelect?.(conv.id)}
                            className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                              currentConversationId === conv.id
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'text-slate-600 hover:bg-emerald-100/50'
                            }`}
                          >
                            {editingId === conv.id ? (
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onBlur={() => handleSaveTitle(conv.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveTitle(conv.id)
                                  if (e.key === 'Escape') setEditingId(null)
                                }}
                                className="flex-1 bg-white/50 border border-blue-300 rounded px-1 py-0.5 outline-none min-w-0"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span 
                                className="truncate flex-1" 
                                onDoubleClick={(e) => {
                                  e.stopPropagation()
                                  startEditing(conv)
                                }}
                                title={conv.title}
                              >
                                {conv.title}
                              </span>
                            )}
                            
                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                              {!editingId && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    startEditing(conv)
                                  }}
                                  className="text-slate-400 hover:text-blue-600 mr-1"
                                  title="重命名"
                                >
                                  ✏️
                                </button>
                              )}
                              <button
                                onClick={(e) => handleDeleteConversation(conv.id, e)}
                                className="text-red-400 hover:text-red-600"
                                title="删除"
                              >
                                  🗑️
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="border-t border-emerald-100 p-4 space-y-2">
          <a
            href="https://github.com/1475505/Miliastra-toolbox"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-xl px-4 py-2.5 text-sm text-slate-600 transition-all hover:bg-emerald-100/50 hover:text-slate-900"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              <span>GitHub 仓库</span>
            </div>
            <div className="text-xs text-slate-500 mt-1 ml-7">欢迎 Star ⭐</div>
          </a>
          <a
            href="https://qm.qq.com/q/M1mCoQN8ki"
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl px-4 py-2.5 text-sm text-slate-600 transition-all hover:bg-emerald-100/50 hover:text-slate-900"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21.395 15.035a39.548 39.548 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a38.97 38.97 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673z"/>
              </svg>
              <span>用户 QQ 群：1007538100</span>
            </div>
            <div className="text-xs text-slate-500 mt-1 ml-7">已接入机器人 🤖</div>
          </a>
          <div className="rounded-2xl px-4 py-2.5 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <span>👤</span>
              <span>作者 QQ：725230880</span>
            </div>
          </div>
        </div>

        <div className="border-t border-emerald-100 p-4">
          <button
            onClick={() => setShowConfig(true)}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-medium bg-emerald-200/80 text-emerald-900 border border-emerald-300 hover:bg-emerald-300/80 focus:outline-none focus:ring-2 focus:ring-emerald-300 transition-all"
            title="OpenAI 配置"
            aria-label="OpenAI 配置"
          >
            ⚙️ OpenAI 配置
          </button>
        </div>
      </aside>

      {showConfig && <ConfigModal onClose={() => setShowConfig(false)} onConfigSaved={onConfigSaved} />}
    </>
  )
}
