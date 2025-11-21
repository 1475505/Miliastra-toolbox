import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Chat from './components/Chat'
import Share from './components/Share'
import Notes from './components/Notes'
import { Tab } from './types'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const [configVersion, setConfigVersion] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState<string>()
  const [conversationRefreshTrigger, setConversationRefreshTrigger] = useState(0)

  const handleConfigSaved = () => {
    setConfigVersion((v) => v + 1)
  }

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    setSidebarOpen(false) // Close sidebar on mobile after selecting tab
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
        onConfigSaved={handleConfigSaved}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        currentConversationId={currentConversationId}
        onConversationSelect={handleConversationSelect}
        onConversationDeleted={handleConversationDeleted}
        conversationRefreshTrigger={conversationRefreshTrigger}
      />
      <main className="flex-1 overflow-hidden border-l border-white/20 bg-white/35 backdrop-blur-xl relative">
        {/* Mobile hamburger button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white/80 backdrop-blur-sm rounded-lg shadow-lg text-slate-900"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className={`h-full ${activeTab === 'chat' ? '' : 'hidden'}`}>
          <Chat 
            configVersion={configVersion} 
            currentConversationId={currentConversationId}
            onConversationChange={setCurrentConversationId}
            onRefreshConversations={handleRefreshConversations}
          />
        </div>
        <div className={`h-full ${activeTab === 'notes' ? '' : 'hidden'}`}>
          <Notes />
        </div>
        <div className={`h-full ${activeTab === 'share' ? '' : 'hidden'}`}>
          <Share />
        </div>
      </main>
    </div>
  )
}
