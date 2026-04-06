import { useState, useRef, useEffect } from 'react'
import { Message, Source, ToolTrace } from '../types'
import { getConfig } from '../utils/config'
import { 
  createNewConversation, 
  saveConversation, 
  getConversation, 
  generateConversationTitle,
  downloadConversation 
} from '../utils/conversations'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface SourceMessage {
  type: 'sources'
  sources: Source[]
  tokens?: number
}

interface ToolCallMessage {
  type: 'tool_trace'
  traces: ToolTrace[]
  stats?: { tokens: number; tool_calls: number; retrieval_calls: number }
}

interface ExtendedMessage extends Message {
  reasoning?: string
  isReasoning?: boolean
}

type ChatMessage = ExtendedMessage | SourceMessage | ToolCallMessage

interface ChatProps {
  configVersion: number
  currentConversationId?: string
  onConversationChange?: (id: string) => void
  onRefreshConversations?: () => void
}

export default function Chat({ configVersion, currentConversationId, onConversationChange, onRefreshConversations }: ChatProps) {
  const [conversationId, setConversationId] = useState<string>('')
  const [messages, setMessages] = useState<ExtendedMessage[]>([])
  const [displayMessages, setDisplayMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [timeoutWarning, setTimeoutWarning] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [showConfigHint, setShowConfigHint] = useState(false)
  const [noticeContent, setNoticeContent] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageInfo, setImageInfo] = useState<string>('')
  const [agentMode, setAgentMode] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastMessageTimeRef = useRef<number>(Date.now())

  // 初始化或加载对话
  useEffect(() => {
    if (currentConversationId) {
      const conv = getConversation(currentConversationId)
      if (conv) {
        setConversationId(conv.id)
        // 分离 messages 和 displayMessages
        const userAssistantMessages = conv.messages.filter((m: any) => 'role' in m) as ExtendedMessage[]
        setMessages(userAssistantMessages)
        setDisplayMessages(conv.messages as ChatMessage[])
      }
    } else if (!conversationId) {
      // 创建新对话
      const newConv = createNewConversation()
      setConversationId(newConv.id)
      setMessages([])
      setDisplayMessages([])
      onConversationChange?.(newConv.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConversationId])

  // 保存对话到 localStorage
  useEffect(() => {
    if (conversationId && messages.length > 0) {
      const title = generateConversationTitle(messages)
      // 重新排序：将 Sources/ToolTrace 移到对应的 A 后面
      const reorderedMessages: ChatMessage[] = []
      let pendingSources: ChatMessage[] = []
      
      displayMessages.forEach((msg) => {
        if ('type' in msg && (msg.type === 'sources' || msg.type === 'tool_trace')) {
          pendingSources.push(msg)
        } else if ('role' in msg) {
          // 如果是用户消息，先把之前的 sources 放进去（处理已保存过的对话中 sources 在 assistant 后的情况）
          if (msg.role === 'user' && pendingSources.length > 0) {
            reorderedMessages.push(...pendingSources)
            pendingSources = []
          }

          reorderedMessages.push(msg)

          // 如果是助手消息，把 sources 放到后面（处理新生成的对话中 sources 在 assistant 前的情况）
          if (msg.role === 'assistant' && pendingSources.length > 0) {
            reorderedMessages.push(...pendingSources)
            pendingSources = []
          }
        }
      })
      
      // 处理末尾的 sources
      if (pendingSources.length > 0) {
        reorderedMessages.push(...pendingSources)
      }
      
      saveConversation({
        id: conversationId,
        title,
        messages: reorderedMessages,
        createdAt: parseInt(conversationId.split('_')[1]) || Date.now(),
        updatedAt: Date.now()
      })
    }
  }, [messages, conversationId, displayMessages])

  const MAX_IMAGE_SIZE = 1024 * 1024 // 1MB

  const compressImageToBase64 = (file: File): Promise<{ base64: string; info: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('Canvas 不支持'))
            return
          }

          let { width, height } = img
          const maxDimension = 1280
          if (width > maxDimension || height > maxDimension) {
            const ratio = Math.min(maxDimension / width, maxDimension / height)
            width = Math.round(width * ratio)
            height = Math.round(height * ratio)
          }

          canvas.width = width
          canvas.height = height
          ctx.drawImage(img, 0, 0, width, height)

          let quality = 0.9
          let base64 = canvas.toDataURL('image/jpeg', quality)

          // 如仍然大于 1MB，逐步降低质量
          while (base64.length * 0.75 > MAX_IMAGE_SIZE && quality > 0.3) {
            quality -= 0.1
            base64 = canvas.toDataURL('image/jpeg', quality)
          }

          const sizeKB = Math.round((base64.length * 0.75) / 1024)
          if (base64.length * 0.75 > MAX_IMAGE_SIZE) {
            reject(new Error('图片压缩后仍大于 1MB，请选择更小的图片'))
          } else {
            resolve({ base64, info: `已压缩至约 ${sizeKB} KB` })
          }
        }
        img.onerror = () => reject(new Error('图片加载失败'))
        img.src = reader.result as string
      }
      reader.onerror = () => reject(new Error('读取图片失败'))
      reader.readAsDataURL(file)
    })
  }

  const handleImageChange = async (file: File | null) => {
    if (!file) {
      setImagePreview(null)
      setImageBase64(null)
      setImageInfo('')
      return
    }

    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件')
      return
    }

    try {
      setError('')
      setImageInfo('正在压缩图片...')
      const { base64, info } = await compressImageToBase64(file)
      setImagePreview(base64)
      setImageBase64(base64)
      setImageInfo(info)
    } catch (e) {
      setImagePreview(null)
      setImageBase64(null)
      setImageInfo('')
      setError(e instanceof Error ? e.message : '图片处理失败')
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile()
        if (file) {
          e.preventDefault()
          handleImageChange(file)
          return
        }
      }
    }
  }

  const handleNewConversation = () => {
    const newConv = createNewConversation()
    setConversationId(newConv.id)
    setMessages([])
    setDisplayMessages([])
    onConversationChange?.(newConv.id)
    onRefreshConversations?.()
  }

  const handleDownload = () => {
    if (conversationId && messages.length > 0) {
      const title = generateConversationTitle(messages)
      // 重新排序：将 Sources/ToolTrace 移到对应的 A 后面
      const reorderedMessages: ChatMessage[] = []
      let pendingSources: ChatMessage[] = []
      
      displayMessages.forEach((msg) => {
        if ('type' in msg && (msg.type === 'sources' || msg.type === 'tool_trace')) {
          pendingSources.push(msg)
        } else if ('role' in msg) {
          // 如果是用户消息，先把之前的 sources 放进去
          if (msg.role === 'user' && pendingSources.length > 0) {
            reorderedMessages.push(...pendingSources)
            pendingSources = []
          }

          reorderedMessages.push(msg)

          // 如果是助手消息，把 sources 放到后面
          if (msg.role === 'assistant' && pendingSources.length > 0) {
            reorderedMessages.push(...pendingSources)
            pendingSources = []
          }
        }
      })
      
      // 处理末尾的 sources
      if (pendingSources.length > 0) {
        reorderedMessages.push(...pendingSources)
      }
      
      downloadConversation({
        id: conversationId,
        title,
        messages: reorderedMessages,
        createdAt: parseInt(conversationId.split('_')[1]) || Date.now(),
        updatedAt: Date.now()
      })
    }
  }

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

  // 加载公告内容
  useEffect(() => {
    fetch('/NOTICE.md')
      .then(response => response.text())
      .then(text => setNoticeContent(text))
      .catch(err => console.warn('Failed to load NOTICE.md:', err))
  }, [])

  const handleSend = async () => {
    if ((!input.trim() && !imageBase64) || loading) return

    const config = getConfig()
    if (!config.use_default_model && !config.api_key) {
      setShowConfigHint(true)
      return
    }

    setShowConfigHint(false)
    const userMessage: Message = { 
      role: 'user', 
      content: input || (imageBase64 ? '[图片提问]' : ''),
      imageBase64: imageBase64 || undefined,
    }
    setMessages((prev) => [...prev, userMessage])
    setDisplayMessages((prev) => [...prev, userMessage])
    setInput('')
    setImagePreview(null)
    setImageBase64(null)
    setImageInfo('')
    setLoading(true)
    setError('')
    setTimeoutWarning('')
    setStatusMessage('')

    let hasCreatedAssistantMessage = false

    try {
      const contextMessages = messages.slice(-(config.context_length * 2))
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 20 * 60 * 1000) // 20分钟超时
      
      const apiUrl = agentMode ? '/api/v1/agent/chat/stream' : '/api/v1/rag/chat/stream'
      const requestBody = agentMode
        ? { message: input, conversation: contextMessages, config }
        : { message: input, conversation: contextMessages, config, image_base64: imageBase64 }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) throw new Error('请求失败')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      
      lastMessageTimeRef.current = Date.now()
      let hasShownWarning = false
      
      const checkTimeout = setInterval(() => {
        const elapsedTime = Date.now() - lastMessageTimeRef.current
        
        // 5分钟无响应：显示警告
        if (elapsedTime > 5 * 60 * 1000 && !hasShownWarning) {
          hasShownWarning = true
          setTimeoutWarning('已5分钟无响应，可能问题过于复杂。建议调小上下文轮次、使用非推理模型、或在新标签页开启新对话')
        }
        
        // 20分钟无响应：报错并停止
        if (elapsedTime > 20 * 60 * 1000) {
          clearInterval(checkTimeout)
          reader?.cancel()
          setError('连接超时（20分钟无响应）')
          setTimeoutWarning('')
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
          if (line.startsWith(':')) {
            const status = line.slice(1).trim()
            switch (status) {
              case 'connected':
                setStatusMessage('已连接，准备中...')
                break
              case 'chat_engine_created':
                setStatusMessage('对话引擎已就绪，正在检索知识库...')
                break
              case 'retrieval_done':
                setStatusMessage('检索完成，正在生成回答...')
                break
              case 'sources_sent':
                setStatusMessage('已获取引用来源...')
                break
              case 'generating':
                setStatusMessage('正在生成回答...')
                break
              case 'heartbeat':
                setStatusMessage('正在深入思考中，请耐心等待...')
                break
              case 'completed':
                setStatusMessage('')
                break
            }
            continue
          }

          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.type === 'sources') {
                if (agentMode) {
                  // Agent 模式下忽略 sources 事件（信息已在 tool_trace 中）
                } else {
                  setDisplayMessages((prev) => [...prev, { type: 'sources', sources: data.data }])
                }
              } else if (data.type === 'tool_call') {
                // Agent: 工具调用开始
                const trace: ToolTrace = { tool: data.data.tool, args: data.data.args, status: 'success', summary: '调用中...' }
                setDisplayMessages((prev) => {
                  // 找到最后一个 tool_trace 消息并追加，否则新建
                  for (let i = prev.length - 1; i >= 0; i--) {
                    const m = prev[i]
                    if ('type' in m && m.type === 'tool_trace') {
                      return [...prev.slice(0, i), { ...m, traces: [...m.traces, trace] }, ...prev.slice(i + 1)]
                    }
                    if ('role' in m && m.role === 'user') break
                  }
                  return [...prev, { type: 'tool_trace', traces: [trace] }]
                })
                setStatusMessage(`正在调用工具: ${data.data.tool}...`)
              } else if (data.type === 'tool_result') {
                // Agent: 工具调用结果
                setDisplayMessages((prev) => {
                  for (let i = prev.length - 1; i >= 0; i--) {
                    const m = prev[i]
                    if ('type' in m && m.type === 'tool_trace') {
                      const traces = [...m.traces]
                      for (let j = traces.length - 1; j >= 0; j--) {
                        if (traces[j].tool === data.data.tool) {
                          traces[j] = { ...traces[j], status: data.data.status, summary: data.data.summary, sources: data.data.sources }
                          break
                        }
                      }
                      return [...prev.slice(0, i), { ...m, traces }, ...prev.slice(i + 1)]
                    }
                  }
                  return prev
                })
                setStatusMessage('')
              } else if (data.type === 'status') {
                // Agent: 状态更新
                setStatusMessage(data.data.message || data.data)
              } else if (data.type === 'reasoning') {
                // 处理推理内容
                if (!hasCreatedAssistantMessage) {
                  hasCreatedAssistantMessage = true
                  const assistantMessage: ExtendedMessage = { 
                    role: 'assistant', 
                    content: '', 
                    reasoning: data.data,
                    isReasoning: true 
                  }
                  setMessages((prev) => [...prev, assistantMessage])
                  setDisplayMessages((prev) => [...prev, assistantMessage])
                } else {
                  // 追加推理内容
                  const updateMsg = (prev: ExtendedMessage[]) => {
                    const newMessages = [...prev]
                    const lastMsg = newMessages[newMessages.length - 1]
                    if (lastMsg && lastMsg.role === 'assistant') {
                      return [...prev.slice(0, -1), { 
                        ...lastMsg, 
                        reasoning: (lastMsg.reasoning || '') + data.data,
                        isReasoning: true
                      }]
                    }
                    return newMessages
                  }
                  setMessages(updateMsg)
                  setDisplayMessages((prev) => {
                    for (let i = prev.length - 1; i >= 0; i--) {
                      const msg = prev[i]
                      if ('role' in msg && msg.role === 'assistant') {
                        return [
                          ...prev.slice(0, i),
                          { 
                            ...msg, 
                            reasoning: (msg.reasoning || '') + data.data,
                            isReasoning: true
                          },
                          ...prev.slice(i + 1)
                        ]
                      }
                    }
                    return prev
                  })
                }
              } else if (data.type === 'token') {
                // 第一个 token 时创建 assistant 消息
                if (!hasCreatedAssistantMessage) {
                  hasCreatedAssistantMessage = true
                  const assistantMessage: ExtendedMessage = { role: 'assistant', content: data.data }
                  setMessages((prev) => [...prev, assistantMessage])
                  setDisplayMessages((prev) => [...prev, assistantMessage])
                } else {
                  // 后续 token 追加内容
                  setMessages((prev) => {
                    const newMessages = [...prev]
                    const lastMsg = newMessages[newMessages.length - 1]
                    if (lastMsg && lastMsg.role === 'assistant') {
                      return [...prev.slice(0, -1), { 
                        ...lastMsg, 
                        content: lastMsg.content + data.data,
                        isReasoning: false 
                      }]
                    }
                    return newMessages
                  })
                  setDisplayMessages((prev) => {
                    for (let i = prev.length - 1; i >= 0; i--) {
                      const msg = prev[i]
                      if ('role' in msg && msg.role === 'assistant') {
                        return [
                          ...prev.slice(0, i),
                          { 
                            ...msg, 
                            content: msg.content + data.data,
                            isReasoning: false 
                          },
                          ...prev.slice(i + 1)
                        ]
                      }
                    }
                    return prev
                  })
                }
              } else if (data.type === 'done') {
                setStatusMessage('')
                // 添加统计信息到最后一个 sources 或 tool_trace 消息
                setDisplayMessages((prev) => {
                  const newMessages = [...prev]
                  for (let i = newMessages.length - 1; i >= 0; i--) {
                    const msg = newMessages[i]
                    if ('type' in msg && msg.type === 'tool_trace') {
                      (msg as ToolCallMessage).stats = data.data.stats || data.data
                      break
                    }
                    if ('type' in msg && msg.type === 'sources') {
                      (msg as SourceMessage).tokens = data.data.tokens
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
      setStatusMessage('')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-200 p-6 pl-16 lg:pl-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">知识库问答</h2>
        <div className="flex gap-2">
          {messages.length > 0 && (
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors text-blue-700 font-medium"
              title="下载对话为纯文本"
            >
              💾 下载对话
            </button>
          )}
          <button
            onClick={handleNewConversation}
            className="px-3 py-1.5 text-sm bg-yellow-100 hover:bg-yellow-200 rounded-lg transition-colors font-medium"
          >
            ✨ 新对话
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {displayMessages.length === 0 && (
          <div className="text-center text-slate-700 mt-20">
            <div className="text-lg font-medium">你好！我是千星知识库助手，请问有什么可以帮你的？</div>
            <div className="text-sm mt-2 text-slate-500">对话将自动保存到浏览器本地，建议及时删除</div>
            <div className="text-sm mt-2 text-slate-500">在菜单左下角按需减少上下文轮次可加快生成速度</div>
            {noticeContent.trim() && (
              <div className="mt-8 max-w-2xl mx-auto bg-green-50 border border-green-200 rounded-xl p-6 text-left">
                <div className="prose prose-sm max-w-none prose-slate">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {noticeContent}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}

        {showConfigHint && (
          <div className="text-center px-4">
            <div className="inline-block bg-yellow-50 border border-yellow-200 rounded-xl px-6 py-4 text-sm max-w-md">
              <div className="text-yellow-800 mb-2 font-medium">⚠️ 请先配置 API Key</div>
              <div className="text-yellow-600">
                请点击<span className="hidden lg:inline">左下角</span><span className="lg:hidden">菜单中</span>「⚙️ OpenAI 配置」按钮进行配置（或勾选免费模型）
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

          if ('type' in msg && msg.type === 'tool_trace') {
            return (
              <div key={idx} className="flex justify-start">
                <div className="max-w-2xl px-4 py-3 rounded-2xl bg-violet-50 text-gray-900">
                  <div className="font-semibold mb-2 text-sm">🔧 工具调用</div>
                  {msg.traces.map((trace, i) => (
                    <div key={i} className="mb-2 pb-2 border-b border-violet-100 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                          trace.status === 'success' ? 'bg-green-500' : trace.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                        }`} />
                        <span className="font-medium text-sm text-violet-800">{trace.tool}</span>
                        <span className={`text-xs ${trace.status === 'success' ? 'text-green-600' : trace.status === 'error' ? 'text-red-600' : 'text-yellow-600'}`}>
                          {trace.status === 'success' ? '✓' : trace.status === 'error' ? '✗' : '⏳'}
                        </span>
                      </div>
                      {trace.args && Object.keys(trace.args).length > 0 && (
                        <div className="text-gray-500 text-xs mt-1 font-mono bg-violet-100/50 rounded px-2 py-1">
                          {Object.entries(trace.args).map(([k, v]) => `${k}: ${v}`).join(', ')}
                        </div>
                      )}
                      <div className="text-gray-600 text-xs mt-1">{trace.summary}</div>
                      {trace.sources && trace.sources.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {trace.sources.map((src, si) => (
                            <a
                              key={si}
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 hover:underline bg-violet-100/60 rounded px-1.5 py-0.5"
                            >
                              📄 {src.title}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {msg.stats && (
                    <div className="text-gray-500 text-xs mt-2 flex gap-3">
                      <span>💬 tokens: {msg.stats.tokens}</span>
                      <span>🔧 工具调用: {msg.stats.tool_calls}次</span>
                      <span>🔍 检索: {msg.stats.retrieval_calls}次</span>
                    </div>
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
                  <div className="whitespace-pre-wrap">
                    {'imageBase64' in msg && msg.imageBase64 && (
                      <div className="mb-2">
                        <img 
                          src={msg.imageBase64} 
                          alt="用户上传的图片" 
                          className="max-w-full h-auto rounded-lg border border-white/20"
                          style={{ maxHeight: '300px' }}
                        />
                      </div>
                    )}
                    {'content' in msg ? msg.content : ''}
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none prose-slate">
                    {'reasoning' in msg && msg.reasoning && (
                      <details 
                        className="mb-4 border border-gray-200 rounded-lg bg-white overflow-hidden"
                        open={msg.isReasoning}
                      >
                        <summary className="px-4 py-2 bg-gray-50 cursor-pointer text-xs font-medium text-gray-500 hover:bg-gray-100 select-none flex items-center">
                          <span>💭 思考过程</span>
                        </summary>
                        <div className="px-4 py-3 text-gray-600 text-sm bg-gray-50/50 whitespace-pre-wrap border-t border-gray-100">
                          {msg.reasoning}
                        </div>
                      </details>
                    )}
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {'content' in msg ? msg.content : ''}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {statusMessage && (
          <div className="text-center px-4">
            <div className="inline-block bg-blue-50 border border-blue-200 rounded-xl px-6 py-3 text-sm text-blue-700 animate-pulse">
              {statusMessage}
            </div>
          </div>
        )}

        {timeoutWarning && (
          <div className="text-center px-4">
            <div className="inline-block bg-orange-50 border border-orange-200 rounded-xl px-6 py-4 text-sm max-w-2xl">
              <div className="text-orange-800 mb-2 font-medium">⏱️ 响应较慢</div>
              <div className="text-orange-600">{timeoutWarning}</div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center text-red-500 text-sm">{error}</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-200 p-6">
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 items-center">
            <label
              className={`flex items-center gap-1.5 px-3 py-3 text-sm cursor-pointer select-none rounded-xl border transition-colors ${
                agentMode
                  ? 'border-violet-300 bg-violet-50 text-violet-700'
                  : 'border-gray-300 bg-white/60 text-gray-500 hover:border-violet-300'
              }`}
              title="启用高智商模式，使用工具调用进行深度问答"
            >
              <span className={agentMode ? 'font-medium' : ''}>🧠 高智商</span>
              <button
                type="button"
                role="switch"
                aria-checked={agentMode}
                onClick={() => setAgentMode(!agentMode)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  agentMode ? 'bg-violet-500' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  agentMode ? 'translate-x-[1.125rem]' : 'translate-x-0.5'
                }`} />
              </button>
            </label>
            <label className="px-3 py-3 border border-dashed border-gray-300 rounded-xl bg-white/60 text-sm text-gray-600 cursor-pointer hover:border-yellow-400 hover:bg-white">
              <span>📷 图片</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImageChange(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                disabled={loading}
              />
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              onPaste={handlePaste}
              placeholder="输入问题/粘贴图片；AI回答可能有误，仅供参考，以提供的官方文档为准"
              disabled={loading}
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-300"
            />
            <button
              onClick={handleSend}
              disabled={loading || (!input.trim() && !imageBase64)}
              className="px-6 py-3 bg-yellow-300 text-slate-900 rounded-xl hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
            >
              {loading ? '...' : '发送'}
            </button>
          </div>
          {imagePreview && (
            <div className="flex items-center gap-3">
              <img
                src={imagePreview}
                alt="已选择的图片"
                className="w-16 h-16 object-cover rounded-lg border border-gray-200"
              />
              <div className="flex-1 text-xs text-gray-600">
                <div>已附带图片发送（{imageInfo || '大小信息计算中...'}）</div>
                <button
                  type="button"
                  onClick={() => handleImageChange(null)}
                  className="mt-1 text-xs text-red-500 hover:underline"
                  disabled={loading}
                >
                  移除图片
                </button>
              </div>
            </div>
          )}
          {!imagePreview && imageInfo && (
            <div className="text-xs text-gray-500">{imageInfo}</div>
          )}
        </div>
        <div className="text-center text-xs text-gray-500 mt-3">
          千星奇域官方文档和相关信息版权归米哈游所有，本网站为个人兴趣，与米哈游无关
        </div>
      </div>
    </div>
  )
}
