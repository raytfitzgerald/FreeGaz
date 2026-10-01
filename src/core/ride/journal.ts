// Ride journal: an append-only NDJSON log written once per second during a
// ride, so a crash (renderer, main or power) loses at most a couple of
// seconds. Line 1 is metadata; the rest are compact record arrays or events.
// A torn final line (crash mid-write) is ignored on read.
import type { RideRecord } from './recorder'
import type { AthleteSnapshot } from './types'

export const JOURNAL_VERSION = 1

export interface JournalMeta {
  type: 'meta'
  v: number
  rideId: string
  startedAt: number
  name: string
  kind: 'free' | 'workout' | 'route' | 'ftp-test'
  simulated: boolean
  ftpW: number
  weightKg: number
  /** The whole athlete snapshot (HR zones, CP), so a recovered ride keeps its zones. Absent in older journals. */
  athlete?: AthleteSnapshot
  workoutId?: string
  /** JSON snapshot of the workout, so a recovered ride is self-contained. */
  workoutJson?: string
}

export type JournalEvent =
  | { type: 'event'; t: number; ts: number; kind: 'pause' | 'resume' | 'lap' | 'segment' | 'mode' | 'note'; data?: Record<string, unknown> }
  | { type: 'end'; t: number; ts: number }

// Compact positional encoding keeps a 3-hour ride around 1 MB.
// [t, ts, power, cadence, hr, speed, distance, altitude, grade, targetW, lrBalance, coreTemp, skinTemp, smo2, lap, rr]
type RecordTuple = [
  number,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number,
  number[],
  // appended later: position (absent on rides with none, and in older journals)
  number?,
  number?,
]

export function encodeMeta(meta: Omit<JournalMeta, 'type' | 'v'>): string {
  return JSON.stringify({ type: 'meta', v: JOURNAL_VERSION, ...meta })
}

export function encodeRecord(r: RideRecord): string {
  const tuple: RecordTuple = [
    r.t, r.ts, r.power, r.cadence, r.hr, r.speed, r.distance, r.altitude, r.grade,
    r.targetW, r.lrBalance, r.coreTemp, r.skinTemp, r.smo2, r.lap, r.rr,
  ]
  if (r.lat != null && r.lon != null) tuple.push(r.lat, r.lon)
  return JSON.stringify(tuple)
}

export function encodeEvent(e: JournalEvent): string {
  return JSON.stringify(e)
}

export type JournalLine = { kind: 'meta'; meta: JournalMeta } | { kind: 'record'; record: RideRecord } | { kind: 'event'; event: JournalEvent }

export function decodeLine(line: string): JournalLine | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  let v: unknown
  try {
    v = JSON.parse(trimmed)
  } catch {
    return null // torn write
  }
  if (Array.isArray(v)) {
    if (v.length < 16) return null
    const [t, ts, power, cadence, hr, speed, distance, altitude, grade, targetW, lrBalance, coreTemp, skinTemp, smo2, lap, rr, lat, lon] = v as RecordTuple
    const record: RideRecord = { t, ts, power, cadence, hr, speed, distance, altitude, grade, targetW, lrBalance, coreTemp, skinTemp, smo2, lap, rr: Array.isArray(rr) ? rr : [] }
    if (typeof lat === 'number' && typeof lon === 'number') Object.assign(record, { lat, lon })
    return { kind: 'record', record }
  }
  if (v && typeof v === 'object') {
    const o = v as { type?: string }
    if (o.type === 'meta') return { kind: 'meta', meta: v as JournalMeta }
    if (o.type === 'event' || o.type === 'end') return { kind: 'event', event: v as JournalEvent }
  }
  return null
}

export interface ParsedJournal {
  meta: JournalMeta | null
  records: RideRecord[]
  events: JournalEvent[]
  ended: boolean
  /** Lines that could not be parsed (e.g. a torn tail). */
  skipped: number
}

/** Parses a whole journal. Records are de-duplicated by `t` and sorted. */
export function parseJournal(text: string): ParsedJournal {
  const out: ParsedJournal = { meta: null, records: [], events: [], ended: false, skipped: 0 }
  const byT = new Map<number, RideRecord>()
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const l = decodeLine(line)
    if (!l) {
      out.skipped++
      continue
    }
    if (l.kind === 'meta') out.meta = l.meta
    else if (l.kind === 'record') byT.set(l.record.t, l.record)
    else {
      out.events.push(l.event)
      if (l.event.type === 'end') out.ended = true
    }
  }
  out.records = [...byT.values()].sort((a, b) => a.t - b.t)
  return out
}
