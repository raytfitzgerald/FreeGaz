import type { ReactNode } from 'react'
import { cn } from './cn'

export interface MetricTileProps {
  label: string
  value: number | string | null
  unit?: string
  /** Series colour for the line-key beside the label (identity never rides on the text). */
  accent?: string
  sub?: ReactNode
  size?: 'md' | 'lg' | 'xl'
  className?: string
  testId?: string
  /** Optional status chip (icon + label), e.g. ERG compliance. */
  status?: ReactNode
  /** Makes the unit a button (e.g. flip km/h and mph); `label` is its accessible name. */
  unitAction?: { label: string; onClick: () => void }
}

const SIZES = {
  md: 'text-4xl',
  lg: 'text-6xl',
  xl: 'text-8xl',
}

/**
 * A big glanceable number. `null` renders as an em dash: missing, not zero.
 * Values use tabular figures on purpose: they update several times a second,
 * and proportional digits would make the number jitter in width.
 */
export function MetricTile({ label, value, unit, accent, sub, size = 'lg', className, testId, status, unitAction }: MetricTileProps) {
  const missing = value === null || value === undefined
  return (
    <div className={cn('flex flex-col rounded-2xl border border-line bg-panel px-5 py-4', className)} data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 eyebrow text-ink-faint" data-testid={testId ? `${testId}-label` : undefined}>
          {accent && <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: accent }} />}
          {label}
        </div>
        {status}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className={cn('tabular font-display font-bold leading-none tracking-tight text-ink', SIZES[size], missing && 'text-ink-faint')}
          data-testid={testId ? `${testId}-value` : undefined}
        >
          {missing ? '—' : value}
        </span>
        {unit &&
          (unitAction ? (
            <button
              type="button"
              aria-label={unitAction.label}
              title={unitAction.label}
              onClick={unitAction.onClick}
              className="no-drag rounded text-sm font-medium text-ink-dim underline decoration-dotted underline-offset-4 hover:text-ink"
              data-testid={testId ? `${testId}-unit` : undefined}
            >
              {unit}
            </button>
          ) : (
            <span className="text-sm font-medium text-ink-dim">{unit}</span>
          ))}
      </div>
      {sub && <div className="mt-2 text-xs text-ink-dim">{sub}</div>}
    </div>
  )
}
