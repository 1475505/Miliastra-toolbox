import { useState, useEffect } from 'react'
import { Tab, Conversation } from '../types'
import {
  getAllConversations,
  deleteConversation,
  updateConversationTitle,
  deleteAllConversations,
} from '../utils/conversations'
import IconButton from './ui/IconButton'
import Input from './ui/Input'
import {
  CloseIcon,
  ChevronDownIcon,
  PencilIcon,
  TrashIcon,
  OpenExternalIcon,
} from './ui/icons'

interface SidebarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
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
  isOpen = true,
  onToggle,
  currentConversationId,
  onConversationSelect,
  onConversationDeleted,
  conversationRefreshTrigger,
}: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [showClearHint, setShowClearHint] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(true)

  useEffect(() => {
    if (activeTab === 'chat') {
      if (!isHistoryCollapsed) {
        loadConversations()
      }
      const hasSeenHint = localStorage.getItem('chat_clear_hint_seen')
      if (!hasSeenHint) {
        setShowClearHint(true)
        localStorage.setItem('chat_clear_hint_seen', 'true')
      }
    }
  }, [activeTab, conversationRefreshTrigger, isHistoryCollapsed])

  const loadConversations = () => {
    setConversations(
      getAllConversations().sort((a, b) => b.updatedAt - a.updatedAt)
    )
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
    { id: 'svg', label: '文档一图流' },
    { id: 'tools', label: '工具调用' },
    { id: 'data', label: '数据查询' },
    { id: 'notes', label: '笔记' },
  ]

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      <aside
        className={[
          'flex w-64 flex-col z-50 lg:z-auto',
          'bg-surface/90 backdrop-blur-md text-on-surface',
          'border-r border-outline shadow-lg lg:shadow-none',
          'transition-transform duration-300 ease-in-out',
          'fixed lg:relative h-full',
          isOpen ? 'translate-x-0 lg:translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between min-h-[3.5rem] px-4 border-b border-outline">
          <h1 className="text-lg font-semibold text-on-surface">千星奇域工具箱</h1>
          <IconButton onClick={onToggle} label="Close menu" className="lg:hidden">
            <CloseIcon className="w-5 h-5" />
          </IconButton>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto">
          {tabs.map((tab) => (
            <div key={tab.id}>
              <button
                onClick={() => onTabChange(tab.id)}
                className={[
                  'mb-2 w-full rounded-full px-4 py-2.5 text-left text-sm font-medium',
                  'transition-colors duration-200',
                  activeTab === tab.id
                    ? 'bg-primary-container text-on-primary-container'
                    : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface',
                ].join(' ')}
              >
                {tab.label}
              </button>

              {tab.id === 'chat' && activeTab === 'chat' && (
                <div className="mb-3 ml-2">
                  {showClearHint && (
                    <div className="mb-3 p-3 rounded-2xl bg-primary-container/60 border border-outline text-xs text-on-primary-container">
                      <div className="flex items-start justify-between gap-2">
                        <span>提示：请及时清理不需要的对话</span>
                        <button
                          onClick={() => setShowClearHint(false)}
                          className="text-on-primary-container/70 hover:text-on-primary-container"
                        >
                          <CloseIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div
                    className="flex items-center justify-between text-xs text-on-surface-variant mb-2 px-2 cursor-pointer hover:text-on-surface select-none group/header"
                    onClick={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
                  >
                    <div className="flex items-center gap-2">
                      <span>对话历史</span>
                      <ChevronDownIcon
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          isHistoryCollapsed ? '-rotate-90' : 'rotate-0'
                        }`}
                      />
                    </div>
                    {!isHistoryCollapsed && conversations.length > 0 && (
                      <button
                        onClick={handleClearAll}
                        className="opacity-0 group-hover/header:opacity-100 transition-opacity text-error hover:text-error/80 px-1.5 py-0.5 rounded-lg hover:bg-error-container text-xs"
                        title="清空所有历史"
                      >
                        清空
                      </button>
                    )}
                  </div>

                  {!isHistoryCollapsed &&
                    (conversations.length === 0 ? (
                      <div className="text-xs text-on-surface-variant px-2 py-2">
                        暂无对话
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {conversations.map((conv) => (
                          <div
                            key={conv.id}
                            onClick={() => onConversationSelect?.(conv.id)}
                            className={[
                              'group flex items-center justify-between px-3 py-2 rounded-full',
                              'text-xs cursor-pointer transition-colors duration-200',
                              currentConversationId === conv.id
                                ? 'bg-primary-container text-on-primary-container'
                                : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface',
                            ].join(' ')}
                          >
                            {editingId === conv.id ? (
                              <Input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onBlur={() => handleSaveTitle(conv.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveTitle(conv.id)
                                  if (e.key === 'Escape') setEditingId(null)
                                }}
                                className="flex-1 min-w-0 py-0.5 text-xs"
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
                                  className="p-1 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary-container/50 mr-0.5"
                                  title="重命名"
                                >
                                  <PencilIcon className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={(e) => handleDeleteConversation(conv.id, e)}
                                className="p-1 rounded-lg text-error/70 hover:text-error hover:bg-error-container"
                                title="删除"
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}

          <a
            href="/all"
            target="_blank"
            rel="noopener noreferrer"
            className={[
              'mt-2 block w-full rounded-2xl border border-outline',
              'bg-surface-variant/70 px-4 py-3 text-left text-sm',
              'transition-all duration-200 hover:bg-surface-variant hover:shadow-sm',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-on-surface">嘟嘟可工具集</div>
                <div className="mt-1 text-xs text-on-surface-variant">
                  查看所有工具入口与使用教程
                </div>
              </div>
              <OpenExternalIcon className="w-4 h-4 shrink-0 text-on-surface-variant" />
            </div>
          </a>
        </nav>

        {/* Footer */}
        <div className="border-t border-outline p-3 space-y-1">
          <a
            href="https://github.com/1475505/Miliastra-toolbox"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-xl px-4 py-2.5 text-sm text-on-surface-variant transition-colors duration-200 hover:bg-surface-variant hover:text-on-surface"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
              <span>GitHub 仓库</span>
            </div>
            <div className="text-xs text-on-surface-variant mt-1 ml-7">欢迎 Star</div>
          </a>
          <a
            href="https://qm.qq.com/q/M1mCoQN8ki"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-xl px-4 py-2.5 text-sm text-on-surface-variant transition-colors duration-200 hover:bg-surface-variant hover:text-on-surface"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21.395 15.035a39.548 39.548 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a38.97 38.97 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673z" />
              </svg>
              <span>用户 QQ 群：1007538100</span>
            </div>
            <div className="text-xs text-on-surface-variant mt-1 ml-7">已接入机器人</div>
          </a>
          <div className="block w-full rounded-xl px-4 py-2.5 text-sm text-on-surface-variant">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 21a8 8 0 1 0-16 0" />
                <circle cx="12" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>作者 QQ：725230880</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
