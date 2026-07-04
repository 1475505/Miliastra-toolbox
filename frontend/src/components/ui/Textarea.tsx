import { forwardRef, type TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', error = false, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={[
          'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-on-surface',
          'placeholder:text-on-surface-variant',
          'transition-colors duration-200 resize-none',
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

Textarea.displayName = 'Textarea'

export default Textarea
