import { useState, useEffect, useCallback } from 'react'
import { getCOSConfig, saveCOSConfig } from '../utils/cosConfig'
import { COSConfig } from '../types'

export default function ImageUploader() {
  const [config, setConfig] = useState<COSConfig>(getCOSConfig())
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ url: string; markdown: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.items) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const item = e.clipboardData.items[i]
          if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile()
            if (blob) {
              handleFileSelect(blob)
            }
          }
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile)
    setFileName(selectedFile.name)
    setResult(null)
    setError(null)
    
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string)
    }
    reader.readAsDataURL(selectedFile)
  }

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }, [])

  const handleUpload = async () => {
    if (!config.useDefault) {
      setError('请勾选使用默认配置以进行上传')
      return
    }

    if (!file) {
      setError('请选择文件')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      // 使用用户输入的文件名，如果用户修改了的话
      // 创建一个新的 File 对象以使用新的文件名
      const uploadFile = new File([file], fileName, { type: file.type })
      formData.append('file', uploadFile)

      const response = await fetch('/api/v1/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || '上传失败')
      }

      const data = await response.json()
      setResult(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message || '上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">图床上传</h2>
        <div className="flex items-center">
          <label className="flex items-center space-x-2 cursor-pointer text-sm text-slate-600 bg-white/50 px-3 py-2 rounded-lg hover:bg-white/80 transition-colors">
            <input 
              type="checkbox" 
              checked={config.useDefault} 
              onChange={(e) => {
                  const newConfig = { useDefault: e.target.checked }
                  setConfig(newConfig)
                  saveCOSConfig(newConfig)
              }}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>使用默认配置（请按需使用）</span>
          </label>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-6">
        <div
          className={`flex-1 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center p-8 transition-all ${
            dragActive
              ? 'border-blue-500 bg-blue-50/50'
              : 'border-slate-300 hover:border-blue-400 bg-white/30'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {previewUrl ? (
            <div className="relative w-full h-full flex flex-col items-center justify-center">
              <img
                src={previewUrl}
                alt="Preview"
                className="max-h-[60vh] object-contain rounded-lg shadow-lg mb-4"
              />
              <button
                onClick={() => {
                  setFile(null)
                  setPreviewUrl(null)
                  setResult(null)
                }}
                className="absolute top-0 right-0 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-md transform translate-x-1/2 -translate-y-1/2"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-6xl mb-4">📤</div>
              <p className="text-xl text-slate-600 mb-2">点击选择或拖拽图片到这里</p>
              <p className="text-sm text-slate-400">支持 Ctrl+V 粘贴</p>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files && e.target.files[0] && handleFileSelect(e.target.files[0])}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          )}
        </div>

        {file && !result && (
          <div className="bg-white/60 p-6 rounded-2xl backdrop-blur-sm border border-white/40 shadow-sm">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">文件名</label>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="w-full px-3 py-2 bg-white/50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className={`px-8 py-2 rounded-lg text-white font-medium transition-all ${
                  uploading
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/30'
                }`}
              >
                {uploading ? '上传中...' : '开始上传'}
              </button>
            </div>
            {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
          </div>
        )}

        {result && (
          <div className="bg-green-50/80 p-6 rounded-2xl border border-green-200 shadow-sm">
            <h3 className="text-lg font-semibold text-green-800 mb-4">上传成功！</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-green-700 mb-1">图片链接</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={result.url}
                    className="flex-1 px-3 py-2 bg-white border border-green-200 rounded-lg text-sm text-slate-600"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(result.url)}
                    className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium"
                  >
                    复制
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-green-700 mb-1">Markdown</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={result.markdown}
                    className="flex-1 px-3 py-2 bg-white border border-green-200 rounded-lg text-sm text-slate-600"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(result.markdown)}
                    className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium"
                  >
                    复制
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setFile(null)
                setPreviewUrl(null)
                setResult(null)
                setFileName('')
              }}
              className="mt-6 w-full py-2 text-green-700 hover:bg-green-100 rounded-lg transition-colors text-sm"
            >
              上传下一张
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
