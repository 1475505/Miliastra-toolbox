import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  children?: ReactNode
  className?: string
}

export default function PageHeader({ title, children, className = '' }: PageHeaderProps) {
  return (
    <div
      className={[
        'flex items-center justify-between',
        'min-h-[3.5rem] px-4 lg:px-6',
        'border-b border-outline bg-surface/70 backdrop-blur-md',
        className,
      ].join(' ')}
    >
      <h2 className="text-lg font-semibold text-on-surface pl-8 lg:pl-0">{title}</h2>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
