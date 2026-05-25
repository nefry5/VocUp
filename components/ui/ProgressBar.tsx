interface ProgressBarProps {
  value: number          // 0–100
  color?: string         // CSS color or var()
  height?: number        // px
  animated?: boolean
  label?: string
  className?: string
}

export function ProgressBar({
  value,
  color = 'var(--action)',
  height = 6,
  animated = false,
  label,
  className = '',
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value))

  return (
    <div className={`relative ${className}`} role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div
        className="w-full rounded-full overflow-hidden bg-[var(--surface-3)]"
        style={{ height }}
      >
        <div
          className={`h-full rounded-full ${animated ? 'transition-all duration-500 ease-out' : ''}`}
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
      {label && (
        <span className="sr-only">{label}: {clamped}%</span>
      )}
    </div>
  )
}
