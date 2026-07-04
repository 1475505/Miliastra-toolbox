import { useState, useEffect, useCallback } from 'react'

import { getCOSConfig, saveCOSConfig } from '../utils/cosConfig'
import { generateDefaultFileName } from '../utils/file'
import { COSConfig } from '../types'
import PageHeader from './ui/PageHeader'
import Surface from './ui/Surface'
import Button from './ui/Button'
import Input from './ui/Input'
import { ImageIcon } from './ui/icons'

export default function ImageUploader() {
  const [config, setConfig] = useState<COSConfig>(getCOSConfig())
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ url: string; markdown: string } | null>(
    null
  )
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
    setFileName(generateDefaultFileName(selectedFile.name, selectedFile.type))
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
      setError('请勾选默认配置，或配置自己的腾讯云COS服务来继续(后续支持自定义)')
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
      const uploadFile = new File([file], fileName, { type: file.type })
      formData.append('file', uploadFile)

      const response = await fetch('/api/v1/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          detail?: string
        }
        throw new Error(errorData.detail || '上传失败')
      }

      const data = (await response.json()) as { url: string; markdown: string }
      setResult(data)
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="h-full flex flex-col p-4 lg:p-6 overflow-y-auto">
      <PageHeader title="图床上传">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-on-surface-variant bg-surface-variant px-3 py-1.5 rounded-full hover:bg-outline-variant transition-colors duration-200">
          <input
            type="checkbox"
            checked={config.useDefault}
            onChange={(e) => {
              const newConfig = { useDefault: e.target.checked }
              setConfig(newConfig)
              saveCOSConfig(newConfig)
            }}
            className="rounded border-outline text-primary focus:ring-primary"
          />
          <span>使用默认配置（请按需使用）</span>
        </label>
      </PageHeader>

      <div className="flex-1 flex flex-col gap-6 mt-5">
        <div
          className={[
            'flex-1 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center p-8 transition-colors duration-200 relative',
            dragActive
              ? 'border-primary bg-primary-container/30'
              : 'border-outline bg-surface/50 hover:border-primary',
          ].join(' ')}
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
                className="max-h-[60vh] object-contain rounded-2xl shadow-lg mb-4"
              />
              <button
                onClick={() => {
                  setFile(null)
                  setPreviewUrl(null)
                  setResult(null)
                }}
                className="absolute top-0 right-0 p-2 bg-error text-on-error rounded-full hover:bg-error/90 shadow-md transform translate-x-1/2 -translate-y-1/2"
              >
                ×
              </button>
            </div>
          ) : (
            <div className="text-center">
              <ImageIcon className="w-16 h-16 mx-auto mb-4 text-on-surface-variant" />
              <p className="text-xl text-on-surface-variant mb-2">
                点击选择或拖拽图片到这里
              </p>
              <p className="text-sm text-on-surface-variant/70">
                支持 Ctrl+V 粘贴
              </p>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  e.target.files &&
                  e.target.files[0] &&
                  handleFileSelect(e.target.files[0])
                }
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          )}
        </div>

        {file && !result && (
          <Surface>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-on-surface mb-1">
                  文件名
                </label>
                <Input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                />
                <p className="mt-1 text-xs text-on-surface-variant">
                  默认生成格式: [源文件名]_
                  <span className="font-mono">yyyyMMdd_hhmmss</span>.[原格式]
                </p>
              </div>
              <Button onClick={handleUpload} disabled={uploading}>
                {uploading ? '上传中...' : '开始上传'}
              </Button>
            </div>
            {error && <p className="mt-2 text-error text-sm">{error}</p>}
          </Surface>
        )}

        {result && (
          <Surface className="!bg-primary-container/30 !border-primary/20">
            <h3 className="text-lg font-semibold text-on-primary-container mb-4">
              上传成功！
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-on-primary-container mb-1">
                  图片链接
                </label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    readOnly
                    value={result.url}
                    className="flex-1"
                  />
                  <Button
                    variant="tonal"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(result.url)}
                  >
                    复制
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-on-primary-container mb-1">
                  Markdown
                </label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    readOnly
                    value={result.markdown}
                    className="flex-1"
                  />
                  <Button
                    variant="tonal"
                    size="sm"
                    onClick={() =>
                      navigator.clipboard.writeText(result.markdown)
                    }
                  >
                    复制
                  </Button>
                </div>
              </div>
            </div>
            <Button
              variant="text"
              onClick={() => {
                setFile(null)
                setPreviewUrl(null)
                setResult(null)
                setFileName('')
              }}
              className="mt-6 w-full"
            >
              上传下一张
            </Button>
          </Surface>
        )}
      </div>
    </div>
  )
}
