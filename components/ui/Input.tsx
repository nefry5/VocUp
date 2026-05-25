import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[var(--text-muted)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            'w-full bg-[var(--surface)] border rounded-xl px-4 py-3 text-text placeholder-[var(--text-dim)]',
            'focus:outline-none focus:border-action transition-colors duration-150',
            error ? 'border-score-red' : 'border-[var(--border)]',
            className,
          ].join(' ')}
          {...props}
        />
        {error && <p className="text-xs text-score-red">{error}</p>}
        {hint && !error && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
