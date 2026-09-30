// Stored rides come from this app, older versions of it, FIT imports and
// backups. Anything missing gets its "no data" value before a screen reads
// it: null for numbers (missing is not zero), empty lists, and the default
// athlete, so one incomplete record can't take a page down.
import type { RideSummary } from './types'

const NUMBERS = [
  'elevationGainM', 'avgPower', 'maxPower', 'np', 'intensityFactor', 'tss', 'vi', 'wkg', 'avgHr', 'maxHr',
  'avgCadence', 'maxCadence', 'avgSpeed', 'maxSpeed', 'ef', 'decouplingPct',
] as const satisfies readonly (keyof RideSummary)[]

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

export function normalizeRide(raw: RideSummary): RideSummary {
  const r = raw as Partial<RideSummary> & Pick<RideSummary, 'id'>
  const out = { ...raw } as RideSummary & Record<string, unknown>
  for (const k of NUMBERS) out[k] = num(r[k])
  out.name = typeof r.name === 'string' && r.name ? r.name : 'Ride'
  out.kind = r.kind ?? 'free'
  out.simulated = r.simulated === true
  out.startedAt = num(r.startedAt) ?? 0
  out.movingS = num(r.movingS) ?? 0
  out.elapsedS = num(r.elapsedS) ?? out.movingS
  out.endedAt = num(r.endedAt) ?? out.startedAt + out.elapsedS * 1000
  out.distanceM = num(r.distanceM) ?? 0
  out.kj = num(r.kj) ?? 0
  out.powerZonesS = list(r.powerZonesS)
  out.hrZonesS = list(r.hrZonesS)
  out.mmp = list(r.mmp)
  out.laps = list(r.laps)
  out.athlete = { ftpW: 200, weightKg: 75, ...r.athlete }
  return out
}
