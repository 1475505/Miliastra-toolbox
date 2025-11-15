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

export interface Share {
  id: number
  created_at: string
  title: string
  description?: string
  bilibili_url?: string
  gil_url?: string
}

export type Tab = 'chat' | 'share' | 'tools'
