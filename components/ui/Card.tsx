import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean
  interactive?: boolean
}

export function Card({ elevated, interactive, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={[
        'rounded-2xl bg-[var(--surface)] border border-[var(--border)]',
        elevated ? 'shadow-lg shadow-black/40' : '',
        interactive ? 'cursor-pointer hover:border-[var(--action)] transition-colors duration-150 active:scale-[0.98]' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
