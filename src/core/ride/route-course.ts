// Course arithmetic for route rides, shared by RoutePlan and the route
// screens: which routes can be ridden as laps, elevation gained along the
// way, and how long the rest of the route takes at a steady power or at the
// route's recorded pace. Pure, and cheap enough for the engine rate.
import { steadySpeedForPower, type BikeParams } from '../physics/bike'
import { haversineM } from '../routes/geo'
import { gradeIntegral, profileIndex } from '../routes/lookup'
import type { ProfilePoint, Route } from '../routes/model'
import { DEFAULT_PROFILE_OPTIONS } from '../routes/smooth'

/** A route whose finish is within this distance of its start can be ridden as laps, m. */
export const LOOP_CLOSE_M = 50
/** ...as long as it is at least this long, m, so a short out-and-back stub never counts. */
const LOOP_MIN_LENGTH_M = 500

/** True when the route ends where it starts, so it can be ridden for several laps. */
export function isLoopRoute(route: Pick<Route, 'points' | 'distanceM'>): boolean {
  const a = route.points[0]
  const b = route.points[route.points.length - 1]
  if (!a || !b || !(route.distanceM >= LOOP_MIN_LENGTH_M)) return false
  return haversineM(a.lat, a.lon, b.lat, b.lon) <= LOOP_CLOSE_M
}

/**
 * Elevation gained from the start to each point, m, with the same 2 m
 * hysteresis as the route summary (smooth.ts elevationGainLoss): the last
 * value equals the route's elevationGainM, so "gained + to go" always adds up
 * to the number on the route card. A rise counts once it has climbed
 * `thresholdM` above its trough, so the running value never lags a climb by
 * more than that.
 */
export function cumulativeGain(ele: ArrayLike<number>, thresholdM: number = DEFAULT_PROFILE_OPTIONS.gainThresholdM): Float64Array {
  const n = ele.length
  const out = new Float64Array(n)
  if (n === 0) return out
  if (!(thresholdM > 0)) {
    for (let i = 1; i < n; i++) out[i] = out[i - 1]! + Math.max(0, ele[i]! - ele[i - 1]!)
    return out
  }
  let dir: -1 | 0 | 1 = 0
  let lo = ele[0]!
  let hi = ele[0]!
  let anchor = ele[0]! // the last turning point
  let extreme = ele[0]! // the furthest point from it in the current direction
  let committed = 0
  for (let i = 1; i < n; i++) {
    const e = ele[i]!
    if (dir === 0) {
      lo = Math.min(lo, e)
      hi = Math.max(hi, e)
      if (e - lo >= thresholdM) {
        dir = 1
        anchor = lo
        extreme = e
      } else if (hi - e >= thresholdM) {
        dir = -1
        anchor = hi
        extreme = e
      }
    } else if (dir === 1) {
      if (e > extreme) extreme = e
      else if (extreme - e >= thresholdM) {
        committed += extreme - anchor
        anchor = extreme
        extreme = e
        dir = -1
      }
    } else if (e < extreme) {
      extreme = e
    } else if (e - extreme >= thresholdM) {
      anchor = extreme
      extreme = e
      dir = 1
    }
    out[i] = committed + (dir === 1 ? extreme - anchor : 0)
  }
  return out
}

/** A per-point value (such as cumulativeGain) at `distM`, linear between profile points. */
export function valueAtDistance(profile: readonly ProfilePoint[], values: ArrayLike<number>, distM: number): number {
  const i = profileIndex(profile, distM)
  const a = profile[i]!
  const b = profile[i + 1]
  const va = values[i]!
  if (!b || !(b.distM > a.distM)) return va
  const f = Math.max(0, Math.min(1, (distM - a.distM) / (b.distM - a.distM)))
  return va + (values[i + 1]! - va) * f
}

/** The profile cut into fixed-length pieces with their mean grade, for travel-time estimates. */
export interface GradeChunks {
  chunkM: number
  lengthM: number
  /** Mean grade of chunk j, which covers [j·chunkM, min((j+1)·chunkM, lengthM)], %. */
  gradePct: Float64Array
}

