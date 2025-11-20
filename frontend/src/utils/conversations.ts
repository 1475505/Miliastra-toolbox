import { Conversation, Message } from '../types'

const STORAGE_KEY = 'chat_conversations'

export function getAllConversations(): Conversation[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function getConversation(id: string): Conversation | null {
  const conversations = getAllConversations()
  return conversations.find(c => c.id === id) || null
}

export function saveConversation(conversation: Conversation): void {
  const conversations = getAllConversations()
  const index = conversations.findIndex(c => c.id === conversation.id)
  
  if (index >= 0) {
    conversations[index] = { ...conversation, updatedAt: Date.now() }
  } else {
    conversations.push(conversation)
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
}

export function updateConversationTitle(id: string, title: string): void {
  const conversations = getAllConversations()
  const index = conversations.findIndex(c => c.id === id)
  
  if (index >= 0) {
    conversations[index] = { ...conversations[index], title, updatedAt: Date.now() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
  }
}

export function deleteConversation(id: string): void {
  const conversations = getAllConversations()
  const filtered = conversations.filter(c => c.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
}

export function createNewConversation(): Conversation {
  const now = Date.now()
  return {
    id: `conv_${now}`,
    title: '新对话',
    messages: [],
    createdAt: now,
    updatedAt: now
  }
}

export function generateConversationTitle(messages: Message[]): string {
  const firstUserMessage = messages.find(m => m.role === 'user')
  if (!firstUserMessage) return '新对话'
  
  const content = firstUserMessage.content.trim()
  return content.length > 20 ? content.substring(0, 20) + '...' : content
}

export function downloadConversation(conversation: Conversation): void {
  let content = ''
  
  for (let i = 0; i < conversation.messages.length; i++) {
    const msg = conversation.messages[i]
    
    if ('type' in msg && msg.type === 'sources') {
      // 处理引用来源
      content += '[Sources]\n'
      msg.sources.forEach((src: any, idx: number) => {
        content += `${idx + 1}. ${src.title} (${Math.round(src.similarity * 100)}%)\n`
        content += `   ${src.url}\n`
        if (src.text_snippet) {
          content += `   ${src.text_snippet.substring(0, 100)}...\n`
        }
      })
      if (msg.tokens) {
        content += `   Tokens: ${msg.tokens}\n`
      }
      content += '\n'
    } else if ('role' in msg) {
      if (msg.role === 'user') {
        content += `Q. ${msg.content}\n\n`
      } else if (msg.role === 'assistant') {
        content += `A. ${msg.content}\n\n`
      }
    }
  }
  
  content += '=====\n'
  
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${conversation.title}_${new Date().toISOString().split('T')[0]}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
