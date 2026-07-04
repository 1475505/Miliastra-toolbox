import type { ReactNode } from 'react'

type ChipVariant = 'default' | 'primary' | 'error'

interface ChipProps {
  children: ReactNode
  variant?: ChipVariant
  className?: string
}

const variantClasses: Record<ChipVariant, string> = {
  default: 'bg-surface-variant text-on-surface-variant',
  primary: 'bg-primary-container text-on-primary-container',
  error: 'bg-error-container text-error',
}

export default function Chip({ children, variant = 'default', className = '' }: ChipProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium',
        variantClasses[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
