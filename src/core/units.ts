// Display units. Storage and physics stay SI (metres, kg, °C, km/h). These
// helpers only change what the rider sees and what they type.

export type UnitSystem = 'metric' | 'imperial'
/** The rider's own speed and weight choices; either also accepts a whole system. */
export type SpeedUnitSetting = 'kmh' | 'mph'
export type WeightUnitSetting = 'kg' | 'lb'
export type SpeedSystem = UnitSystem | SpeedUnitSetting
export type WeightSystem = UnitSystem | WeightUnitSetting

const mphSpeed = (u: SpeedSystem): boolean => u === 'imperial' || u === 'mph'
const lbWeight = (u: WeightSystem): boolean => u === 'imperial' || u === 'lb'

/** The speed and weight units that go with a whole system (the Units preset). */
export function unitPreset(u: UnitSystem): { speedUnit: SpeedUnitSetting; weightUnit: WeightUnitSetting } {
  return u === 'imperial' ? { speedUnit: 'mph', weightUnit: 'lb' } : { speedUnit: 'kmh', weightUnit: 'kg' }
}

const M_PER_MI = 1609.344
const M_PER_FT = 0.3048
const KG_PER_LB = 0.45359237
const KMH_PER_MPH = 1.609344

export function speedUnit(u: SpeedSystem): 'km/h' | 'mph' {
  return mphSpeed(u) ? 'mph' : 'km/h'
}
export function distanceUnit(u: UnitSystem): 'km' | 'mi' {
  return u === 'imperial' ? 'mi' : 'km'
}
export function elevationUnit(u: UnitSystem): 'm' | 'ft' {
  return u === 'imperial' ? 'ft' : 'm'
}
export function weightUnit(u: WeightSystem): 'kg' | 'lb' {
  return lbWeight(u) ? 'lb' : 'kg'
}
export function tempUnit(u: UnitSystem): '°C' | '°F' {
  return u === 'imperial' ? '°F' : '°C'
}

function roundTo(n: number, dp: number): number {
  const p = 10 ** dp
  return Math.round(n * p) / p
}

function fixedOrInt(n: number, dp: number): string {
  const r = roundTo(n, dp)
  return Number.isInteger(r) ? String(r) : r.toFixed(dp)
}

export function displaySpeedKmh(kmh: number, u: SpeedSystem): number {
  return mphSpeed(u) ? kmh / KMH_PER_MPH : kmh
}
export function storedSpeedKmh(shown: number, u: SpeedSystem): number {
  return mphSpeed(u) ? shown * KMH_PER_MPH : shown
}

/** km/h in, display string out. Null stays null. */
export function formatSpeedKmh(kmh: number | null | undefined, u: SpeedSystem, dp = 1): string | null {
  if (kmh === null || kmh === undefined || !Number.isFinite(kmh)) return null
  return fixedOrInt(displaySpeedKmh(kmh, u), dp)
}

/** m/s in, display string out. */
export function formatSpeedMps(mps: number | null | undefined, u: SpeedSystem, dp = 1): string | null {
  if (mps === null || mps === undefined || !Number.isFinite(mps)) return null
  return formatSpeedKmh(mps * 3.6, u, dp)
}

/** Long distance as a number only: km or miles. */
export function formatLongDistance(m: number, u: UnitSystem, dp = 1): string {
  const v = u === 'imperial' ? m / M_PER_MI : m / 1000
  return fixedOrInt(v, dp)
}

/** Always `dp` decimals, for tiles that should not jump width. */
export function formatLongDistanceFixed(m: number, u: UnitSystem, dp = 2): string {
  const v = u === 'imperial' ? m / M_PER_MI : m / 1000
  return roundTo(v, dp).toFixed(dp)
}

/**
 * A length with its unit. Metric uses metres under 1 km; imperial uses feet
 * under a tenth of a mile.
 */
export function formatSpan(m: number, u: UnitSystem): string {
  const v = Math.abs(m)
  if (u === 'imperial') {
    if (v >= 0.1 * M_PER_MI) return `${formatLongDistance(v, u)} mi`
    return `${Math.round(v / M_PER_FT)} ft`
  }
  if (v >= 1000) return `${formatLongDistance(v, 'metric')} km`
  return `${Math.round(v)} m`
}

/** A signed gap: "+85 m", "−1.2 km", "+280 ft", "−0.8 mi". */
export function formatGapDistance(m: number, u: UnitSystem): string {
  const body = formatSpan(m, u)
  const shown = u === 'imperial' && Math.abs(m) < 0.1 * M_PER_MI ? Math.round(Math.abs(m) / M_PER_FT) : Math.round(Math.abs(m))
  return `${m < 0 && shown > 0 ? '−' : '+'}${body}`
}

export function formatElevation(m: number, u: UnitSystem): string {
  const v = u === 'imperial' ? m / M_PER_FT : m
  return `${Math.round(v)} ${elevationUnit(u)}`
}

export function displayElevation(m: number, u: UnitSystem): number {
  return u === 'imperial' ? m / M_PER_FT : m
}

export function displayWeightKg(kg: number, u: WeightSystem): number {
  return lbWeight(u) ? kg / KG_PER_LB : kg
}
export function storedWeightKg(shown: number, u: WeightSystem): number {
  return lbWeight(u) ? shown * KG_PER_LB : shown
}

export function formatWeight(kg: number, u: WeightSystem, dp = 1): string {
  return fixedOrInt(displayWeightKg(kg, u), dp)
}

export function displayTempC(c: number, u: UnitSystem): number {
  return u === 'imperial' ? (c * 9) / 5 + 32 : c
}
export function formatTempC(c: number | null, u: UnitSystem, dp = 1): string | null {
  if (c === null || !Number.isFinite(c)) return null
  return roundTo(displayTempC(c, u), dp).toFixed(dp)
}

const METRIC_SCALE_M = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000, 200_000]
const IMPERIAL_SCALE_M = [50, 100, 200, 500, 1000, 2000, 5280, 2 * 5280, 5 * 5280, 10 * 5280, 20 * 5280, 50 * 5280].map((ft) => ft * M_PER_FT)

/** Round scale-bar lengths, in metres, for the active system. */
export function scaleSteps(u: UnitSystem): readonly number[] {
  return u === 'imperial' ? IMPERIAL_SCALE_M : METRIC_SCALE_M
}
