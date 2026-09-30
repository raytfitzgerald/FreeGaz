import { Slider as RSlider, Switch as RSwitch } from 'radix-ui'
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from './cn'

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid items-start gap-2 py-3 md:grid-cols-[minmax(160px,220px)_1fr] md:gap-6', className)}>
      <div className="md:pt-2">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs leading-relaxed text-ink-faint">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'no-drag h-10 w-full rounded-lg border border-line bg-panel-2 px-3 text-sm text-ink placeholder:text-ink-faint',
        'focus:border-accent focus:outline-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function NumberInput({
  value,
  onChange,
  unit,
  min,
  max,
  step = 1,
  className,
  ...rest
}: {
  value: number | null
  onChange: (v: number | null) => void
  unit?: string
  min?: number
  max?: number
  step?: number
  className?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'step'>) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Input
        type="number"
        inputMode="decimal"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = e.target.value === '' ? null : Number(e.target.value)
          onChange(v !== null && Number.isFinite(v) ? v : null)
        }}
        className="tabular w-28"
        {...rest}
      />
      {unit && <span className="text-sm text-ink-dim">{unit}</span>}
    </div>
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn('no-drag h-10 rounded-lg border border-line bg-panel-2 px-3 text-sm text-ink focus:border-accent focus:outline-none', className)}
      {...props}
    >
      {children}
    </select>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  const id = useId()
  return (
    <div className="flex items-center gap-3 pt-2">
      <RSwitch.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="no-drag relative h-6 w-11 shrink-0 rounded-full border border-line-strong bg-panel-3 transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:opacity-40"
      >
        <RSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[21px]" />
      </RSwitch.Root>
      {label && (
        <label htmlFor={id} className="text-sm text-ink-dim">
          {label}
        </label>
      )}
    </div>
  )
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  ariaLabel,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  format?: (v: number) => string
  ariaLabel: string
}) {
  return (
    <div className="flex items-center gap-4 pt-2">
      <RSlider.Root
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => v !== undefined && onChange(v)}
        className="no-drag relative flex h-5 w-full max-w-md touch-none select-none items-center"
        aria-label={ariaLabel}
      >
        <RSlider.Track className="relative h-1.5 grow rounded-full bg-panel-3">
          <RSlider.Range className="absolute h-full rounded-full bg-accent" />
        </RSlider.Track>
        <RSlider.Thumb className="block size-5 rounded-full border-2 border-accent bg-white shadow focus:outline-none" aria-label={ariaLabel} />
      </RSlider.Root>
      <span className="tabular w-16 text-right text-sm text-ink">{format(value)}</span>
    </div>
  )
}

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel px-6 py-4">
      <div className="border-b border-line pb-3">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-dim">{description}</p>}
      </div>
      <div className="divide-y divide-line/60">{children}</div>
    </section>
  )
}
