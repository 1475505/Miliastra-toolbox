import { useState, useEffect } from 'react'
import { Share } from '../types'

export default function ShareComponent() {
  const [shares, setShares] = useState<Share[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    bilibili_url: '',
    gil_url: '',
  })

  const pageSize = 30

  const fetchShares = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      })
      if (search) params.append('title', search)

      const response = await fetch(`/api/v1/shares?${params}`)
      const data = await response.json()
      
      if (data.success) {
        setShares(data.data.items)
        setTotal(data.data.total)
      }
    } catch (err) {
      console.error('获取分享列表失败:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchShares()
  }, [page, search])

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      alert('标题不能为空')
      return
    }

    try {
      const response = await fetch('/api/v1/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const data = await response.json()

      if (data.success) {
        setShowForm(false)
        setFormData({ title: '', description: '', bilibili_url: '', gil_url: '' })
        setPage(1)
        fetchShares()
      }
    } catch (err) {
      console.error('创建分享失败:', err)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-200 p-6">
        <h2 className="text-2xl font-semibold mb-4">素材分享</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="搜索标题..."
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <button
            onClick={() => setShowForm(true)}
            className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            + 新建分享
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-center text-gray-400 mt-20">加载中...</div>
        ) : shares.length === 0 ? (
          <div className="text-center text-gray-400 mt-20">暂无分享</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">标题</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">描述</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 w-32">B站链接</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 w-32">GIL链接</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 w-40">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {shares.map((share) => (
                  <tr key={share.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{share.title}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {share.description || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {share.bilibili_url ? (
                        <a
                          href={share.bilibili_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          查看
                        </a>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {share.gil_url ? (
                        <a
                          href={share.gil_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          查看
                        </a>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">
                      {new Date(share.created_at).toLocaleString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="border-t border-gray-200 p-6">
          <div className="flex justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <span className="px-4 py-2 text-gray-600">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">新建分享</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-2">标题 *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-2">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-2">B站链接</label>
                <input
                  type="url"
                  value={formData.bilibili_url}
                  onChange={(e) => setFormData({ ...formData, bilibili_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-2">GIL链接</label>
                <input
                  type="url"
                  value={formData.gil_url}
                  onChange={(e) => setFormData({ ...formData, gil_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowForm(false)
                  setFormData({ title: '', description: '', bilibili_url: '', gil_url: '' })
                }}
                className="flex-1 px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
