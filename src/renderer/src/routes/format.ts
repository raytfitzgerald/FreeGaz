// Number formats for route screens. Storage is metres; the unit system only
// changes the label.

import { formatLongDistance, formatSpan, formatSpeedMps, type SpeedSystem, type UnitSystem } from '@core/units'

/** 12400 → "12.4" km, or "7.7" miles. */
export function formatKm(m: number, dp = 1, units: UnitSystem = 'metric'): string {
  return formatLongDistance(m, units, dp)
}

/** 250 → "250 m", 1500 → "1.5 km". Imperial: feet, then miles. */
export function formatMetres(m: number, units: UnitSystem = 'metric'): string {
  return formatSpan(m, units)
}

/** m/s → "32.4" in the active speed unit, or null. */
export function kmh(mps: number | null | undefined, units: SpeedSystem = 'metric'): string | null {
  return formatSpeedMps(mps, units)
}

/** A signed gap: "+12 s", "−1:05", "+85 m", "−1.2 km". */
export function formatGapS(s: number): string {
  const v = Math.round(Math.abs(s))
  const body = v >= 60 ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : `${v} s`
  return `${s < 0 && v > 0 ? '−' : '+'}${body}`
}

export function formatGapM(m: number, units: UnitSystem = 'metric'): string {
  const body = formatSpan(Math.abs(m), units)
  const shown = Math.round(Math.abs(m))
  return `${m < 0 && shown > 0 ? '−' : '+'}${body}`
}
