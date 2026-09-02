import { ChatMessage, Conversation, Message } from '../types'

export interface ShareRecord {
  id: string
  kind: 'share' | 'async_task'
  status: 'ready' | 'pending' | 'completed' | 'error'
  title: string
  messages: ChatMessage[] | null
  error: string | null
}

export interface ShareCreateResult {
  id: string
  url: string
}

/** 剥离消息中的 base64 图片，替换为 imageCount 占位，避免上传大体积数据 */
function stripImages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((msg) => {
    if (!('role' in msg) || msg.role !== 'user') return msg
    const count =
      msg.imageBase64s?.length || (msg.imageBase64 ? 1 : 0)
    if (count === 0) return msg
    const { imageBase64: _single, imageBase64s: _multi, ...rest } = msg as Message & ChatMessage
    return { ...rest, imageCount: count } as ChatMessage
  })
}

export async function createShare(conversation: Conversation): Promise<ShareCreateResult> {
  const response = await fetch('/api/v1/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: conversation.title,
      messages: stripImages(conversation.messages),
    }),
  })
  if (!response.ok) {
    throw new Error(`Share request failed: ${response.status}`)
  }
  return response.json()
}

export async function fetchShare(id: string): Promise<ShareRecord | null> {
  const response = await fetch(`/api/v1/share/${id}`)
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Fetch share failed: ${response.status}`)
  }
  return response.json()
}
