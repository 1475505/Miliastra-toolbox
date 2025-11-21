import { useState, useEffect } from 'react'
import { Note } from '../types'

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'likes' | 'created_at'>('likes')
  const [page, setPage] = useState(1)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null)
  
  const limit = 50

  useEffect(() => {
    loadNotes()
  }, [search, sortBy, page])

  const loadNotes = async () => {
    setLoading(true)
    try {
      const offset = (page - 1) * limit
      const params = new URLSearchParams({
        sort_by: sortBy,
        limit: limit.toString(),
        offset: offset.toString(),
      })
      if (search) params.append('search', search)

      const response = await fetch(`/api/v1/notes?${params}`)
      const data = await response.json()
      
      if (data.success) {
        setNotes(data.data.items)
        setTotal(data.data.total)
      }
    } catch (error) {
      console.error('加载笔记失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLike = async (noteId: number) => {
    // 检查本地存储是否已点赞
    const likedNotes = JSON.parse(localStorage.getItem('likedNotes') || '[]')
    
    if (likedNotes.includes(noteId)) {
      alert('您已经为该笔记点过赞了')
      return
    }

    try {
      const response = await fetch(`/api/v1/notes/${noteId}/like`, {
        method: 'POST',
      })
      const data = await response.json()
      
      if (data.success) {
        // 记录到本地存储
        likedNotes.push(noteId)
        localStorage.setItem('likedNotes', JSON.stringify(likedNotes))
        
        // 更新列表
        loadNotes()
      } else {
        alert(data.error || '点赞失败')
      }
    } catch (error) {
      console.error('点赞失败:', error)
      alert('点赞失败')
    }
  }

  const hasLiked = (noteId: number) => {
    const likedNotes = JSON.parse(localStorage.getItem('likedNotes') || '[]')
    return likedNotes.includes(noteId)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/30 bg-white/20 p-4 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <h2 className="text-xl lg:text-2xl font-bold text-slate-900">笔记</h2>
          
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {/* 搜索框 */}
            <input
              type="text"
              placeholder="搜索笔记内容或作者..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="px-4 py-2 rounded-xl border border-white/50 bg-white/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
            />
            
            {/* 排序选择 */}
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as 'likes' | 'created_at')
                setPage(1)
              }}
              className="px-4 py-2 rounded-xl border border-white/50 bg-white/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
            >
              <option value="likes">按点赞数排序</option>
              <option value="created_at">按创建时间排序</option>
            </select>
            
            {/* 新增按钮 */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors text-sm whitespace-nowrap"
            >
              ✏️ 新增笔记
            </button>
          </div>
        </div>
        
        {/* 统计信息 */}
        <div className="mt-3 text-sm text-slate-600">
          共 {total} 条笔记
          {search && ` · 搜索: "${search}"`}
        </div>
      </div>

      {/* Notes Grid */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-slate-500">加载中...</div>
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <div className="text-4xl mb-2">📝</div>
            <div>暂无笔记</div>
            {search && <div className="text-sm mt-2">试试其他搜索词</div>}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  isExpanded={expandedNoteId === note.id}
                  isEditing={editingNoteId === note.id}
                  hasLiked={hasLiked(note.id)}
                  onToggleExpand={() => setExpandedNoteId(expandedNoteId === note.id ? null : note.id)}
                  onLike={() => handleLike(note.id)}
                  onEdit={() => setEditingNoteId(note.id)}
                  onEditComplete={() => {
                    setEditingNoteId(null)
                    loadNotes()
                  }}
                  onEditCancel={() => setEditingNoteId(null)}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg bg-white/50 text-sm font-medium text-slate-700 hover:bg-white/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  上一页
                </button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (page <= 3) {
                      pageNum = i + 1
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = page - 2 + i
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          page === pageNum
                            ? 'bg-blue-500 text-white'
                            : 'bg-white/50 text-slate-700 hover:bg-white/70'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>
                
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg bg-white/50 text-sm font-medium text-slate-700 hover:bg-white/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateNoteModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            setPage(1)
            loadNotes()
          }}
        />
      )}
    </div>
  )
}

interface NoteCardProps {
  note: Note
  isExpanded: boolean
  isEditing: boolean
  hasLiked: boolean
  onToggleExpand: () => void
  onLike: () => void
  onEdit: () => void
  onEditComplete: () => void
  onEditCancel: () => void
}

