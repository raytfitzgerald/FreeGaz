// Parsing and formatting for the builder's inspector and header fields.
// Everything the rider types passes through here: unreadable input comes
// back as null (the field shows it as invalid) and never reaches the workout.
import { slugify } from '@core/workout/ids'
import { TEXT_MAX_REPEAT } from '@core/workout/io/intervals-text'
import { parseDuration } from '@core/workout/io/text-tokens'
import type { CadenceTarget } from '@core/workout/model'
import { formatClock, formatNumber } from '@core/workout/numbers'

const BARE_NUMBER = /^\d+(?:\.\d+)?$/

/**
 * Seconds from "5:30", "1:02:30", "5m30s", "90s", "1h" (the text-mode
 * syntax, spaces allowed) or bare seconds ("90"), rounded to whole seconds.
 * Null when unreadable or below `min`.
 */
export function parseDurationInput(text: string, min = 1): number | null {
  const t = text.trim().replace(/\s+/g, '')
  if (t === '') return null
  const s = BARE_NUMBER.test(t) ? Number(t) : parseDuration(t)
  if (s === null || !Number.isFinite(s)) return null
  const rounded = Math.round(s)
  return rounded >= min ? rounded : null
}

/** mm:ss (h:mm:ss past an hour), the way the inspector shows durations. */
export const formatDurationInput = (s: number): string => formatClock(s)

/** "88", "88%", "88.5 %" → 0.88 / 0.885 of FTP. Null when unreadable or over 1000 %. */
export function parsePercentInput(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*%?$/.exec(text.trim())
  if (!m) return null
  const v = Number(m[1])
  return v <= 1000 ? Math.round(v * 100) / 1e4 : null
}

/** 0.885 → "88.5" (the % sign sits beside the field). */
export const formatPercentInput = (fraction: number): string => formatNumber(fraction * 100, 1)

/** "220", "220w", "220 W" → 220. Null when unreadable or over 5000 W. */
export function parseWattsInput(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*w?$/i.exec(text.trim())
  if (!m) return null
  const v = Number(m[1])
  return v <= 5000 ? Math.round(v) : null
}

export const formatWattsInput = (watts: number): string => formatNumber(watts, 0)

/** A whole repeat count from 1 to the text-mode limit. */
export function parseRepeatInput(text: string): number | null {
  const t = text.trim().replace(/x$/i, '').trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n >= 1 && n <= TEXT_MAX_REPEAT ? n : null
}

export const CADENCE_MIN = 20
export const CADENCE_MAX = 250

/**
 * Cadence targets: "90" (or "90rpm") → { rpm: 90 }; "85-95" → a range; blank
 * → undefined (no target). Null when unreadable or outside 20–250 rpm.
 */
export function parseCadenceInput(text: string): CadenceTarget | undefined | null {
  const t = text.trim().replace(/\s*rpm$/i, '').replace(/\s+/g, '')
  if (t === '') return undefined
  const m = /^(\d+(?:\.\d+)?)(?:[-–](\d+(?:\.\d+)?))?$/.exec(t)
  if (!m) return null
  const a = Math.round(Number(m[1]))
  const ok = (n: number) => n >= CADENCE_MIN && n <= CADENCE_MAX
  if (m[2] === undefined) return ok(a) ? { rpm: a } : null
  const b = Math.round(Number(m[2]))
  if (!ok(a) || !ok(b)) return null
  return a === b ? { rpm: a } : { low: Math.min(a, b), high: Math.max(a, b) }
}

/** { rpm } → "90"; a range → "85-95"; nothing → "". A single rpm wins over a range, as in compile. */
export function formatCadenceInput(c: CadenceTarget | undefined): string {
  if (!c) return ''
  if (c.rpm !== undefined) return formatNumber(c.rpm, 1)
  if (c.low !== undefined && c.high !== undefined) return `${formatNumber(c.low, 1)}-${formatNumber(c.high, 1)}`
  return ''
}

/** Adds comma-separated tags as library slugs ("Sweet spot" → "sweet-spot"), skipping blanks and duplicates. */
export function addTags(existing: readonly string[], text: string): string[] {
  const out = [...existing]
  for (const part of text.split(',')) {
    const slug = slugify(part)
    if (slug && !out.includes(slug)) out.push(slug)
  }
  return out
}

/** A copy of `o` with `key` set, or removed when `value` is undefined (optional fields stay absent, not undefined). */
export function withOptional<T extends object, K extends keyof T>(o: T, key: K, value: T[K] | undefined): T {
  const out = { ...o }
  if (value === undefined) delete out[key]
  else out[key] = value
  return out
}
