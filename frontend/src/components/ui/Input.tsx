import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error = false, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={[
          'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-on-surface',
          'placeholder:text-on-surface-variant',
          'transition-colors duration-200',
          'focus:outline-none focus:ring-2',
          error
            ? 'border-error focus:border-error focus:ring-error/20'
            : 'border-outline focus:border-primary focus:ring-primary/20',
          className,
        ].join(' ')}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'

export default Input
