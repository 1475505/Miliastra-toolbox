import { forwardRef, type SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', error = false, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={[
          'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-on-surface',
          'transition-colors duration-200',
          'focus:outline-none focus:ring-2',
          error
            ? 'border-error focus:border-error focus:ring-error/20'
            : 'border-outline focus:border-primary focus:ring-primary/20',
          className,
        ].join(' ')}
        {...props}
      >
        {children}
      </select>
    )
  }
)

Select.displayName = 'Select'

export default Select
