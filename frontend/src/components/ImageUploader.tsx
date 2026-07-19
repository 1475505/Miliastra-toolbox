import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { getCOSConfig, saveCOSConfig } from '../utils/cosConfig'
import { generateDefaultFileName } from '../utils/file'
import { COSConfig } from '../types'
import PageHeader from './ui/PageHeader'
import Surface from './ui/Surface'
import Button from './ui/Button'
import Input from './ui/Input'
import { ImageIcon } from './ui/icons'

export default function ImageUploader() {
  const { t } = useTranslation()
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
      setError(t('uploader.configRequired'))
      return
    }

    if (!file) {
      setError(t('uploader.selectFile'))
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
        throw new Error(errorData.detail || t('uploader.uploadFailed'))
      }

      const data = (await response.json()) as { url: string; markdown: string }
      setResult(data)
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message : t('uploader.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="h-full flex flex-col p-4 lg:p-6 overflow-y-auto">
      <PageHeader title={t('uploader.title')}>
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
          <span>{t('uploader.useDefault')}</span>
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
                {t('uploader.dropHere')}
              </p>
              <p className="text-sm text-on-surface-variant/70">
                {t('uploader.pasteSupported')}
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
                  {t('uploader.fileName')}
                </label>
                <Input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                />
                <p className="mt-1 text-xs text-on-surface-variant">
                  {t('uploader.defaultFormat')}
                  <span className="font-mono">yyyyMMdd_hhmmss</span>.{t('uploader.originalFormat')}
                </p>
              </div>
              <Button onClick={handleUpload} disabled={uploading}>
                {uploading ? t('uploader.uploading') : t('uploader.startUpload')}
              </Button>
            </div>
            {error && <p className="mt-2 text-error text-sm">{error}</p>}
          </Surface>
        )}

        {result && (
          <Surface className="!bg-primary-container/30 !border-primary/20">
            <h3 className="text-lg font-semibold text-on-primary-container mb-4">
              {t('uploader.uploadSuccess')}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-on-primary-container mb-1">
                  {t('uploader.imageLink')}
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
                    {t('common.copy')}
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
                    {t('common.copy')}
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
              {t('uploader.uploadNext')}
            </Button>
          </Surface>
        )}
      </div>
    </div>
  )
}
