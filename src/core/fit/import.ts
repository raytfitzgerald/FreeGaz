// FIT activity (decoded by fit-file-parser in 'list' mode) → FreeGaz ride
// records: one record per second of moving time, exactly like a ride
// recorded here, so history, PMC and the power curve treat both the same.
//
// - Timer stop/start events and gaps longer than maxGapS count as stopped.
// - Shorter gaps (Garmin "smart recording") hold the previous values.
// - A field a device didn't record stays null: missing is never zero.

import type { RideRecord } from '../ride/recorder'

type When = Date | string | number

export interface DecodedRecord {
  timestamp?: When
  power?: number
  heart_rate?: number
  cadence?: number
  speed?: number
  enhanced_speed?: number
  distance?: number
  altitude?: number
  enhanced_altitude?: number
  grade?: number
  /** FIT left_right_balance: % for the side flagged by `right` (unset = unknown, treated as left). */
  left_right_balance?: number | { value?: number; right?: boolean }
  core_temperature?: number
  saturated_hemoglobin_percent?: number
  /** FreeGaz developer field. */
  target_power?: number
  position_lat?: number
  position_long?: number
}

export interface DecodedFit {
  records?: DecodedRecord[]
  sessions?: { sport?: string; sub_sport?: string; start_time?: When; total_ascent?: number }[]
  laps?: { start_time?: When }[]
  events?: { event?: string; event_type?: string; timestamp?: When }[]
  file_ids?: { manufacturer?: string; product?: number | string; product_name?: string; garmin_product?: string }[]
}

export interface ImportedActivity {
  /** Epoch ms at the start of the first moving second. */
  startedAt: number
  sport: string | null
  subSport: string | null
  indoor: boolean
  /** "garmin edge_530", "wahoo_fitness", or null. */
  device: string | null
  /** A file FreeGaz wrote itself. */
  fromFreeGaz: boolean
  records: RideRecord[]
  elevationGainM: number | null
}

export type FitImportErrorCode = 'not-cycling' | 'no-records' | 'too-short'

export class FitImportError extends Error {
  constructor(
    readonly code: FitImportErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'FitImportError'
  }
}

const CYCLING_SUB_SPORTS = new Set(['indoor_cycling', 'virtual_activity', 'spin', 'road', 'mountain', 'gravel_cycling', 'cyclocross', 'track_cycling', 'bike_to_work', 'commuting'])
const INDOOR_SUB_SPORTS = new Set(['indoor_cycling', 'virtual_activity', 'spin'])
export const DEFAULT_MAX_GAP_S = 15
export const MIN_MOVING_S = 60

