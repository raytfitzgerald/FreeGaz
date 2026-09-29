// Tokens of the intervals.icu-style workout text: durations, power and
// cadence, parsed and formatted. Kept apart from the line grammar so the
// builder UI can reuse them (e.g. to validate a duration field).

import type { CadenceTarget, PowerTarget } from '../model'
import { formatNumber } from '../numbers'

/**
 * Z1..Z7 targets resolve to these Coggan zone midpoints (fraction of FTP):
 * Z1 0.50, Z2 0.66, Z3 0.83, Z4 0.98, Z5 1.13, Z6 1.35, Z7 1.60.
 */
export const ZONE_MIDPOINTS: readonly number[] = [0.5, 0.66, 0.83, 0.98, 1.13, 1.35, 1.6]

const N = String.raw`(\d+(?:\.\d+)?)`
const HMS = new RegExp(String.raw`^(?:${N}h(?:rs?|ours?)?)?(?:${N}m(?:ins?)?)?(?:${N}s(?:ecs?)?)?$`)
const MIN_BARE_SEC = /^(\d+)m(\d{1,2})$/
const HOUR_BARE_MIN = /^(\d+)h(\d{1,2})$/
const PRIMES = new RegExp(String.raw`^${N}['\u2032\u2019](?:${N}["\u2033\u201D])?$`)
const SECONDS_MARK = new RegExp(String.raw`^${N}["\u2033\u201D]$`)
const CLOCK = /^(?:(\d+):)?(\d+):([0-5]\d)$/

/**
 * Seconds for a duration token, or null. Accepts 1h2m30s, 1h, 5m, 90s,
 * 1.5m, 10min, 1m30 (= 1m30s), 1h30 (= 1h30m), 5'30", 5', 30" (also ′ ″)
 * and clock times 5:30 / 1:02:30. Case-insensitive; never rounds.
 */
export function parseDuration(token: string): number | null {
  const t = token.toLowerCase()
  let m = HMS.exec(t)
  if (m && (m[1] ?? m[2] ?? m[3]) !== undefined) return num(m[1]) * 3600 + num(m[2]) * 60 + num(m[3])
  m = MIN_BARE_SEC.exec(t)
  if (m && num(m[2]) < 60) return num(m[1]) * 60 + num(m[2])
  m = HOUR_BARE_MIN.exec(t)
  if (m && num(m[2]) < 60) return num(m[1]) * 3600 + num(m[2]) * 60
  m = PRIMES.exec(t)
  if (m) return num(m[1]) * 60 + num(m[2])
  m = SECONDS_MARK.exec(t)
  if (m) return num(m[1])
  m = CLOCK.exec(t)
  if (m) return num(m[1]) * 3600 + num(m[2]) * 60 + num(m[3])
  return null
}

/** Compact duration in the text syntax: 90 → "1m30s", 3750 → "1h2m30s", 300 → "5m". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s'
  let rest = Math.round(seconds * 1000) / 1000
  const h = Math.floor(rest / 3600)
  rest -= h * 3600
  const m = Math.floor(rest / 60)
  rest = Math.round((rest - m * 60) * 1000) / 1000
  const out = `${h > 0 ? `${h}h` : ''}${m > 0 ? `${m}m` : ''}${rest > 0 ? `${formatNumber(rest, 3)}s` : ''}`
  return out === '' ? '0s' : out
}

export type PowerToken =
  | { kind: 'single'; target: PowerTarget }
  | { kind: 'range'; a: PowerTarget; b: PowerTarget }

const POWER_SINGLE = new RegExp(String.raw`^${N}(%|w)$`, 'i')
const POWER_RANGE = new RegExp(String.raw`^${N}(%|w)?-${N}(%|w)$`, 'i')
const ZONE = /^z([1-7])$/i

/** "75%", "220w", "Z2" → single; "95-105%", "200w-250w", "50%-250w" → range (unit on the right applies to a bare left side). */
export function parsePowerToken(token: string): PowerToken | null {
  const z = ZONE.exec(token)
  if (z) return { kind: 'single', target: { unit: 'ftp', value: ZONE_MIDPOINTS[Number(z[1]) - 1] ?? 0 } }
  const s = POWER_SINGLE.exec(token)
  if (s) return { kind: 'single', target: target(num(s[1]), s[2]) }
  const r = POWER_RANGE.exec(token)
  if (r) return { kind: 'range', a: target(num(r[1]), r[2] ?? r[4]), b: target(num(r[3]), r[4]) }
  return null
}

const CADENCE = new RegExp(String.raw`^${N}(?:-${N})?rpm$`, 'i')

/** "90rpm" → { rpm: 90 }; "85-95rpm" → { low: 85, high: 95 }. */
export function parseCadenceToken(token: string): CadenceTarget | null {
  const m = CADENCE.exec(token)
  if (!m) return null
  const a = num(m[1])
  if (m[2] === undefined) return a > 0 ? { rpm: a } : null
  const b = num(m[2])
  return a > 0 && b > 0 ? { low: Math.min(a, b), high: Math.max(a, b) } : null
}

/** Steady target: "88%", "220w", or a range "88-92%" when value is its midpoint. */
export function formatPowerTarget(p: PowerTarget): string {
  const { low, high } = p
  if (low !== undefined && high !== undefined && Number.isFinite(low) && Number.isFinite(high) && low < high) {
    const mid = (low + high) / 2
    if (Math.abs(p.value - mid) <= 1e-9 * Math.max(1, Math.abs(mid))) return `${amount(low, p.unit)}-${amount(high, p.unit)}${suffix(p.unit)}`
  }
  return `${amount(p.value, p.unit)}${suffix(p.unit)}`
}

/** Ramp endpoints: "50-75%", "150-250w", or mixed units "50%-250w". */
export function formatRampRange(from: PowerTarget, to: PowerTarget): string {
  if (from.unit === to.unit) return `${amount(from.value, from.unit)}-${amount(to.value, to.unit)}${suffix(to.unit)}`
  return `${amount(from.value, from.unit)}${suffix(from.unit)}-${amount(to.value, to.unit)}${suffix(to.unit)}`
}

/** "90rpm" or "85-95rpm"; null when there's nothing expressible (a lone low/high). */
export function formatCadence(c: CadenceTarget | undefined): string | null {
  if (!c) return null
  if (positive(c.rpm)) return `${formatNumber(c.rpm, 2)}rpm`
  if (positive(c.low) && positive(c.high)) return `${formatNumber(c.low, 2)}-${formatNumber(c.high, 2)}rpm`
  return null
}

function target(n: number, unit: string | undefined): PowerTarget {
  return unit?.toLowerCase() === 'w' ? { unit: 'watts', value: n } : { unit: 'ftp', value: n / 100 }
}

function amount(v: number, unit: PowerTarget['unit']): string {
  return unit === 'ftp' ? formatNumber(v * 100, 4) : formatNumber(v, 2)
}

function suffix(unit: PowerTarget['unit']): string {
  return unit === 'ftp' ? '%' : 'w'
}

function num(s: string | undefined): number {
  return s === undefined ? 0 : Number(s)
}

function positive(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}
