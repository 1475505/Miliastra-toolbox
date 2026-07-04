import type { HTMLAttributes, ReactNode } from 'react'

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  elevated?: boolean
}

export default function Surface({
  children,
  elevated = false,
  className = '',
  ...props
}: SurfaceProps) {
  return (
    <div
      className={[
        'rounded-2xl border border-outline/50 bg-surface/80 backdrop-blur-md',
        elevated ? 'shadow-sm' : 'shadow-surface',
        'p-5',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
