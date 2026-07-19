import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Note } from '../types'
import PageHeader from './ui/PageHeader'
import Surface from './ui/Surface'
import Button from './ui/Button'
import Input from './ui/Input'
import Textarea from './ui/Textarea'
import Select from './ui/Select'
import Modal from './ui/Modal'
import {
  PlusIcon,
  SearchIcon,
  PencilIcon,
  HeartIcon,
  HeartFilledIcon,
  ImageIcon,
  OpenExternalIcon,
} from './ui/icons'

export default function Notes() {
  const { t } = useTranslation()
  const [notes, setNotes] = useState<Note[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [sortBy, setSortBy] = useState<'likes' | 'created_at'>('likes')
  const [page, setPage] = useState(1)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null)

  const limit = 50

  useEffect(() => {
    loadNotes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sortBy, page])

  useEffect(() => {
    const handler = setTimeout(() => {
      setSearch((prevSearch) => {
        if (prevSearch !== searchInput) {
          setPage(1)
          return searchInput
        }
        return prevSearch
      })
    }, 1000)

    return () => clearTimeout(handler)
  }, [searchInput])

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
      const data = (await response.json()) as {
        success: boolean
        data: { items: Note[]; total: number }
      }

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
    const likedNotes: number[] = JSON.parse(
      localStorage.getItem('likedNotes') || '[]'
    )

    if (likedNotes.includes(noteId)) {
      alert(t('notes.alreadyLiked'))
      return
    }

    try {
      const response = await fetch(`/api/v1/notes/${noteId}/like`, {
        method: 'POST',
      })
      const data = (await response.json()) as {
        success: boolean
        error?: string
      }

      if (data.success) {
        likedNotes.push(noteId)
        localStorage.setItem('likedNotes', JSON.stringify(likedNotes))
        loadNotes()
      } else {
        alert(data.error || t('notes.likeFailed'))
      }
    } catch (error) {
      console.error('点赞失败:', error)
      alert(t('notes.likeFailed'))
    }
  }

  const hasLiked = (noteId: number) => {
    const likedNotes: number[] = JSON.parse(
      localStorage.getItem('likedNotes') || '[]'
    )
    return likedNotes.includes(noteId)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t('notes.title')} />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {/* Toolbar */}
        <Surface className="mb-5 !p-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 flex-1">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                <Input
                  type="text"
                  placeholder={t('notes.searchPlaceholder')}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setSearch(searchInput)
                      setPage(1)
                    }
                  }}
                  onBlur={() => {
                    setSearch(searchInput)
                    setPage(1)
                  }}
                  className="pl-9"
                />
              </div>
              <Select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as 'likes' | 'created_at')
                  setPage(1)
                }}
                className="sm:w-44"
              >
                <option value="likes">{t('notes.sortByLikes')}</option>
                <option value="created_at">{t('notes.sortByCreated')}</option>
              </Select>
            </div>
            <Button onClick={() => setShowCreateModal(true)}>
              <PlusIcon className="w-4 h-4" />
              {t('notes.createNote')}
            </Button>
          </div>
          <div className="mt-3 text-sm text-on-surface-variant">
            {t('notes.totalNotes', { count: total })}
            {search && ` · ${t('notes.searchLabel', { search })}`}
          </div>
        </Surface>

        {/* Notes Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-on-surface-variant">{t('common.loading')}</div>
          </div>
        ) : notes.length === 0 ? (
          <Surface className="flex flex-col items-center justify-center h-64 text-on-surface-variant">
            <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
            <div>{t('notes.empty')}</div>
            {search && <div className="text-sm mt-2">{t('notes.tryOtherSearch')}</div>}
          </Surface>
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
                  onToggleExpand={() =>
                    setExpandedNoteId(
                      expandedNoteId === note.id ? null : note.id
                    )
                  }
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
                  className="px-3 py-1.5 rounded-full bg-surface border border-outline text-sm font-medium text-on-surface hover:bg-surface-variant disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  {t('notes.prevPage')}
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
                        className={[
                          'px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-200',
                          page === pageNum
                            ? 'bg-primary text-on-primary'
                            : 'bg-surface border border-outline text-on-surface hover:bg-surface-variant',
                        ].join(' ')}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-full bg-surface border border-outline text-sm font-medium text-on-surface hover:bg-surface-variant disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  {t('notes.nextPage')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

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

function NoteCard({
  note,
  isExpanded,
  isEditing,
  hasLiked,
  onToggleExpand,
  onLike,
  onEdit,
  onEditComplete,
  onEditCancel,
}: NoteCardProps) {
  const { t } = useTranslation()
  const [editContent, setEditContent] = useState(note.content)
  const [editAuthor, setEditAuthor] = useState(note.author || '')
  const [editImgUrl, setEditImgUrl] = useState(note.img_url || '')
  const [editVideoUrl, setEditVideoUrl] = useState(note.video_url || '')
  const [saving, setSaving] = useState(false)
  const [showImage, setShowImage] = useState(false)

  const handleSave = async () => {
    if (!editContent.trim()) {
      alert(t('notes.contentRequired'))
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
          img_url: editImgUrl || undefined,
          video_url: editVideoUrl || undefined,
        }),
      })

      const data = (await response.json()) as {
        success: boolean
        error?: string
      }
      if (data.success) {
        onEditComplete()
      } else {
        alert(data.error || t('notes.editFailed'))
      }
    } catch (error) {
      console.error('修改失败:', error)
      alert(t('notes.editFailed'))
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
      minute: '2-digit',
    })
  }

  const ensureProtocol = (url: string) => {
    if (!url) return ''
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }
    return `https://${url}`
  }

  const openImageInViewer = (url: string) => {
    if (!url) return
    const ensured = ensureProtocol(url)
    const w = window.open('', '_blank')
    if (!w) {
      window.open(ensured, '_blank', 'noopener,noreferrer')
      return
    }

    const encodedUrl = ensured.replace(/"/g, '&quot;')
    const imagePreviewTitle = t('notes.imagePreview')
    const html = `<!doctype html>
      <html lang="zh-CN">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${imagePreviewTitle}</title>
          <style>
            html,body{height:100%;margin:0;background:#111;color:#fff;display:flex;align-items:center;justify-content:center}
            img{max-width:100%;max-height:100%;object-fit:contain;box-shadow:0 0 20px rgba(0,0,0,0.5)}
            .wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
          </style>
        </head>
        <body>
          <div class="wrap">
          <img src="${encodedUrl}" alt="${imagePreviewTitle}"/>
          </div>
        </body>
      </html>`

    try {
      w.document.open()
      w.document.write(html)
      w.document.close()
    } catch (e) {
      console.error('Failed to write to new window', e)
      w.location.href = ensured
    }
  }

  return (
    <Surface className="flex flex-col !p-4">
      {isEditing ? (
        <>
          <div className="flex-1 space-y-3">
            <Input
              type="text"
              value={editAuthor}
              onChange={(e) => setEditAuthor(e.target.value)}
              placeholder={t('notes.authorOptional')}
            />
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder={t('notes.contentLabel')}
              rows={6}
            />
            <Input
              type="text"
              value={editImgUrl}
              onChange={(e) => setEditImgUrl(e.target.value)}
              placeholder={t('notes.imageLinkOptional')}
            />
            <Input
              type="text"
              value={editVideoUrl}
              onChange={(e) => setEditVideoUrl(e.target.value)}
              placeholder={t('notes.videoLinkOptional')}
            />
          </div>

          <div className="flex gap-2 mt-3">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1"
            >
              {saving ? t('notes.saving') : t('common.save')}
            </Button>
            <Button
              variant="outlined"
              onClick={onEditCancel}
              disabled={saving}
              className="flex-1"
            >
              {t('common.cancel')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1">
            <div
              className={[
                'text-on-surface text-sm leading-relaxed whitespace-pre-wrap cursor-pointer',
                !isExpanded ? 'line-clamp-4' : '',
              ].join(' ')}
              onClick={onToggleExpand}
            >
              {note.content}
            </div>

            {!isExpanded && (note.img_url || note.video_url) && (
              <div className="mt-2 flex gap-2">
                {note.img_url && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleExpand()
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-primary-container text-on-primary-container hover:bg-primary-container/80 transition-colors duration-200"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    {t('notes.hasImage')}
                  </button>
                )}
                {note.video_url && (
                  <a
                    href={ensureProtocol(note.video_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-secondary-container text-on-secondary-container hover:bg-secondary-container/80 transition-colors duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <OpenExternalIcon className="w-3.5 h-3.5" />
                    {t('notes.watchVideo')}
                  </a>
                )}
              </div>
            )}

            {isExpanded && (
              <div className="mt-3 space-y-3">
                {note.img_url && (
                  <div>
                    {!showImage ? (
                      <button
                        onClick={() => setShowImage(true)}
                        className="w-full py-8 border-2 border-dashed border-outline rounded-2xl text-on-surface-variant hover:border-primary hover:text-primary transition-colors duration-200 flex flex-col items-center gap-2"
                      >
                        <ImageIcon className="w-8 h-8" />
                        <span className="text-sm">{t('notes.clickToLoadImage')}</span>
                      </button>
                    ) : (
                      <div className="relative group">
                        <img
                          src={note.img_url}
                          alt={t('notes.noteImageAlt')}
                          className="w-full rounded-2xl cursor-pointer hover:opacity-95 transition-opacity duration-200"
                          onClick={(e) => {
                            e.stopPropagation()
                            openImageInViewer(note.img_url || '')
                          }}
                        />
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <button
                            onClick={() => setShowImage(false)}
                            className="bg-on-surface/60 text-surface p-1 rounded-full hover:bg-on-surface/80"
                            title={t('notes.hideImage')}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {note.video_url && (
                  <a
                    href={ensureProtocol(note.video_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-3 rounded-xl bg-secondary-container text-on-secondary-container hover:bg-secondary-container/80 transition-colors duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <OpenExternalIcon className="w-5 h-5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{t('notes.watchVideo')}</div>
                      <div className="text-xs text-on-secondary-container/70 truncate mt-0.5">
                        {note.video_url}
                      </div>
                    </div>
                  </a>
                )}
              </div>
            )}

            {note.content.length > 100 && (
              <button
                onClick={onToggleExpand}
                className="mt-2 text-xs text-primary hover:text-primary/80 font-medium transition-colors duration-200"
              >
                {isExpanded ? t('notes.collapse') : t('notes.expandFull')}
              </button>
            )}
          </div>

          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-outline text-xs text-on-surface-variant space-y-1">
              {note.author && <div>{t('notes.authorLabel', { author: note.author })}</div>}
              <div>{t('notes.createdLabel', { date: formatDate(note.created_at) })}</div>
              {note.version !== note.created_at && (
                <div>{t('notes.updatedLabel', { date: formatDate(note.version) })}</div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-outline">
            <button
              onClick={onLike}
              disabled={hasLiked}
              className={[
                'flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-200',
                hasLiked
                  ? 'bg-error-container text-error cursor-not-allowed'
                  : 'bg-surface-variant text-on-surface-variant hover:bg-error-container hover:text-error',
              ].join(' ')}
              title={hasLiked ? t('notes.liked') : t('notes.like')}
            >
              {hasLiked ? (
                <HeartFilledIcon className="w-4 h-4" />
              ) : (
                <HeartIcon className="w-4 h-4" />
              )}
              <span>{note.likes}</span>
            </button>

            <Button variant="outlined" size="sm" onClick={onEdit}>
              <PencilIcon className="w-3.5 h-3.5" />
              {t('notes.edit')}
            </Button>

            {!isExpanded && note.author && (
              <div className="ml-auto text-xs text-on-surface-variant">
                {note.author}
              </div>
            )}
          </div>
        </>
      )}
    </Surface>
  )
}

interface CreateNoteModalProps {
  onClose: () => void
  onSuccess: () => void
}

function CreateNoteModal({ onClose, onSuccess }: CreateNoteModalProps) {
  const { t } = useTranslation()
  const [author, setAuthor] = useState('')
  const [content, setContent] = useState('')
  const [imgUrl, setImgUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!content.trim()) {
      alert(t('notes.contentRequired'))
      return
    }

    setCreating(true)
    try {
      const response = await fetch('/api/v1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: author || undefined,
          content: content,
          img_url: imgUrl || undefined,
          video_url: videoUrl || undefined,
        }),
      })

      const data = (await response.json()) as {
        success: boolean
        error?: string
      }
      if (data.success) {
        onSuccess()
      } else {
        alert(data.error || t('notes.createFailed'))
      }
    } catch (error) {
      console.error('创建失败:', error)
      alert(t('notes.createFailed'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('notes.createNote')}
      footer={
        <>
          <Button
            variant="outlined"
            onClick={onClose}
            disabled={creating}
            className="flex-1"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating}
            className="flex-1"
          >
            {creating ? t('notes.creating') : t('notes.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-on-surface mb-2">
            {t('notes.authorOptional')}
          </label>
          <Input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder={t('notes.authorPlaceholder')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-on-surface mb-2">
            {t('notes.contentLabel')} <span className="text-error">*</span>
          </label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('notes.contentPlaceholder')}
            rows={8}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-on-surface mb-2">
            {t('notes.imageLinkOptional')}
          </label>
          <Input
            type="text"
            value={imgUrl}
            onChange={(e) => setImgUrl(e.target.value)}
            placeholder={t('notes.imagePlaceholder')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-on-surface mb-2">
            {t('notes.videoLinkOptional')}
          </label>
          <Input
            type="text"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder={t('notes.videoPlaceholder')}
          />
        </div>
      </div>
    </Modal>
  )
}
