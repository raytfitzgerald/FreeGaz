// Facts, placeholders and formatting. A line template like
// "Hold {targetW} for {remainingS}" is rendered against the facts of the
// moment: the caller's data plus a few values derived from it.
import { HARD_SEGMENT_KINDS, type CoachContext } from './types'

export type FactValue = number | string | boolean
export type Facts = Readonly<Record<string, FactValue | undefined>>

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g

/** Longest string fact that may be spoken; longer labels make a line ineligible. */
export const MAX_STRING_FACT = 80

/** Placeholder keys used by a template, in order of appearance. */
export function placeholdersOf(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1] ?? '')
}

/** True when every brace in the text belongs to a well-formed {placeholder}. */
export function bracesBalanced(text: string): boolean {
  return !/[{}]/.test(text.replace(PLACEHOLDER, ''))
}

export function isHardKind(kind: unknown): boolean {
  return typeof kind === 'string' && (HARD_SEGMENT_KINDS as readonly string[]).includes(kind)
}

/**
 * The facts a line is matched and rendered against: the caller's data with
 * null/NaN dropped (missing is not zero), plus derived values. Caller-supplied
 * values always win over derived ones.
 */
export function buildFacts(ctx: CoachContext): Facts {
  const f: Record<string, FactValue | undefined> = {}
  for (const [k, v] of Object.entries(ctx.data)) {
    if (v === undefined || v === null) continue
    if (typeof v === 'number' && !Number.isFinite(v)) continue
    f[k] = v
  }
  const num = (k: string): number | undefined => {
    const v = f[k]
    return typeof v === 'number' ? v : undefined
  }
  const derive = (k: string, v: FactValue | undefined): void => {
    if (f[k] === undefined && v !== undefined && (typeof v !== 'number' || Number.isFinite(v))) f[k] = v
  }

  derive('rideKind', ctx.rideKind)
  derive('intensityFactor', ctx.intensityFactor)
  if (typeof f.segmentKind === 'string') derive('hard', isHardKind(f.segmentKind))

  const power = num('power')
  const target = num('targetW')
  if (power !== undefined && target !== undefined && target > 0) {
    derive('pct', (power / target) * 100)
    derive('deficitW', target - power)
    derive('surplusW', power - target)
  }
  const pct = num('pct')
  if (pct !== undefined) {
    derive('pctUnder', 100 - pct)
    derive('pctOver', pct - 100)
  }
  const cadence = num('cadence')
  const cadenceAvg = num('cadenceAvg')
  if (cadence !== undefined && cadenceAvg !== undefined) derive('cadenceDrop', cadenceAvg - cadence)
  if (power !== undefined && cadence !== undefined && cadence >= 20) derive('torqueNm', power / ((cadence * 2 * Math.PI) / 60))
  const ftpNew = num('ftpNew')
  const ftpOld = num('ftpOld')
  if (ftpNew !== undefined && ftpOld !== undefined) {
    derive('ftpGain', ftpNew - ftpOld)
    derive('ftpDrop', ftpOld - ftpNew)
  }
  const projected = num('projectedFtp')
  if (projected !== undefined && ftpOld !== undefined) derive('projectedGain', projected - ftpOld)
  const rep = num('rep')
  const reps = num('reps')
  if (rep !== undefined && reps !== undefined) derive('repsLeft', reps - rep)
  const elapsedS = num('elapsedS')
  if (elapsedS !== undefined) derive('elapsedMin', Math.floor(elapsedS / 60))
  return f
}

/** Keys whose rendered value must be positive: "{deficitW} watts short" makes no sense at 0. */
const POSITIVE_ONLY = new Set([
  'deficitW',
  'surplusW',
  'pctUnder',
  'pctOver',
  'cadenceDrop',
  'ftpGain',
  'ftpDrop',
  'projectedGain',
  'repsLeft',
  'extraS',
  'pausedS',
])
/** Seconds: every key ending in a capital S (remainingS, durationS, pausedS...). */
const DURATION_KEY = /S$/
/** Ratios keep two decimals; every other number is rounded to an integer (watts, bpm, rpm, %). */
const RATIO_KEY = /(?:^intensityFactor|IF|Wkg|Ratio)$/

/** "45 seconds", "1:00", "2:05", "1:02:03". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s} ${s === 1 ? 'second' : 'seconds'}`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** How one fact is spoken, or null when it cannot be (the line is then ineligible). */
export function formatFact(key: string, value: FactValue): string | null {
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'string') {
    const s = value.replace(/\s+/g, ' ').trim()
    return s.length > 0 && s.length <= MAX_STRING_FACT ? s : null
  }
  if (!Number.isFinite(value)) return null
  if (POSITIVE_ONLY.has(key) && Math.round(value) <= 0) return null
  if (DURATION_KEY.test(key)) return formatDuration(value)
  if (RATIO_KEY.test(key)) return String(Math.round(value * 100) / 100)
  const n = Math.round(value)
  return String(Object.is(n, -0) ? 0 : n)
}

/** Fills every placeholder, or returns null if any is missing or unspeakable. */
export function renderTemplate(text: string, facts: Facts): string | null {
  let ok = true
  const out = text.replace(PLACEHOLDER, (_whole, key: string) => {
    const v = facts[key]
    const s = v === undefined ? null : formatFact(key, v)
    if (s === null) {
      ok = false
      return ''
    }
    return s
  })
  return ok ? out : null
}

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`

/** A TTS-friendly version of a rendered line. */
export function toSpeech(text: string): string {
  return text
    .replace(/\b(\d+):(\d{2}):(\d{2})\b/g, (_w, h: string, m: string, s: string) => {
      const parts = [plural(Number(h), 'hour')]
      if (Number(m) > 0) parts.push(plural(Number(m), 'minute'))
      if (Number(s) > 0) parts.push(plural(Number(s), 'second'))
      return parts.join(' ')
    })
    .replace(/\b(\d+):(\d{2})\b/g, (_w, m: string, s: string) =>
      Number(s) > 0 ? `${plural(Number(m), 'minute')} ${plural(Number(s), 'second')}` : plural(Number(m), 'minute'),
    )
    .replace(/W[′']bal/g, 'W prime balance')
    .replace(/W[′'](?![a-z])/g, 'W prime')
    .replace(/\bW\/kg\b/g, 'watts per kilo')
    .replace(/\bkJ\b/g, 'kilojoules')
    .replace(/\bN·m\b/g, 'newton meters')
}
