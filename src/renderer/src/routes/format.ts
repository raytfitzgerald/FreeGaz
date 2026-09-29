// Number formats for route screens (metric, like the rest of the app).

/** 12400 → "12.4", 3000 → "3". */
export function formatKm(m: number, dp = 1): string {
  const v = Math.round((m / 1000) * 10 ** dp) / 10 ** dp
  return Number.isInteger(v) ? String(v) : v.toFixed(dp)
}

/** 250 → "250 m", 1500 → "1.5 km". */
export function formatMetres(m: number): string {
  return m >= 1000 ? `${formatKm(m)} km` : `${Math.round(m)} m`
}

/** m/s → "32.4" km/h, or null. */
export function kmh(mps: number | null | undefined): string | null {
  return mps === null || mps === undefined || !Number.isFinite(mps) ? null : (mps * 3.6).toFixed(1)
}

/** A signed gap: "+12 s", "−1:05", "+85 m", "−1.2 km". */
export function formatGapS(s: number): string {
  const v = Math.round(Math.abs(s))
  const body = v >= 60 ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : `${v} s`
  return `${s < 0 && v > 0 ? '−' : '+'}${body}`
}

export function formatGapM(m: number): string {
  const v = Math.abs(m)
  const body = v >= 1000 ? `${formatKm(v)} km` : `${Math.round(v)} m`
  return `${m < 0 && Math.round(v) > 0 ? '−' : '+'}${body}`
}
