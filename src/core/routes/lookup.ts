// Profile lookups for the ride engine and the UI. The profile is piecewise
// linear between its points, so every value at a distance is interpolated
// from the two points around it, and averages are exact integrals of that
// piecewise-linear function.
import { clamp } from './filters'
import { lerpLon } from './geo'
import type { ProfilePoint } from './model'

export interface ProfileSample {
  /** The query distance, clamped to the route. */
  distM: number
  ele: number
  gradePct: number
  lat: number
  lon: number
  /** Index of the last profile point at or before distM. */
  index: number
  /** Present when the profile has recorded speeds. */
  recordedMps?: number
}

export interface UpcomingPoint extends ProfilePoint {
  /** Distance ahead of the query position, m. Keeps increasing across a loop's start line. */
  aheadM: number
}

export interface LoopOption {
  /** The route is ridden as a loop: looking past the end continues from the start. */
  loop?: boolean
}

/** Index of the last profile point at or before `distM` (binary search, clamped to the profile). */
export function profileIndex(profile: readonly ProfilePoint[], distM: number): number {
  const n = profile.length
  if (n === 0) throw new RangeError('empty profile')
  if (!(distM > profile[0]!.distM)) return 0
  if (distM >= profile[n - 1]!.distM) return n - 1
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1
    if (profile[mid]!.distM <= distM) lo = mid
    else hi = mid
  }
  return lo
}

/** Everything about the route at `distM`, linearly interpolated. Distances outside the route clamp to its ends. */
export function sampleAt(profile: readonly ProfilePoint[], distM: number): ProfileSample {
  const index = profileIndex(profile, distM)
  const a = profile[index]!
  const b = profile[index + 1]
  const d = b ? clamp(Number.isNaN(distM) ? a.distM : distM, a.distM, b.distM) : a.distM
  const span = b ? b.distM - a.distM : 0
  const f = b && span > 0 ? (d - a.distM) / span : 0
  const q = b ?? a
  const s: ProfileSample = {
    distM: d,
    ele: a.ele + (q.ele - a.ele) * f,
    gradePct: a.gradePct + (q.gradePct - a.gradePct) * f,
    lat: a.lat + (q.lat - a.lat) * f,
    lon: lerpLon(a.lon, q.lon, f),
    index,
  }
  if (a.recordedMps !== undefined && q.recordedMps !== undefined) s.recordedMps = a.recordedMps + (q.recordedMps - a.recordedMps) * f
  return s
}

/** Integral of grade over [fromM, toM] (clamped to the route), in % x m. Divide by the length for the mean grade. */
export function gradeIntegral(profile: readonly ProfilePoint[], fromM: number, toM: number): number {
  const n = profile.length
  const start = profile[0]!.distM
  const end = profile[n - 1]!.distM
  const a = clamp(fromM, start, end)
  const b = clamp(toM, start, end)
  if (!(b > a)) return 0
  let area = 0
  let x = a
  for (let i = profileIndex(profile, a); x < b && i < n - 1; i++) {
    const p = profile[i]!
    const q = profile[i + 1]!
    const to = Math.min(b, q.distM)
    if (!(to > x)) continue
    const span = q.distM - p.distM
    const g0 = p.gradePct + ((q.gradePct - p.gradePct) * (x - p.distM)) / span
    const g1 = p.gradePct + ((q.gradePct - p.gradePct) * (to - p.distM)) / span
    area += ((g0 + g1) / 2) * (to - x)
    x = to
  }
  return area
}

/**
 * Mean grade over the next `aheadM` metres: what to send the trainer so it
 * has the upcoming gradient by the time the rider gets there (the player uses
 * speed x ~1.5 s). Without `loop`, the window stops at the finish; with it,
 * it wraps to the start. aheadM <= 0 gives the grade at the position.
 */
export function lookaheadGrade(profile: readonly ProfilePoint[], distM: number, aheadM: number, opts: LoopOption = {}): number {
  const start = profile[0]!.distM
  const end = profile[profile.length - 1]!.distM
  const length = end - start
  const here = sampleAt(profile, distM)
  if (!(aheadM > 0) || !(length > 0)) return here.gradePct
  if (!opts.loop) {
    const to = Math.min(end, here.distM + aheadM)
    return to > here.distM ? gradeIntegral(profile, here.distM, to) / (to - here.distM) : here.gradePct
  }
  let left = aheadM
  const laps = Math.floor(left / length)
  let area = laps > 0 ? laps * gradeIntegral(profile, start, end) : 0
  left -= laps * length
  let x = here.distM
  while (left > 1e-9) {
    const to = Math.min(end, x + left)
    area += gradeIntegral(profile, x, to)
    left -= to - x
    x = to >= end ? start : to
  }
  return area / aheadM
}

/**
 * The profile from `distM` to `distM + windowM`, for the elevation strip: an
 * interpolated point at each end and every profile point in between, each
 * tagged with how far ahead it is. Without `loop` it stops at the finish;
 * with it, it continues from the start (the start point, which coincides
 * with the finish, is not repeated).
 */
export function upcoming(profile: readonly ProfilePoint[], distM: number, windowM: number, opts: LoopOption = {}): UpcomingPoint[] {
  const n = profile.length
  const start = profile[0]!.distM
  const end = profile[n - 1]!.distM
  const here = sampleAt(profile, distM)
  const out: UpcomingPoint[] = [toUpcoming(here, 0)]
  if (!(windowM > 0)) return out
  let x = here.distM
  let left = windowM
  let ahead = 0
  for (;;) {
    const to = Math.min(end, x + left)
    for (let i = profileIndex(profile, x) + 1; i < n && profile[i]!.distM < to; i++) {
      const p = profile[i]!
      out.push({ ...p, aheadM: ahead + p.distM - x })
    }
    if (to > x) out.push(toUpcoming(sampleAt(profile, to), ahead + to - x))
    ahead += to - x
    left -= to - x
    if (!opts.loop || left <= 1e-9 || !(end > start)) break
    x = start
  }
  return out
}

function toUpcoming(s: ProfileSample, aheadM: number): UpcomingPoint {
  const p: UpcomingPoint = { distM: s.distM, ele: s.ele, gradePct: s.gradePct, lat: s.lat, lon: s.lon, aheadM }
  if (s.recordedMps !== undefined) p.recordedMps = s.recordedMps
  return p
}
