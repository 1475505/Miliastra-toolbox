import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {
  type ChatMessage,
  type ExtendedMessage,
  type Message,
  type SourceMessage,
  type ToolCallMessage,
  type ToolTrace,
} from '../types'
import { getConfig } from '../utils/config'
import ConfigModal from './ConfigModal'
import {
  createNewConversation,
  saveConversation,
  getConversation,
  generateConversationTitle,
  downloadConversation,
} from '../utils/conversations'
import PageHeader from './ui/PageHeader'
import Button from './ui/Button'
import Surface from './ui/Surface'
import Textarea from './ui/Textarea'
import {
  DownloadIcon,
  PlusIcon,
  ImageIcon,
  SettingsIcon,
  SendIcon,
} from './ui/icons'

interface ConversationTurn {
  key: string
  user?: ExtendedMessage
  assistant?: ExtendedMessage
  toolTraces: ToolCallMessage[]
  sources: SourceMessage[]
}

function buildConversationTurns(chatMessages: ChatMessage[]): ConversationTurn[] {
  const turns: ConversationTurn[] = []

  const ensureTurn = () => {
    const currentTurn = turns[turns.length - 1]
    if (currentTurn) {
      return currentTurn
    }

    const nextTurn: ConversationTurn = {
      key: `turn_${turns.length}`,
      toolTraces: [],
      sources: [],
    }
    turns.push(nextTurn)
    return nextTurn
  }

  chatMessages.forEach((msg, index) => {
    if ('role' in msg && msg.role === 'user') {
      turns.push({
        key: `turn_${index}`,
        user: msg,
        toolTraces: [],
        sources: [],
      })
      return
    }

    const currentTurn = ensureTurn()

    if ('role' in msg && msg.role === 'assistant') {
      if (currentTurn.assistant) {
        turns.push({
          key: `turn_${index}`,
          assistant: msg,
          toolTraces: [],
          sources: [],
        })
        return
      }

      currentTurn.assistant = msg
      return
    }

    if ('type' in msg && msg.type === 'tool_trace') {
      currentTurn.toolTraces.push(msg)
      return
    }

    if ('type' in msg && msg.type === 'sources') {
      currentTurn.sources.push(msg)
    }
  })

  return turns.filter(
    (turn) =>
      turn.user ||
      turn.assistant ||
      turn.toolTraces.length > 0 ||
      turn.sources.length > 0
  )
}

function getLatestToolStats(
  toolTraces: ToolCallMessage[]
): ToolCallMessage['stats'] {
  for (let index = toolTraces.length - 1; index >= 0; index--) {
    if (toolTraces[index].stats) {
      return toolTraces[index].stats
    }
  }
  return undefined
}

function getLatestSourceTokens(
  sourceMessages: SourceMessage[]
): number | undefined {
  for (let index = sourceMessages.length - 1; index >= 0; index--) {
    if (sourceMessages[index].tokens) {
      return sourceMessages[index].tokens
    }
  }
  return undefined
}

interface ChatProps {
  configVersion: number
  currentConversationId?: string
  onConversationChange?: (id: string) => void
  onRefreshConversations?: () => void
  onConfigSaved?: () => void
}

