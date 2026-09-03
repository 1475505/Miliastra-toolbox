import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import Modal from './ui/Modal'
import Button from './ui/Button'
import { CopyIcon, OpenExternalIcon } from './ui/icons'

interface ShareLinkModalProps {
  url: string
  onClose: () => void
}

/** 分享成功后的链接弹窗：打开时自动复制，展示 URL 并提供复制/打开按钮 */
export default function ShareLinkModal({ url, onClose }: ShareLinkModalProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const copyUrl = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(url)
      return true
    } catch {
      inputRef.current?.select()
      try {
        return document.execCommand('copy')
      } catch {
        return false
      }
    }
  }

  const handleCopy = async () => {
    if (!(await copyUrl())) return
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  // 打开弹窗即自动复制一次（失败不打扰，用户仍可手动点击复制）
  useEffect(() => {
    void handleCopy()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Modal
      open
      onClose={onClose}
      title={t('shareLink.title')}
      footer={
        <>
          <Button variant="outlined" onClick={() => window.open(url, '_blank')}>
            <OpenExternalIcon className="w-4 h-4" />
            {t('shareLink.open')}
          </Button>
          <Button onClick={handleCopy} className="flex-1">
            <CopyIcon className="w-4 h-4" />
            {copied ? t('shareLink.copied') : t('shareLink.copy')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">{t('shareLink.hint')}</p>
        <input
          ref={inputRef}
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="w-full rounded-xl border border-outline bg-surface-variant/40 px-3 py-2.5 text-sm text-on-surface font-mono outline-none focus:border-primary truncate"
        />
      </div>
    </Modal>
  )
}
