export interface LLMConfig {
  api_key: string
  api_base_url: string
  model: string
  use_default_model: boolean
  context_length: number
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface Source {
  title: string
  doc_id: string
  similarity: number
  text_snippet: string
  url: string
}

export interface Note {
  id: number
  created_at: string
  version: string
  author?: string
  content: string
  likes: number
  img_url?: string
  video_url?: string
}

export interface Conversation {
  id: string
  title: string
  messages: any[] // ChatMessage[] - includes both ExtendedMessage and SourceMessage
  createdAt: number
  updatedAt: number
}

export type Tab = 'chat' | 'notes'