export default function Chat({
  configVersion,
  currentConversationId,
  onConversationChange,
  onRefreshConversations,
  onConfigSaved,
}: ChatProps) {
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
  const [images, setImages] = useState<{ base64: string; info: string }[]>([])
  const [agentMode, setAgentMode] = useState(true)
  const [showConfig, setShowConfig] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastMessageTimeRef = useRef<number>(Date.now())
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const conversationTurns = buildConversationTurns(displayMessages)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 160)}px`
    }
  }, [input])

  useEffect(() => {
    if (currentConversationId) {
      const conv = getConversation(currentConversationId)
      if (conv) {
        setConversationId(conv.id)
        const userAssistantMessages = conv.messages.filter(
          (m: ChatMessage) => 'role' in m
        ) as ExtendedMessage[]
        setMessages(userAssistantMessages)
        setDisplayMessages(conv.messages as ChatMessage[])
      }
    } else if (!conversationId) {
      const newConv = createNewConversation()
      setConversationId(newConv.id)
      setMessages([])
      setDisplayMessages([])
      onConversationChange?.(newConv.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConversationId])

  useEffect(() => {
    if (conversationId && messages.length > 0) {
      const title = generateConversationTitle(messages)
      saveConversation({
        id: conversationId,
        title,
        messages: displayMessages,
        createdAt: parseInt(conversationId.split('_')[1]) || Date.now(),
        updatedAt: Date.now(),
      })
    }
  }, [messages, conversationId, displayMessages])

  const MAX_IMAGE_SIZE = 1024 * 1024

  const compressImageToBase64 = (
    file: File
  ): Promise<{ base64: string; info: string }> => {
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

  const addImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件')
      return
    }

    try {
      setError('')
      const { base64, info } = await compressImageToBase64(file)
      setImages((prev) => [...prev, { base64, info }])
    } catch (e) {
      setError(e instanceof Error ? e.message : '图片处理失败')
    }
  }

  const handleImageFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach((file) => addImage(file))
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const clearImages = () => {
    setImages([])
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    const imageFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile()
        if (file) {
          imageFiles.push(file)
        }
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault()
      imageFiles.forEach((file) => addImage(file))
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
      downloadConversation({
        id: conversationId,
        title,
        messages: displayMessages,
        createdAt: parseInt(conversationId.split('_')[1]) || Date.now(),
        updatedAt: Date.now(),
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

  useEffect(() => {
    fetch('/NOTICE.md')
      .then((response) => response.text())
      .then((text) => setNoticeContent(text))
      .catch((err) => console.warn('Failed to load NOTICE.md:', err))
  }, [])

  const handleSend = async () => {
    if ((!input.trim() && images.length === 0) || loading) return

    const config = getConfig()
    if (!config.use_default_model && !config.api_key) {
      setShowConfigHint(true)
      return
    }

    setShowConfigHint(false)
    const imageBase64s = images.map((img) => img.base64)
    const messageText = input.trim() || (imageBase64s.length > 0 ? '[图片提问]' : '')
    const userMessage: Message = {
      role: 'user',
      content: messageText,
      imageBase64s: imageBase64s.length > 0 ? imageBase64s : undefined,
    }
    setMessages((prev) => [...prev, userMessage])
    setDisplayMessages((prev) => [...prev, userMessage])
    setInput('')
    clearImages()
    setLoading(true)
    setError('')
    setTimeoutWarning('')
    setStatusMessage('')

    let hasCreatedAssistantMessage = false

    try {
      const contextMessages = messages.slice(-(config.context_length * 2))

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 20 * 60 * 1000)

      const apiUrl = agentMode
        ? '/api/v1/agent/chat/stream'
        : '/api/v1/rag/chat/stream'
      const requestBody = {
        message: messageText,
        conversation: contextMessages,
        config,
        image_base64s: imageBase64s.length > 0 ? imageBase64s : undefined,
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        let errorDetail = `请求失败（HTTP ${response.status}）`
        try {
          const errorText = await response.text()
          if (errorText) errorDetail = `${errorDetail}: ${errorText}`
        } catch {
          // 忽略读取响应体失败
        }
        throw new Error(errorDetail)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      lastMessageTimeRef.current = Date.now()
      let hasShownWarning = false

      const checkTimeout = setInterval(() => {
        const elapsedTime = Date.now() - lastMessageTimeRef.current

        if (elapsedTime > 5 * 60 * 1000 && !hasShownWarning) {
          hasShownWarning = true
          setTimeoutWarning(
            '已5分钟无响应，可能问题过于复杂。建议调小上下文轮次、使用非推理模型、或在新标签页开启新对话'
          )
        }

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
                if (!agentMode) {
                  setDisplayMessages((prev) => [
                    ...prev,
                    { type: 'sources', sources: data.data },
                  ])
                }
              } else if (data.type === 'tool_call') {
                const trace: ToolTrace = {
                  tool: data.data.tool,
                  args: data.data.args,
                  status: 'success',
                  summary: '调用中...',
                }
                setDisplayMessages((prev) => {
                  for (let i = prev.length - 1; i >= 0; i--) {
                    const m = prev[i]
                    if ('type' in m && m.type === 'tool_trace') {
                      return [
                        ...prev.slice(0, i),
                        { ...m, traces: [...m.traces, trace] },
                        ...prev.slice(i + 1),
                      ]
                    }
                    if ('role' in m && m.role === 'user') break
                  }
                  return [...prev, { type: 'tool_trace', traces: [trace] }]
                })
                setStatusMessage(`正在调用工具: ${data.data.tool}...`)
              } else if (data.type === 'tool_result') {
                setDisplayMessages((prev) => {
                  for (let i = prev.length - 1; i >= 0; i--) {
                    const m = prev[i]
                    if ('type' in m && m.type === 'tool_trace') {
                      const traces = [...m.traces]
                      for (let j = traces.length - 1; j >= 0; j--) {
                        if (traces[j].tool === data.data.tool) {
                          traces[j] = {
                            ...traces[j],
                            status: data.data.status,
                            summary: data.data.summary,
                            sources: data.data.sources,
                          }
                          break
                        }
                      }
                      return [
                        ...prev.slice(0, i),
                        { ...m, traces },
                        ...prev.slice(i + 1),
                      ]
                    }
                  }
                  return prev
                })
                setStatusMessage('')
              } else if (data.type === 'status') {
                setStatusMessage(data.data.message || data.data)
              } else if (data.type === 'reasoning') {
                if (!hasCreatedAssistantMessage) {
                  hasCreatedAssistantMessage = true
                  const assistantMessage: ExtendedMessage = {
                    role: 'assistant',
                    content: '',
                    reasoning: data.data,
                    isReasoning: true,
                  }
                  setMessages((prev) => [...prev, assistantMessage])
                  setDisplayMessages((prev) => [...prev, assistantMessage])
                } else {
                  const updateMsg = (prev: ExtendedMessage[]) => {
                    const newMessages = [...prev]
                    const lastMsg = newMessages[newMessages.length - 1]
                    if (lastMsg && lastMsg.role === 'assistant') {
                      return [
                        ...prev.slice(0, -1),
                        {
                          ...lastMsg,
                          reasoning: (lastMsg.reasoning || '') + data.data,
                          isReasoning: true,
                        },
                      ]
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
                            isReasoning: true,
                          },
                          ...prev.slice(i + 1),
                        ]
                      }
                    }
                    return prev
                  })
                }
              } else if (data.type === 'token') {
                if (!hasCreatedAssistantMessage) {
                  hasCreatedAssistantMessage = true
                  const assistantMessage: ExtendedMessage = {
                    role: 'assistant',
                    content: data.data,
                  }
                  setMessages((prev) => [...prev, assistantMessage])
                  setDisplayMessages((prev) => [...prev, assistantMessage])
                } else {
                  setMessages((prev) => {
                    const newMessages = [...prev]
                    const lastMsg = newMessages[newMessages.length - 1]
                    if (lastMsg && lastMsg.role === 'assistant') {
                      return [
                        ...prev.slice(0, -1),
                        {
                          ...lastMsg,
                          content: lastMsg.content + data.data,
                          isReasoning: false,
                        },
                      ]
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
                            isReasoning: false,
                          },
                          ...prev.slice(i + 1),
                        ]
                      }
                    }
                    return prev
                  })
                }
              } else if (data.type === 'done') {
                setStatusMessage('')
                setDisplayMessages((prev) => {
                  const newMessages = [...prev]
                  for (let i = newMessages.length - 1; i >= 0; i--) {
                    const msg = newMessages[i]
                    if ('type' in msg && msg.type === 'tool_trace') {
                      ;(msg as ToolCallMessage).stats =
                        data.data.stats || data.data
                      break
                    }
                    if ('type' in msg && msg.type === 'sources') {
                      ;(msg as SourceMessage).tokens = data.data.tokens
                      break
                    }
                  }
                  return [...newMessages]
                })
              } else if (data.type === 'error') {
                setError(data.data)
              }
            } catch {
              console.warn('解析 SSE 失败:', line)
            }
          }
        }
      }
    } catch (err) {
      console.error('对话流异常:', err)
      const detail =
        err instanceof Error
          ? err.message || '网络错误'
          : '网络错误'
      setError(
        `连接异常：${detail}。若反复出现，可能是模型已达限额或配置有误，请检查 LLM 配置`
      )
    } finally {
      setLoading(false)
      setStatusMessage('')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="知识库问答">
        {messages.length > 0 && (
          <Button
            variant="outlined"
            size="sm"
            onClick={handleDownload}
            title="下载对话为纯文本"
          >
            <DownloadIcon className="w-4 h-4" />
            <span className="hidden sm:inline">下载</span>
          </Button>
        )}
        <Button variant="tonal" size="sm" onClick={handleNewConversation}>
          <PlusIcon className="w-4 h-4" />
          新对话
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
        {displayMessages.length === 0 && (
          <div className="text-center text-on-surface mt-16 lg:mt-20">
            <div className="text-lg font-medium">
              你好！我是千星知识库助手，请问有什么可以帮你的？
            </div>
            <div className="text-sm mt-2 text-on-surface-variant">
              对话将自动保存到浏览器本地，建议及时删除
            </div>
            <div className="text-sm mt-1 text-on-surface-variant">
              在菜单左下角按需减少上下文轮次可加快生成速度
            </div>
            {noticeContent.trim() && (
              <Surface className="mt-8 max-w-2xl mx-auto text-left">
                <div className="prose prose-sm max-w-none prose-slate">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {noticeContent}
                  </ReactMarkdown>
                </div>
              </Surface>
            )}
          </div>
        )}

        {showConfigHint && (
          <div className="text-center px-4">
            <div className="inline-block bg-emerald-50 border border-emerald-200 rounded-xl px-6 py-4 text-sm max-w-md">
              <div className="text-emerald-800 mb-2 font-medium">
                请先配置 API Key
              </div>
              <div className="text-emerald-600">
                请点击下方「LLM 配置」按钮进行配置（或勾选免费模型）
              </div>
            </div>
          </div>
        )}

        {conversationTurns.map((turn) => {
          const turnStats = getLatestToolStats(turn.toolTraces)
          const sourceTokens = getLatestSourceTokens(turn.sources)

          return (
            <div key={turn.key} className="space-y-3">
              {turn.user && (
                <div className="flex justify-end">
                  <div className="max-w-3xl px-4 py-3 rounded-2xl bg-emerald-50 text-slate-900 border border-emerald-100">
                    <div className="whitespace-pre-wrap">
                      {(turn.user.imageBase64s && turn.user.imageBase64s.length > 0
                        ? turn.user.imageBase64s
                        : turn.user.imageBase64
                        ? [turn.user.imageBase64]
                        : []
                      ).map((src, idx) => (
                        <div key={`${src.slice(0, 32)}_${idx}`} className="mb-2">
                          <img
                            src={src}
                            alt="用户上传的图片"
                            className="max-w-full h-auto rounded-xl border border-white/20"
                            style={{ maxHeight: '300px' }}
                          />
                        </div>
                      ))}
                      {turn.user.content}
                    </div>
                  </div>
                </div>
              )}

              {turn.toolTraces.length > 0 && (
                <div className="flex justify-start">
                  <div className="max-w-4xl px-4 py-3 rounded-2xl bg-violet-50 text-gray-900">
                    <details open className="group">
                      <summary className="flex cursor-pointer items-center justify-between gap-3 select-none list-none">
                        <div className="font-semibold text-sm text-violet-800">工具调用</div>
                        {turnStats && (
                          <div className="flex gap-3 text-gray-500 text-xs">
                            <span>{turnStats.tokens} tokens</span>
                            <span>{turnStats.tool_calls} 次工具</span>
                            <span>{turnStats.retrieval_calls} 次检索</span>
                          </div>
                        )}
                      </summary>
                      <div className="mt-2 space-y-1.5">
                        {turn.toolTraces
                          .flatMap((toolMessage) => toolMessage.traces)
                          .map((trace, index) => (
                            <div
                              key={`${trace.tool}_${index}`}
                              className="pb-1.5 border-b border-violet-100 last:border-0"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                                    trace.status === 'success'
                                      ? 'bg-green-500'
                                      : trace.status === 'error'
                                      ? 'bg-red-500'
                                      : 'bg-emerald-400'
                                  }`}
                                />
                                <span className="font-medium text-sm text-violet-800">
                                  {trace.tool}
                                </span>
                                <span
                                  className={`text-xs ${
                                    trace.status === 'success'
                                      ? 'text-green-600'
                                      : trace.status === 'error'
                                      ? 'text-red-600'
                                      : 'text-emerald-600'
                                  }`}
                                >
                                  {trace.status === 'success'
                                    ? '成功'
                                    : trace.status === 'error'
                                    ? '失败'
                                    : '进行中'}
                                </span>
                              </div>
                              {trace.args && Object.keys(trace.args).length > 0 && (
                                <div className="text-gray-500 text-xs mt-1 font-mono bg-violet-100/50 rounded-lg px-2 py-1">
                                  {Object.entries(trace.args)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(', ')}
                                </div>
                              )}
                              <div className="text-gray-600 text-xs mt-1">
                                {trace.summary}
                              </div>
                              {trace.sources && trace.sources.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                  {trace.sources.map((src, si) => (
                                    <a
                                      key={`${src.url}_${si}`}
                                      href={src.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 hover:underline bg-violet-100/60 rounded-lg px-1.5 py-0.5"
                                    >
                                      {src.title}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </details>
                  </div>
                </div>
              )}

              {turn.assistant && (
                <div className="flex justify-start">
                  <div className="max-w-4xl px-4 py-3 rounded-2xl bg-slate-100 text-slate-900">
                    <div className="prose prose-sm max-w-none prose-slate">
                      {turn.assistant.reasoning && (
                        <details
                          className="mb-4 border border-gray-200 rounded-lg bg-white overflow-hidden"
                          open={turn.assistant.isReasoning}
                        >
                          <summary className="px-4 py-2 bg-gray-50 cursor-pointer text-xs font-medium text-gray-500 hover:bg-gray-100 select-none flex items-center">
                            <span>思考过程</span>
                          </summary>
                          <div className="px-4 py-3 text-gray-600 text-sm bg-gray-50/50 whitespace-pre-wrap border-t border-gray-100">
                            {turn.assistant.reasoning}
                          </div>
                        </details>
                      )}
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {turn.assistant.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}

              {turn.sources.length > 0 && (
                <div className="flex justify-start">
                  <div className="max-w-4xl px-4 py-3 rounded-2xl bg-blue-50 text-gray-900">
                    <div className="font-semibold mb-2 text-sm">引用来源</div>
                    {turn.sources
                      .flatMap((sourceMessage) => sourceMessage.sources)
                      .map((src, index) => (
                        <div
                          key={`${src.url}_${index}`}
                          className="mb-2 pb-2 border-b border-blue-100 last:border-0"
                        >
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-medium text-sm"
                          >
                            {src.title}
                          </a>
                          <span className="text-gray-500 ml-2 text-xs">
                            ({Math.round(src.similarity * 100)}%)
                          </span>
                          {src.text_snippet && (
                            <div className="text-gray-600 text-xs mt-1">
                              {src.text_snippet.substring(0, 100)}...
                            </div>
                          )}
                        </div>
                      ))}
                    {sourceTokens && sourceTokens > 0 && (
                      <div className="text-gray-500 text-xs mt-2">
                        消耗 tokens: {sourceTokens}
                      </div>
                    )}
                  </div>
                </div>
              )}
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
            <div className="inline-block bg-emerald-50 border border-emerald-200 rounded-xl px-6 py-4 text-sm max-w-2xl">
              <div className="text-emerald-800 mb-2 font-medium">响应较慢</div>
              <div className="text-emerald-600">{timeoutWarning}</div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start px-4">
            <div className="max-w-4xl px-4 py-3 rounded-2xl bg-red-50 text-red-700 border border-red-100 text-sm">
              {error}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-outline bg-surface/70 backdrop-blur-md p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <label
              className={[
                'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer select-none rounded-full border transition-colors duration-200',
                agentMode
                  ? 'border-primary bg-primary-container text-on-primary-container'
                  : 'border-outline bg-surface text-on-surface-variant hover:border-primary',
              ].join(' ')}
              title="启用高智商模式，使用工具调用进行深度问答"
            >
              <span className={agentMode ? 'font-medium' : ''}>高智商</span>
              <button
                type="button"
                role="switch"
                aria-checked={agentMode}
                onClick={() => setAgentMode(!agentMode)}
                className={[
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200',
                  agentMode ? 'bg-primary' : 'bg-outline',
                ].join(' ')}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-on-primary transition-transform duration-200 ${
                    agentMode ? 'translate-x-[1.125rem]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>

            <div className="relative group">
              <label
                className="flex items-center gap-1.5 px-3 py-2 border border-outline rounded-full bg-surface text-sm text-on-surface-variant cursor-pointer hover:border-primary hover:text-primary transition-colors duration-200"
                aria-label="仅部分支持多模态的模型支持图片输入"
              >
                <ImageIcon className="w-4 h-4" />
                <span>图片</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleImageFiles(e.target.files)}
                  disabled={loading}
                />
              </label>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-on-surface text-surface text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap pointer-events-none z-50">
                仅部分支持多模态的模型支持图片输入
              </div>
            </div>

            <Button
              variant="outlined"
              size="sm"
              onClick={() => setShowConfig(true)}
              title="LLM 配置"
            >
              <SettingsIcon className="w-4 h-4" />
              LLM 配置
            </Button>
          </div>

          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              onPaste={handlePaste}
              placeholder="输入问题 / 粘贴图片；AI 回答仅供参考，以官方文档为准"
              disabled={loading}
              rows={1}
              className="flex-1 min-w-0 py-2.5"
              style={{ minHeight: '40px', maxHeight: '160px' }}
            />
            <Button
              onClick={handleSend}
              disabled={loading || (!input.trim() && images.length === 0)}
              size="md"
              className="shrink-0"
            >
              {loading ? '…' : <SendIcon className="w-4 h-4" />}
              <span className="hidden sm:inline">
                {loading ? '发送中' : '发送'}
              </span>
            </Button>
          </div>

          {images.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {images.map((img, idx) => (
                <div
                  key={`${img.base64.slice(0, 32)}_${idx}`}
                  className="flex items-center gap-2 bg-surface border border-outline rounded-xl px-2 py-1"
                >
                  <img
                    src={img.base64}
                    alt={`已选择的图片 ${idx + 1}`}
                    className="w-16 h-16 object-cover rounded-lg border border-outline"
                  />
                  <div className="text-xs text-on-surface-variant">
                    <div>{img.info || '大小信息计算中...'}</div>
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="mt-1 text-xs text-error hover:underline"
                      disabled={loading}
                    >
                      移除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="text-center text-xs text-on-surface-variant mt-2">
          千星奇域官方文档和相关信息版权归米哈游所有，本网站为个人兴趣，与米哈游无关
        </div>
      </div>
      {showConfig && (
        <ConfigModal
          onClose={() => setShowConfig(false)}
          onConfigSaved={onConfigSaved}
        />
      )}
    </div>
  )
}
