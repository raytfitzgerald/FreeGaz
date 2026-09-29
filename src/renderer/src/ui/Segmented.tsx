import { ToggleGroup } from 'radix-ui'
import { cn } from './cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  hint?: string
  disabled?: boolean
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T
  onChange: (v: T) => void
  options: SegmentedOption<T>[]
  className?: string
  ariaLabel: string
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={ariaLabel}
      onValueChange={(v) => v && onChange(v as T)}
      className={cn('no-drag inline-flex rounded-xl border border-line bg-panel-2 p-1', className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          title={o.hint}
          className={cn(
            'rounded-lg px-4 py-1.5 text-sm font-medium text-ink-dim transition-colors',
            'hover:text-ink data-[state=on]:bg-panel-3 data-[state=on]:text-ink data-[state=on]:shadow',
            'disabled:opacity-40',
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