export function importFitActivity(fit: DecodedFit, opts: { maxGapS?: number } = {}): ImportedActivity {
  const maxGap = opts.maxGapS ?? DEFAULT_MAX_GAP_S
  const session = fit.sessions?.[0]
  const sport = session?.sport ?? null
  const subSport = session?.sub_sport ?? null
  const cycling = sport === 'cycling' || (subSport !== null && CYCLING_SUB_SPORTS.has(subSport))
  if (sport !== null && !cycling) throw new FitImportError('not-cycling', `This is a ${sport.replace(/_/g, ' ')} activity, not a ride.`)

  const samples = (fit.records ?? [])
    .map((r) => ({ r, s: toSeconds(r.timestamp) }))
    .filter((x): x is { r: DecodedRecord; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s)
  if (samples.length === 0) throw new FitImportError('no-records', 'The file has no recorded data.')

  const stops = timerStops(fit.events ?? [])
  const lapStarts = (fit.laps ?? []).map((l) => toSeconds(l.start_time)).filter((s): s is number => s !== null).sort((a, b) => a - b)

  const records: RideRecord[] = []
  let lap = 0
  let lapCursor = 1 // laps[0] starts the ride
  const push = (sec: number, r: DecodedRecord) => {
    // A record stamped `sec` covers (sec-1, sec]: it belongs to a lap that started before it.
    while (lapCursor < lapStarts.length && lapStarts[lapCursor]! < sec) {
      lapCursor++
      lap++
    }
    records.push(toRecord(records.length, sec, r, lap))
  }

  for (let i = 0; i < samples.length; i++) {
    const { r, s } = samples[i]!
    const prev = samples[i - 1]
    if (prev && s === prev.s) continue // duplicate second: keep the first
    push(s, r)
    const next = samples[i + 1]
    if (!next) break
    const gap = next.s - s
    // Hold values across short gaps while the timer runs.
    if (gap > 1 && gap <= maxGap && !stops.some(([a, b]) => a < next.s && b > s)) {
      for (let k = 1; k < gap; k++) push(s + k, r)
    }
  }
  if (records.length < MIN_MOVING_S) throw new FitImportError('too-short', 'Less than a minute of riding in this file.')

  // Indoor by sub-sport; without one, a ride with no GPS fix at all was indoors.
  const hasGps = samples.some(({ r }) => typeof r.position_lat === 'number' && typeof r.position_long === 'number')
  const indoor = subSport !== null && subSport !== 'generic' ? INDOOR_SUB_SPORTS.has(subSport) : !hasGps
  const id = fit.file_ids?.[0]
  const fromFreeGaz = id?.manufacturer === 'development' && id.product_name === 'FreeGaz'
  const device = id ? [id.manufacturer, id.product_name ?? id.garmin_product].filter((x) => typeof x === 'string' && x.length > 0).join(' ') || null : null
  return {
    startedAt: records[0]!.ts - 1000,
    sport,
    subSport,
    indoor,
    device,
    fromFreeGaz,
    records,
    elevationGainM: typeof session?.total_ascent === 'number' ? session.total_ascent : null,
  }
}

function toRecord(t: number, sec: number, r: DecodedRecord, lap: number): RideRecord {
  return {
    t,
    ts: sec * 1000, // FIT timestamps mark the end of each second, like RideRecord.ts
    power: num(r.power),
    cadence: num(r.cadence),
    hr: num(r.heart_rate),
    speed: num(r.enhanced_speed ?? r.speed),
    distance: num(r.distance) ?? 0,
    altitude: num(r.enhanced_altitude ?? r.altitude),
    grade: num(r.grade),
    targetW: num(r.target_power),
    lrBalance: leftBalance(r.left_right_balance),
    coreTemp: num(r.core_temperature),
    skinTemp: null,
    smo2: num(r.saturated_hemoglobin_percent),
    lap,
    rr: [],
    // the parser hands positions back in degrees
    ...(typeof r.position_lat === 'number' && typeof r.position_long === 'number' ? { lat: r.position_lat, lon: r.position_long } : {}),
  }
}

/** FIT stores the flagged side's share; FreeGaz stores % left. */
function leftBalance(b: DecodedRecord['left_right_balance']): number | null {
  if (b === undefined || b === null) return null
  const value = typeof b === 'number' ? b & 0x7f : b.value
  const right = typeof b === 'number' ? (b & 0x80) !== 0 : b.right === true
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return null
  return right ? 100 - value : value
}

/** [stop, start) pairs, in epoch seconds, from timer events. */
function timerStops(events: NonNullable<DecodedFit['events']>): [number, number][] {
  const out: [number, number][] = []
  let stoppedAt: number | null = null
  const timer = events
    .filter((e) => e.event === 'timer')
    .map((e) => ({ type: e.event_type ?? '', s: toSeconds(e.timestamp) }))
    .filter((e): e is { type: string; s: number } => e.s !== null)
    .sort((a, b) => a.s - b.s)
  for (const e of timer) {
    if (e.type.startsWith('stop') && stoppedAt === null) stoppedAt = e.s
    else if (e.type === 'start' && stoppedAt !== null) {
      out.push([stoppedAt, e.s])
      stoppedAt = null
    }
  }
  return out
}

function toSeconds(w: When | undefined): number | null {
  if (w === undefined || w === null) return null
  const ms = w instanceof Date ? w.getTime() : typeof w === 'number' ? w : Date.parse(w)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
