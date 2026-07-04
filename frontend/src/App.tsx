import { useState, Suspense, lazy, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import IconButton from './components/ui/IconButton'
import { MenuIcon } from './components/ui/icons'
import { Tab } from './types'

const Chat = lazy(() => import('./components/Chat'))
const ToolCall = lazy(() => import('./components/ToolCall'))
const Notes = lazy(() => import('./components/Notes'))
const DataQuery = lazy(() => import('./components/DataQuery'))
const SvgDocs = lazy(() => import('./components/SvgDocs'))

const PATH_TO_TAB: Record<string, Tab> = {
  '/tool': 'tools',
  '/note': 'notes',
  '/data': 'data',
  '/svg': 'svg',
}

const TAB_TO_PATH: Record<Tab, string> = {
  chat: '/',
  tools: '/tool',
  notes: '/note',
  data: '/data',
  svg: '/svg',
}

function getTabFromPath(): Tab {
  const path = window.location.pathname
  if (path === '/svg' || path.startsWith('/svg/')) return 'svg'
  return PATH_TO_TAB[path] ?? 'chat'
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>(getTabFromPath)
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(new Set([getTabFromPath()]))
  const [configVersion, setConfigVersion] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState<string>()
  const [conversationRefreshTrigger, setConversationRefreshTrigger] = useState(0)

  useEffect(() => {
    const handlePopState = () => {
      const tab = getTabFromPath()
      setActiveTab(tab)
      setVisitedTabs((prev) => new Set(prev).add(tab))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const handleConfigSaved = () => {
    setConfigVersion((v) => v + 1)
  }

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    setVisitedTabs((prev) => new Set(prev).add(tab))
    setSidebarOpen(false) // Close sidebar on mobile after selecting tab
    window.history.pushState({}, '', TAB_TO_PATH[tab])
  }

  const handleConversationSelect = (id: string) => {
    setCurrentConversationId(id)
    setSidebarOpen(false)
  }

  const handleConversationDeleted = () => {
    setCurrentConversationId(undefined)
  }

  const handleRefreshConversations = () => {
    setConversationRefreshTrigger((v) => v + 1)
  }

  return (
    <div className="flex h-screen bg-transparent">
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={handleTabChange} 
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        currentConversationId={currentConversationId}
        onConversationSelect={handleConversationSelect}
        onConversationDeleted={handleConversationDeleted}
        conversationRefreshTrigger={conversationRefreshTrigger}
      />
      <main className="flex-1 overflow-hidden bg-surface/30 backdrop-blur-xl relative">
        {/* Mobile hamburger button */}
        <IconButton
          onClick={() => setSidebarOpen(!sidebarOpen)}
          label="Toggle menu"
          className="lg:hidden fixed top-2.5 left-3 z-50 bg-surface/80 backdrop-blur-sm shadow-sm"
        >
          <MenuIcon className="w-5 h-5" />
        </IconButton>
        <div className={`h-full ${activeTab === 'chat' ? '' : 'hidden'}`}>
          <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">加载中...</div>}>
            <Chat 
              configVersion={configVersion} 
              currentConversationId={currentConversationId}
              onConversationChange={setCurrentConversationId}
              onRefreshConversations={handleRefreshConversations}
              onConfigSaved={handleConfigSaved}
            />
          </Suspense>
        </div>
        {visitedTabs.has('tools') && (
          <div className={`h-full ${activeTab === 'tools' ? '' : 'hidden'}`}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">加载中...</div>}>
              <ToolCall />
            </Suspense>
          </div>
        )}
        {visitedTabs.has('notes') && (
          <div className={`h-full ${activeTab === 'notes' ? '' : 'hidden'}`}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">加载中...</div>}>
              <Notes />
            </Suspense>
          </div>
        )}
        {visitedTabs.has('data') && (
          <div className={`h-full ${activeTab === 'data' ? '' : 'hidden'}`}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">加载中...</div>}>
              <DataQuery />
            </Suspense>
          </div>
        )}
        {visitedTabs.has('svg') && (
          <div className={`h-full ${activeTab === 'svg' ? '' : 'hidden'}`}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">加载中...</div>}>
              <SvgDocs />
            </Suspense>
          </div>
        )}
      </main>
    </div>
  )
}
