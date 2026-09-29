// Ghosts for Challenge rides: a previous effort as distance along the route
// over moving time (the RoutePlayer's GhostSample). A ride keeps its ghost as
// the cumulative distance of its 1 Hz records, which is compact (one number
// per second) and needs nothing the ride doesn't already record.
import { advanceAtRecordedSpeed, type GhostSample } from '../routes/player'
import type { ProfilePoint } from '../routes/model'

/**
 * A ghost from a ride's per-second cumulative distance. Record k covers
 * moving seconds [k, k+1), so its distance is where the rider was k + 1 s in.
 * The series stops at the first sample that reaches `untilM` (the route's
 * finish), so a cool-down ridden after the finish never joins the race.
 * Non-finite entries (missing data) are skipped.
 */
export function ghostFromDistances(distances: ArrayLike<number>, untilM = Number.POSITIVE_INFINITY): GhostSample[] {
  const out: GhostSample[] = [{ tS: 0, distM: 0 }]
  for (let k = 0; k < distances.length; k++) {
    const d = distances[k]!
    if (!Number.isFinite(d)) continue
    out.push({ tS: k + 1, distM: d })
    if (d >= untilM) break
  }
  return out
}

/** The same effort seen from `tS` seconds and `distM` metres further on: what a player started mid-ride races. */
export function shiftGhost(samples: readonly GhostSample[], tS: number, distM: number): GhostSample[] {
  if (tS === 0 && distM === 0) return samples.slice()
  return samples.map((s) => ({ tS: s.tS - tS, distM: s.distM - distM }))
}

/**
 * The route's own recorded pace as a ghost (routes from a timed file), one
 * sample every `stepS` seconds, repeated for `laps` laps. Null when the
 * profile has no recorded speed.
 */
export function recordedPaceGhost(profile: readonly ProfilePoint[], laps = 1, stepS = 5): GhostSample[] | null {
  if (profile.length < 2 || !profile.every((p) => p.recordedMps !== undefined && p.recordedMps > 0)) return null
  if (!(stepS > 0)) throw new RangeError('stepS must be > 0')
  const end = profile[profile.length - 1]!.distM
  const lap: GhostSample[] = [{ tS: 0, distM: 0 }]
  let d = 0
  let t = 0
  while (d < end - 1e-9) {
    const r = advanceAtRecordedSpeed(profile, d, stepS)
    if (!(r.usedS > 0)) break
    t += r.usedS
    d = r.distM
    lap.push({ tS: t, distM: d })
  }
  const out: GhostSample[] = []
  for (let k = 0; k < Math.max(1, Math.floor(laps)); k++) {
    for (const [i, s] of lap.entries()) if (k === 0 || i > 0) out.push({ tS: s.tS + k * t, distM: s.distM + k * end })
  }
  return out
}

/** When the ghost reached `distM`, s, by linear interpolation; null if it never did. */
export function ghostTimeAt(samples: readonly GhostSample[], distM: number): number | null {
  let prev: GhostSample | undefined
  for (const s of samples) {
    if (s.distM >= distM) {
      if (!prev || !(s.distM > prev.distM)) return s.tS
      return prev.tS + ((s.tS - prev.tS) * (distM - prev.distM)) / (s.distM - prev.distM)
    }
    prev = s
  }
  return null
}
