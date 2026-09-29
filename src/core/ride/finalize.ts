// Turns a finished session's records into the stored ride: summary row,
// columnar streams and the FIT file. Pure: the renderer persists the output.
import { encodeFitActivity, type FitLapSummary } from '../fit/activity'
import { WPrimeBalance, averagePower, kilojoules, maxPower, normalizedPower, summarizeRide } from '../metrics'
import type { RideRecord } from './recorder'
import { recordsToStreams, type RideStreams } from './streams'
import type { AthleteSnapshot, LapRow, RideKind, RideSummary } from './types'

export interface FinalizeInput {
  rideId: string
  name: string
  kind: RideKind
  simulated: boolean
  startedAt: number
  athlete: AthleteSnapshot
  records: RideRecord[]
  workoutId?: string
  workoutName?: string
  workoutJson?: string
  /** Minutes east of UTC (for the FIT local timestamp). */
  utcOffsetMin: number
  softwareVersion: number
  recovered?: boolean
  now: number
  /** Optional per-lap labels (from workout segments). */
  lapLabels?: string[]
}

export interface FinalizedRide {
  summary: RideSummary
  streams: RideStreams
  fit: Uint8Array | null
}

const mean = (xs: (number | null)[]): number | null => {
  let s = 0
  let n = 0
  for (const x of xs) if (x !== null) {
    s += x
    n++
  }
  return n ? s / n : null
}
const max = (xs: (number | null)[]): number | null => {
  let m: number | null = null
  for (const x of xs) if (x !== null && (m === null || x > m)) m = x
  return m
}
const round = (v: number | null, dp = 0): number | null => (v === null ? null : Math.round(v * 10 ** dp) / 10 ** dp)

export function computeLaps(records: RideRecord[], labels: string[] = []): LapRow[] {
  const laps: LapRow[] = []
  let start = 0
  for (let i = 1; i <= records.length; i++) {
    if (i === records.length || records[i]!.lap !== records[start]!.lap) {
      const slice = records.slice(start, i)
      const power = slice.map((r) => r.power)
      const index = laps.length
      laps.push({
        index,
        startIndex: start,
        endIndex: i - 1,
        durationS: slice.length,
        label: labels[index],
        avgPower: round(averagePower(power)),
        maxPower: round(maxPower(power)),
        np: round(slice.length >= 30 ? normalizedPower(power) : null),
        avgHr: round(mean(slice.map((r) => r.hr))),
        maxHr: max(slice.map((r) => r.hr)),
        avgCadence: round(mean(slice.map((r) => (r.cadence && r.cadence > 0 ? r.cadence : null)))),
        maxCadence: max(slice.map((r) => r.cadence)),
        distanceM: Math.max(0, (slice.at(-1)?.distance ?? 0) - (start > 0 ? records[start - 1]!.distance : 0)),
        kj: (kilojoules(power) ?? 0),
        targetW: round(mean(slice.map((r) => r.targetW))),
      })
      start = i
    }
  }
  return laps
}

