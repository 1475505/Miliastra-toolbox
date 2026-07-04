import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  filled:
    'bg-primary text-on-primary hover:bg-primary/90 shadow-sm focus:ring-primary/30',
  tonal:
    'bg-secondary-container text-on-secondary-container hover:bg-secondary-container/80 focus:ring-primary/20',
  outlined:
    'border border-outline bg-transparent text-on-surface hover:bg-surface-variant focus:ring-primary/20',
  text: 'bg-transparent text-primary hover:bg-primary/10 focus:ring-primary/20',
  elevated:
    'bg-surface text-primary shadow-surface hover:shadow-sm focus:ring-primary/20',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-6 text-base',
}

export default function Button({
  variant = 'filled',
  size = 'md',
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center gap-1.5 rounded-full font-medium',
        'transition-colors duration-200',
        'focus:outline-none focus:ring-2 focus:ring-offset-0',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}
