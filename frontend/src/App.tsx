import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Chat from './components/Chat'
import Share from './components/Share'
import Tools from './components/Tools'
import { Tab } from './types'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const [configVersion, setConfigVersion] = useState(0)

  const handleConfigSaved = () => {
    setConfigVersion((v) => v + 1)
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onConfigSaved={handleConfigSaved} />
      <main className="flex-1 overflow-hidden">
        <div className={`h-full ${activeTab === 'chat' ? '' : 'hidden'}`}>
          <Chat configVersion={configVersion} />
        </div>
        <div className={`h-full ${activeTab === 'share' ? '' : 'hidden'}`}>
          <Share />
        </div>
        <div className={`h-full ${activeTab === 'tools' ? '' : 'hidden'}`}>
          <Tools />
        </div>
      </main>
    </div>
  )
}