export function finalizeRide(input: FinalizeInput): FinalizedRide {
  const { records, athlete } = input
  const power = records.map((r) => r.power)
  const s = summarizeRide({
    power,
    hr: records.map((r) => r.hr),
    cadence: records.map((r) => r.cadence),
    ftp: athlete.ftpW,
    lthr: athlete.lthr,
    maxHr: athlete.maxHr,
    weightKg: athlete.weightKg,
  })
  const laps = computeLaps(records, input.lapLabels)
  const speeds = records.map((r) => r.speed)
  const first = records[0]
  const last = records.at(-1)
  const endedAt = last?.ts ?? input.startedAt
  const startedAt = first ? first.ts - 1000 : input.startedAt

  let gain = 0
  let prevAlt: number | null = null
  for (const r of records) {
    if (r.altitude === null) continue
    if (prevAlt !== null && r.altitude > prevAlt) gain += r.altitude - prevAlt
    prevAlt = r.altitude
  }
  const hasAlt = records.some((r) => r.altitude !== null)

  const summary: RideSummary = {
    id: input.rideId,
    name: input.name,
    kind: input.kind,
    simulated: input.simulated,
    startedAt,
    endedAt,
    elapsedS: Math.round((endedAt - startedAt) / 1000),
    movingS: records.length,
    distanceM: Math.round((last?.distance ?? 0) * 10) / 10,
    elevationGainM: hasAlt ? Math.round(gain) : null,
    avgPower: round(s.avgPower),
    maxPower: round(s.maxPower),
    np: round(s.np),
    intensityFactor: round(s.if, 3),
    tss: round(s.tss, 1),
    kj: Math.round((s.kj ?? 0) * 10) / 10,
    vi: round(s.vi, 2),
    wkg: round(s.wkg, 2),
    avgHr: round(s.avgHr),
    maxHr: round(s.maxHr),
    avgCadence: round(s.avgCadence),
    maxCadence: round(s.maxCadence),
    avgSpeed: round(mean(speeds), 3),
    maxSpeed: round(max(speeds), 3),
    ef: round(s.ef, 2),
    decouplingPct: round(s.decouplingPct, 1),
    powerZonesS: s.powerZonesS,
    hrZonesS: s.hrZonesS,
    mmp: s.mmp.map((p) => ({ durationS: p.durationS, watts: Math.round(p.watts) })),
    laps,
    athlete,
    workoutId: input.workoutId,
    workoutName: input.workoutName,
    workoutJson: input.workoutJson,
    recovered: input.recovered,
    createdAt: input.now,
    updatedAt: input.now,
  }

  let fit: Uint8Array | null = null
  if (records.length > 0) {
    const wb = new WPrimeBalance({ cp: athlete.cpW ?? athlete.ftpW, wPrimeJ: athlete.wPrimeJ ?? 20_000 })
    const wbal = power.map((p) => wb.push(p, 1))
    const fitLaps: FitLapSummary[] = (laps.length ? laps : computeLaps(records)).map((l) => ({
      startIndex: l.startIndex,
      endIndex: l.endIndex,
      avgPower: l.avgPower,
      maxPower: l.maxPower,
      np: l.np,
      avgHr: l.avgHr,
      maxHr: l.maxHr,
      avgCadence: l.avgCadence,
      maxCadence: l.maxCadence,
      distanceM: l.distanceM,
      kj: l.kj,
    }))
    fit = encodeFitActivity({
      records,
      wbal,
      laps: fitLaps,
      session: {
        avgPower: summary.avgPower,
        maxPower: summary.maxPower,
        np: summary.np,
        tss: summary.tss,
        intensityFactor: summary.intensityFactor,
        kj: summary.kj,
        avgHr: summary.avgHr,
        maxHr: summary.maxHr,
        avgCadence: summary.avgCadence,
        maxCadence: summary.maxCadence,
        avgSpeed: summary.avgSpeed,
        maxSpeed: summary.maxSpeed,
        totalAscentM: summary.elevationGainM,
        thresholdPowerW: athlete.ftpW,
      },
      utcOffsetMin: input.utcOffsetMin,
      softwareVersion: input.softwareVersion,
      serialNumber: hashSerial(input.rideId),
    })
    summary.fit = { fileName: fitFileName(summary), bytes: fit.byteLength }
  }

  return { summary, streams: recordsToStreams(input.rideId, records), fit }
}

/** "2026-09-29 0712 - Sweet Spot 3x15.fit" in local time. */
export function fitFileName(s: Pick<RideSummary, 'startedAt' | 'name'>, tzOffsetMin = -new Date(s.startedAt).getTimezoneOffset()): string {
  const d = new Date(s.startedAt + tzOffsetMin * 60_000)
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}${p(d.getUTCMinutes())}`
  return `${stamp} - ${s.name}.fit`
}

function hashSerial(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
