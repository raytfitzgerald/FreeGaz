// Fitness data prep from stored rides. Simulated rides never count.
import { computePmc, estimateFtp, mergeMmp, type PmcRow } from '@core/metrics'
import type { RideSummary } from '@core/ride/types'
import { db, type FtpEntry } from './db'

const DAY = 86_400_000

export const isoDay = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function realRides(sinceMs = 0): Promise<RideSummary[]> {
  const rows = await db().rides.where('startedAt').above(sinceMs).toArray()
  return rows.filter((r) => !r.simulated).sort((a, b) => a.startedAt - b.startedAt)
}

export async function pmcSeries(days = 180): Promise<PmcRow[]> {
  // Warm the model up with everything we have; display the last `days`.
  const rides = await realRides(0)
  if (rides.length === 0) return []
  const now = new Date()
  const today = isoDay(now.getTime())
  // calendar days, not 24-hour steps, so a clock change can't shift the range
  const from = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days).getTime())
  return computePmc(
    rides.map((r) => ({ date: isoDay(r.startedAt), tss: r.tss ?? 0 })),
    { from, to: today },
  )
}

export interface WeeklyLoad {
  weekStart: number
  tss: number
  hours: number
  kj: number
  rides: number
}

export async function weeklyLoad(weeks = 16): Promise<WeeklyLoad[]> {
  const now = new Date()
  const monday = now.getDate() - ((now.getDay() + 6) % 7)
  // each week starts on a calendar Monday, so a clock change can't move a ride into the wrong week
  const starts = Array.from({ length: weeks + 1 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), monday + (i - weeks + 1) * 7).getTime())
  const start = starts[0]!
  const rides = await realRides(start)
  const out: WeeklyLoad[] = starts.slice(0, weeks).map((weekStart) => ({ weekStart, tss: 0, hours: 0, kj: 0, rides: 0 }))
  for (const r of rides) {
    let i = starts.findIndex((s) => s > r.startedAt) - 1
    if (i < -1) i = weeks - 1
    const w = out[i]
    if (!w) continue
    w.tss += r.tss ?? 0
    w.hours += r.movingS / 3600
    w.kj += r.kj
    w.rides++
  }
  return out
}

export interface PowerCurve {
  last90: { durationS: number; watts: number }[]
  last365: { durationS: number; watts: number }[]
  eftp: ReturnType<typeof estimateFtp>
}

export async function powerCurve(): Promise<PowerCurve> {
  const rides = await realRides(Date.now() - 365 * DAY)
  let last90: { durationS: number; watts: number }[] = []
  let last365: { durationS: number; watts: number }[] = []
  const cut = Date.now() - 90 * DAY
  for (const r of rides) {
    last365 = mergeMmp(last365, r.mmp)
    if (r.startedAt >= cut) last90 = mergeMmp(last90, r.mmp)
  }
  return { last90, last365, eftp: estimateFtp(last90) }
}

export async function ftpTimeline(): Promise<FtpEntry[]> {
  return db().ftpHistory.orderBy('date').toArray()
}
