import { useState, type InputHTMLAttributes } from 'react'
import { cn } from '../../ui/cn'
import { Input } from '../../ui/form'

export interface CommitInputProps<T> extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'> {
  value: T
  format: (v: T) => string
  /** The typed value, or null when the text can't be read (shown as invalid, never committed). */
  parse: (text: string) => T | null
  /** `stepping` is true for arrow-key steps, so a held arrow can coalesce into one undo step. */
  onCommit: (v: T, stepping: boolean) => void
  /** ↑/↓ nudges (⇧ for a big step), committed at once. */
  nudge?: (v: T, dir: 1 | -1, big: boolean) => T | null
}

/**
 * A text field for a typed value (durations, power, cadence…). Typing stays
 * local; Enter or leaving the field commits a valid value, Escape reverts.
 * Committing on each keystroke would make the workout jump through every
 * half-typed value ("1", "10", "105 %").
 */
export function CommitInput<T>({ value, format, parse, onCommit, nudge, className, onFocus, onBlur, onKeyDown, ...rest }: CommitInputProps<T>) {
  const [text, setText] = useState<string | null>(null)
  const invalid = text !== null && parse(text) === null
  const commit = () => {
    if (text !== null) {
      const v = parse(text)
      if (v !== null && format(v) !== format(value)) onCommit(v, false)
    }
    setText(null)
  }
  return (
    <Input
      {...rest}
      value={text ?? format(value)}
      aria-invalid={invalid || undefined}
      className={cn('tabular h-9', invalid && 'border-bad focus:border-bad', className)}
      onFocus={(e) => {
        setText(format(value))
        onFocus?.(e)
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => {
        commit()
        onBlur?.(e)
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (e.key === 'Enter') {
          commit()
        } else if (e.key === 'Escape') {
          setText(null)
        } else if (nudge && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault()
          const current = (text === null ? null : parse(text)) ?? value
          const next = nudge(current, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey)
          if (next !== null && format(next) !== format(value)) onCommit(next, true)
          setText(null)
        }
      }}
    />
  )
}
