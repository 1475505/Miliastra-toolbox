export interface LLMConfig {
  api_key: string
  api_base_url: string
  model: string
  use_default_model: number
  context_length: number
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  imageBase64?: string
  imageBase64s?: string[]
}

export interface Source {
  title: string
  doc_id: string
  similarity: number
  text_snippet: string
  url: string
}

export interface ToolTrace {
  tool: string
  args: Record<string, string | number | boolean>
  status: 'success' | 'error'
  summary: string
  sources?: { title: string; url: string }[]
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

export interface SourceMessage {
  type: 'sources'
  sources: Source[]
  tokens?: number
}

export interface ToolCallMessage {
  type: 'tool_trace'
  traces: ToolTrace[]
  stats?: { tokens: number; tool_calls: number; retrieval_calls: number }
}

export interface ExtendedMessage extends Message {
  reasoning?: string
  isReasoning?: boolean
}

export type ChatMessage = ExtendedMessage | SourceMessage | ToolCallMessage

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export type Tab = 'chat' | 'tools' | 'notes' | 'data' | 'svg'

export interface COSConfig {
  useDefault: boolean
}

