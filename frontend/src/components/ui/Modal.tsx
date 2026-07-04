import type { MouseEvent, ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className = '',
}: ModalProps) {
  if (!open) return null

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.currentTarget === event.target) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleOverlayClick}
    >
      <div
        className={[
          'bg-surface/95 backdrop-blur-xl rounded-3xl shadow-modal w-full',
          'max-w-md p-6 max-h-[90vh] overflow-y-auto',
          className,
        ].join(' ')}
      >
        {title && (
          <h3 className="text-xl font-semibold text-on-surface mb-5">{title}</h3>
        )}
        <div className="text-on-surface-variant text-sm">{children}</div>
        {footer && <div className="flex items-center gap-3 mt-6">{footer}</div>}
      </div>
    </div>
  )
}