export function gradeChunks(profile: readonly ProfilePoint[], chunkM = 100): GradeChunks {
  if (!(chunkM > 0)) throw new RangeError('chunkM must be > 0')
  const start = profile[0]!.distM
  const lengthM = profile[profile.length - 1]!.distM - start
  const n = Math.max(1, Math.ceil(lengthM / chunkM - 1e-9))
  const gradePct = new Float64Array(n)
  for (let j = 0; j < n; j++) {
    const a = j * chunkM
    const b = Math.min(lengthM, a + chunkM)
    gradePct[j] = b > a ? gradeIntegral(profile, start + a, start + b) / (b - a) : 0
  }
  return { chunkM, lengthM, gradePct }
}

/** Steady speed on each chunk at `powerW`, m/s (0 where the rider cannot move). */
export function chunkSpeeds(chunks: GradeChunks, powerW: number, bike: Readonly<BikeParams>): Float64Array {
  return Float64Array.from(chunks.gradePct, (g) => steadySpeedForPower(powerW, g, bike))
}

/**
 * Time to ride from `aM` to `bM` along one lap at the chunks' steady speeds,
 * s (acceleration ignored: an ETA, not a simulation). Infinity when a chunk
 * in the way has no forward speed, e.g. a climb at 0 W.
 */
export function timeAtSpeeds(chunks: GradeChunks, speeds: ArrayLike<number>, aM: number, bM: number): number {
  const a = Math.max(0, aM)
  const b = Math.min(chunks.lengthM, bM)
  if (!(b > a)) return 0
  let t = 0
  for (let j = Math.min(speeds.length - 1, Math.floor(a / chunks.chunkM)); j < speeds.length; j++) {
    const from = Math.max(a, j * chunks.chunkM)
    const to = Math.min(b, (j + 1) * chunks.chunkM, chunks.lengthM)
    if (to > from) {
      const v = speeds[j]!
      if (!(v > 0)) return Number.POSITIVE_INFINITY
      t += (to - from) / v
    }
    if ((j + 1) * chunks.chunkM >= b) break
  }
  return t
}

/**
 * Cumulative time at the route's recorded pace at each profile point, s, or
 * null when the profile has no recorded speed. Speed is linear in distance
 * between points (as the player rides it), so crossing a segment takes
 * ln(v1 / v0) / k with k the speed gradient.
 */
export function recordedPaceTimes(profile: readonly ProfilePoint[]): Float64Array | null {
  if (!profile.every((p) => p.recordedMps !== undefined && p.recordedMps > 0)) return null
  const out = new Float64Array(profile.length)
  for (let i = 1; i < profile.length; i++) {
    out[i] = out[i - 1]! + segmentTime(profile[i - 1]!, profile[i]!, profile[i]!.distM)
  }
  return out
}

/** Time at the recorded pace from `aM` to `bM`, s (see recordedPaceTimes). */
export function recordedTimeBetween(profile: readonly ProfilePoint[], times: ArrayLike<number>, aM: number, bM: number): number {
  return Math.max(0, recordedTimeAt(profile, times, bM) - recordedTimeAt(profile, times, aM))
}

function recordedTimeAt(profile: readonly ProfilePoint[], times: ArrayLike<number>, distM: number): number {
  const i = profileIndex(profile, distM)
  const a = profile[i]!
  const b = profile[i + 1]
  if (!b) return times[i]!
  return times[i]! + segmentTime(a, b, Math.max(a.distM, Math.min(b.distM, distM)))
}

/** Time from segment start `a` to distance `x` (a.distM <= x <= b.distM) with speed linear in distance. */
function segmentTime(a: ProfilePoint, b: ProfilePoint, x: number): number {
  const dx = x - a.distM
  if (!(dx > 0)) return 0
  const va = a.recordedMps!
  const k = (b.recordedMps! - va) / (b.distM - a.distM)
  return Math.abs(k) < 1e-12 ? dx / va : Math.log1p((k * dx) / va) / k
}

/**
 * Spacing of the km markers a point-to-point ride is split into (one lap in
 * the recording each): 1 km, or 5 km past 30 km and 10 km past 150 km, so a
 * long route never turns into a hundred laps.
 */
export function markerSpacingM(totalM: number): number {
  return totalM > 150_000 ? 10_000 : totalM > 30_000 ? 5000 : 1000
}
