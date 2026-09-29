// Number formatting for file exports: short, locale-free, no float noise.

/**
 * `n` rounded to at most `maxDecimals` places, without trailing zeros:
 * 0.30000000000000004 → "0.3", 87.5 → "87.5", 90 → "90". Never "-0".
 */
export function formatNumber(n: number, maxDecimals: number): string {
  const s = String(Number(n.toFixed(maxDecimals)))
  return s === '-0' ? '0' : s
}

/** Clock-style duration, rounded to whole seconds: 90 → "1:30", 3750 → "1:02:30". */
export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Parse a decimal string; `undefined` for blanks and anything non-finite. */
export function parseNumber(s: string | undefined): number | undefined {
  if (s === undefined) return undefined
  const t = s.trim()
  if (t === '') return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}
