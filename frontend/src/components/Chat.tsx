import { useState, useRef, useEffect } from 'react'
import { Message, Source } from '../types'
import { getConfig } from '../utils/config'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface SourceMessage {
  type: 'sources'
  sources: Source[]
  tokens?: number
}

type ChatMessage = Message | SourceMessage

interface ChatProps {
  configVersion: number
}

export default function Chat({ configVersion }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [displayMessages, setDisplayMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showConfigHint, setShowConfigHint] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastMessageTimeRef = useRef<number>(Date.now())

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [displayMessages])

  useEffect(() => {
    const config = getConfig()
    const needConfig = !config.use_default_model && !config.api_key
    setShowConfigHint(needConfig)
  }, [configVersion])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const config = getConfig()
    if (!config.use_default_model && !config.api_key) {
      setShowConfigHint(true)
      return
    }

    setShowConfigHint(false)
    const userMessage: Message = { role: 'user', content: input }
    setMessages((prev) => [...prev, userMessage])
    setDisplayMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)
    setError('')

    let hasCreatedAssistantMessage = false

    try {
      const contextMessages = messages.slice(-(config.context_length * 2))
      
      const response = await fetch('/api/v1/rag/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          conversation: contextMessages,
          config,
        }),
      })

      if (!response.ok) throw new Error('请求失败')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      
      lastMessageTimeRef.current = Date.now()
      
      const checkTimeout = setInterval(() => {
        if (Date.now() - lastMessageTimeRef.current > 5 * 60 * 1000) {
          clearInterval(checkTimeout)
          reader?.cancel()
          setError('连接超时（5分钟无响应）')
          setLoading(false)
        }
      }, 1000)

      while (reader) {
        const { done, value } = await reader.read()
        if (done) {
          clearInterval(checkTimeout)
          break
        }

        lastMessageTimeRef.current = Date.now()
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.type === 'sources') {
                // 先显示来源
                setDisplayMessages((prev) => [...prev, { type: 'sources', sources: data.data }])
              } else if (data.type === 'token') {
                // 第一个 token 时创建 assistant 消息
                if (!hasCreatedAssistantMessage) {
                  hasCreatedAssistantMessage = true
                  const assistantMessage: Message = { role: 'assistant', content: data.data }
                  setMessages((prev) => [...prev, assistantMessage])
                  setDisplayMessages((prev) => [...prev, assistantMessage])
                } else {
                  // 后续 token 追加内容
                  setMessages((prev) => {
                    const newMessages = [...prev]
                    const lastMsg = newMessages[newMessages.length - 1]
                    if (lastMsg && lastMsg.role === 'assistant') {
                      return [...prev.slice(0, -1), { ...lastMsg, content: lastMsg.content + data.data }]
                    }
                    return newMessages
                  })
                  setDisplayMessages((prev) => {
                    for (let i = prev.length - 1; i >= 0; i--) {
                      const msg = prev[i]
                      if ('role' in msg && msg.role === 'assistant') {
                        return [
                          ...prev.slice(0, i),
                          { ...msg, content: msg.content + data.data },
                          ...prev.slice(i + 1)
                        ]
                      }
                    }
                    return prev
                  })
                }
              } else if (data.type === 'done') {
                // 添加 tokens 到最后一个 sources 消息
                setDisplayMessages((prev) => {
                  const newMessages = [...prev]
                  for (let i = newMessages.length - 1; i >= 0; i--) {
                    const msg = newMessages[i]
                    if ('type' in msg && msg.type === 'sources') {
                      msg.tokens = data.data.tokens
                      break
                    }
                  }
                  return [...newMessages]
                })
              } else if (data.type === 'error') {
                setError(data.data)
              }
            } catch (e) {
              console.warn('解析 SSE 失败:', line)
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-200 p-6 pl-16 lg:pl-6">
        <h2 className="text-2xl font-semibold">知识库问答</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {displayMessages.length === 0 && (
          <div className="text-center text-slate-700 mt-20">
            <div className="text-lg font-medium">你好！我是千星知识库助手，请问有什么可以帮你的？</div>
            <div className="text-sm mt-2 text-slate-500">刷新页面将清空对话记录</div>
          </div>
        )}

        {showConfigHint && (
          <div className="text-center px-4">
            <div className="inline-block bg-yellow-50 border border-yellow-200 rounded-xl px-6 py-4 text-sm max-w-md">
              <div className="text-yellow-800 mb-2 font-medium">⚠️ 请先配置 API Key</div>
              <div className="text-yellow-600">
                请点击<span className="hidden lg:inline">左下角</span><span className="lg:hidden">菜单中</span>「⚙️ OpenAI 配置」按钮进行配置
              </div>
            </div>
          </div>
        )}

        {displayMessages.map((msg, idx) => {
          if ('type' in msg && msg.type === 'sources') {
            return (
              <div key={idx} className="flex justify-start">
                <div className="max-w-2xl px-4 py-3 rounded-2xl bg-blue-50 text-gray-900">
                  <div className="font-semibold mb-2 text-sm">📚 引用来源</div>
                  {msg.sources.map((src, i) => (
                    <div key={i} className="mb-2 pb-2 border-b border-blue-100 last:border-0">
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-medium text-sm"
                      >
                        {src.title}
                      </a>
                      <span className="text-gray-500 ml-2 text-xs">({Math.round(src.similarity * 100)}%)</span>
                      {src.text_snippet && (
                        <div className="text-gray-600 text-xs mt-1">
                          {src.text_snippet.substring(0, 100)}...
                        </div>
                      )}
                    </div>
                  ))}
                  {msg.tokens && msg.tokens > 0 && (
                    <div className="text-gray-500 text-xs mt-2">💬 消耗 tokens: {msg.tokens}</div>
                  )}
                </div>
              </div>
            )
          }
          
          return (
            <div
              key={idx}
              className={`flex ${'role' in msg && msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-2xl px-4 py-3 rounded-2xl ${
                  'role' in msg && msg.role === 'user'
                    ? 'bg-amber-50 text-slate-900 border border-amber-50'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {'role' in msg && msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap">{'content' in msg ? msg.content : ''}</div>
                ) : (
                  <div className="prose prose-sm max-w-none prose-slate">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {'content' in msg ? msg.content : ''}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {error && (
          <div className="text-center text-red-500 text-sm">{error}</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-200 p-6">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="输入你的问题..."
            disabled={loading}
            className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-300"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-6 py-3 bg-yellow-300 text-slate-900 rounded-xl hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
          >
            {loading ? '...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}
