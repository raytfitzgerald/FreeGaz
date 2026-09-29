import { db } from './db'

/** Best power for each duration over the last `days` (non-simulated rides only). */
export async function bestPowers(durations: number[], days = 90): Promise<Record<number, number>> {
  const since = Date.now() - days * 86_400_000
  const rides = await db().rides.where('startedAt').above(since).toArray()
  const out: Record<number, number> = {}
  for (const r of rides) {
    if (r.simulated) continue
    for (const p of r.mmp) {
      if (!durations.includes(p.durationS)) continue
      if (!(p.durationS in out) || p.watts > out[p.durationS]!) out[p.durationS] = p.watts
    }
  }
  return out
}
