// Columnar storage for a finished ride's 1 Hz records. Typed arrays with NaN
// for "missing" keep a 3-hour ride around 200 KB in IndexedDB and make whole-
// ride analysis (NP, power curve...) a tight loop.
import type { RideRecord } from './recorder'

export interface RideStreams {
  rideId: string
  length: number
  /** Wall epoch ms of each record's slot end. */
  ts: Float64Array
  power: Float32Array
  cadence: Float32Array
  hr: Float32Array
  speed: Float32Array
  distance: Float32Array
  altitude: Float32Array
  grade: Float32Array
  targetW: Float32Array
  lrBalance: Float32Array
  coreTemp: Float32Array
  skinTemp: Float32Array
  smo2: Float32Array
  lap: Uint16Array
  /** All RR intervals concatenated; rrOffsets[i]..rrOffsets[i+1] belong to record i. */
  rr: Float32Array
  rrOffsets: Uint32Array
}

type NumericKey = 'power' | 'cadence' | 'hr' | 'speed' | 'distance' | 'altitude' | 'grade' | 'targetW' | 'lrBalance' | 'coreTemp' | 'skinTemp' | 'smo2'
export const NUMERIC_KEYS: NumericKey[] = ['power', 'cadence', 'hr', 'speed', 'distance', 'altitude', 'grade', 'targetW', 'lrBalance', 'coreTemp', 'skinTemp', 'smo2']

const nn = (v: number | null): number => (v === null ? Number.NaN : v)
const back = (v: number | undefined): number | null => (v === undefined || Number.isNaN(v) ? null : v)

export function recordsToStreams(rideId: string, records: RideRecord[]): RideStreams {
  const n = records.length
  const s: RideStreams = {
    rideId,
    length: n,
    ts: new Float64Array(n),
    power: new Float32Array(n),
    cadence: new Float32Array(n),
    hr: new Float32Array(n),
    speed: new Float32Array(n),
    distance: new Float32Array(n),
    altitude: new Float32Array(n),
    grade: new Float32Array(n),
    targetW: new Float32Array(n),
    lrBalance: new Float32Array(n),
    coreTemp: new Float32Array(n),
    skinTemp: new Float32Array(n),
    smo2: new Float32Array(n),
    lap: new Uint16Array(n),
    rr: new Float32Array(records.reduce((sum, r) => sum + r.rr.length, 0)),
    rrOffsets: new Uint32Array(n + 1),
  }
  let rrAt = 0
  records.forEach((r, i) => {
    s.ts[i] = r.ts
    for (const k of NUMERIC_KEYS) s[k][i] = nn(r[k])
    s.lap[i] = r.lap
    s.rrOffsets[i] = rrAt
    for (const v of r.rr) s.rr[rrAt++] = v
  })
  s.rrOffsets[n] = rrAt
  return s
}

export function streamsToRecords(s: RideStreams): RideRecord[] {
  const out: RideRecord[] = []
  for (let i = 0; i < s.length; i++) {
    const r: RideRecord = {
      t: i,
      ts: s.ts[i]!,
      power: back(s.power[i]),
      cadence: back(s.cadence[i]),
      hr: back(s.hr[i]),
      speed: back(s.speed[i]),
      distance: back(s.distance[i]) ?? 0,
      altitude: back(s.altitude[i]),
      grade: back(s.grade[i]),
      targetW: back(s.targetW[i]),
      lrBalance: back(s.lrBalance[i]),
      coreTemp: back(s.coreTemp[i]),
      skinTemp: back(s.skinTemp[i]),
      smo2: back(s.smo2[i]),
      lap: s.lap[i]!,
      rr: Array.from(s.rr.subarray(s.rrOffsets[i]!, s.rrOffsets[i + 1]!)),
    }
    out.push(r)
  }
  return out
}

/** A single metric column as (number | null)[] for the metrics functions. */
export function column(s: RideStreams, key: NumericKey): (number | null)[] {
  return Array.from(s[key], (v) => (Number.isNaN(v) ? null : v))
}