function NoteCard({ note, isExpanded, isEditing, hasLiked, onToggleExpand, onLike, onEdit, onEditComplete, onEditCancel }: NoteCardProps) {
  const [editContent, setEditContent] = useState(note.content)
  const [editAuthor, setEditAuthor] = useState(note.author || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!editContent.trim()) {
      alert('笔记内容不能为空')
      return
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/v1/notes/${note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editContent,
          author: editAuthor || undefined,
        }),
      })
      
      const data = await response.json()
      if (data.success) {
        onEditComplete()
      } else {
        alert(data.error || '修改失败')
      }
    } catch (error) {
      console.error('修改失败:', error)
      alert('修改失败')
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', { 
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg hover:shadow-xl transition-all p-4 flex flex-col">
      {isEditing ? (
        <>
          {/* 编辑模式 */}
          <div className="flex-1 space-y-3">
            <input
              type="text"
              value={editAuthor}
              onChange={(e) => setEditAuthor(e.target.value)}
              placeholder="作者（可选）"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white/80 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="笔记内容"
              rows={6}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white/80 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm resize-none"
            />
          </div>
          
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors text-sm"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={onEditCancel}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-slate-300 text-slate-700 font-medium hover:bg-slate-400 disabled:opacity-50 transition-colors text-sm"
            >
              取消
            </button>
          </div>
        </>
      ) : (
        <>
          {/* 显示模式 */}
          <div className="flex-1">
            <div 
              className={`text-slate-800 text-sm leading-relaxed whitespace-pre-wrap cursor-pointer ${
                !isExpanded ? 'line-clamp-4' : ''
              }`}
              onClick={onToggleExpand}
            >
              {note.content}
            </div>
            
            {note.content.length > 100 && (
              <button
                onClick={onToggleExpand}
                className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                {isExpanded ? '收起' : '展开全文'}
              </button>
            )}
          </div>
          
          {/* 作者和时间 */}
          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500 space-y-1">
              {note.author && <div>👤 作者: {note.author}</div>}
              <div>📅 创建: {formatDate(note.created_at)}</div>
              {note.version !== note.created_at && (
                <div>🔄 更新: {formatDate(note.version)}</div>
              )}
            </div>
          )}
          
          {/* 操作按钮 */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200">
            <button
              onClick={onLike}
              disabled={hasLiked}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                hasLiked
                  ? 'bg-red-100 text-red-600 cursor-not-allowed'
                  : 'bg-white/80 text-slate-700 hover:bg-red-50 hover:text-red-600'
              }`}
              title={hasLiked ? '已点赞' : '点赞'}
            >
              <span className="text-base">{hasLiked ? '❤️' : '🤍'}</span>
              <span>{note.likes}</span>
            </button>
            
            <button
              onClick={onEdit}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/80 text-slate-700 hover:bg-blue-50 hover:text-blue-600 text-sm font-medium transition-colors"
            >
              <span>✏️</span>
              <span>修改</span>
            </button>
            
            {!isExpanded && note.author && (
              <div className="ml-auto text-xs text-slate-500">
                👤 {note.author}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

interface CreateNoteModalProps {
  onClose: () => void
  onSuccess: () => void
}

function CreateNoteModal({ onClose, onSuccess }: CreateNoteModalProps) {
  const [author, setAuthor] = useState('')
  const [content, setContent] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!content.trim()) {
      alert('笔记内容不能为空')
      return
    }

    setCreating(true)
    try {
      const response = await fetch(`/api/v1/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: author || undefined,
          content: content,
        }),
      })
      
      const data = await response.json()
      if (data.success) {
        onSuccess()
      } else {
        alert(data.error || '创建失败')
      }
    } catch (error) {
      console.error('创建失败:', error)
      alert('创建失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl max-w-2xl w-full p-6">
        <h3 className="text-xl font-bold text-slate-900 mb-4">新增笔记</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              作者（可选）
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="输入作者名称"
              className="w-full px-4 py-2 rounded-xl border border-slate-300 bg-white/80 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              笔记内容 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="输入笔记内容..."
              rows={8}
              className="w-full px-4 py-2 rounded-xl border border-slate-300 bg-white/80 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>
        </div>
        
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex-1 px-6 py-3 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {creating ? '创建中...' : '创建'}
          </button>
          <button
            onClick={onClose}
            disabled={creating}
            className="flex-1 px-6 py-3 rounded-xl bg-slate-300 text-slate-700 font-medium hover:bg-slate-400 disabled:opacity-50 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
