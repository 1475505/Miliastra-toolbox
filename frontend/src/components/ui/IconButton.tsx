import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  label: string
}

export default function IconButton({
  children,
  label,
  className = '',
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={[
        'inline-flex items-center justify-center',
        'w-9 h-9 rounded-xl',
        'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant',
        'transition-colors duration-200',
        'focus:outline-none focus:ring-2 focus:ring-primary/30',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}
