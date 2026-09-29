// The elevation pipeline: raw track -> ride profile (see model.ts).
//
//   1. fill      Missing elevation is interpolated linearly on distance and
//                held flat before the first / after the last known value. A
//                file with no elevation at all rides flat at 0 m.
//   2. resample  To a fixed spacing (10 m) by linear interpolation on
//                distance (lat/lon/ele/time). At 36 km/h that is one sample
//                per second, about as fast as a trainer's resistance can
//                follow.
//   3. despike   Running median over 5 samples = 50 m (Tukey 1977), with
//                Tukey's end-point rule. Removes spikes up to 2 samples wide
//                (GPS altitude glitches, DEM voids, single bad points) and
//                leaves monotone climbs untouched.
//   4. smooth    Savitzky-Golay, 11 samples = 100 m, quadratic (Savitzky &
//                Golay 1964; Schafer 2011). Symmetric weights make it
//                zero-phase, so a climb starts where it really starts. At
//                10 m spacing it passes hills longer than ~250 m at >= 99 %,
//                is -3 dB at ~100 m wavelength, and cuts white-noise sigma to
//                0.46x. Edges use the polynomial fitted to the first/last
//                window (SciPy mode='interp').
//   5. grade     Elevation change over a centred 50 m baseline (shortened at
//                the route ends), clamped to +/-25 %, then rate-limited to
//                1.5 % per 10 m by a zero-phase forward/backward limiter.
//                The central difference has a null at a 50 m wavelength,
//                which also suppresses the SG filter's first sidelobe. Almost
//                no road holds 25 % for 50 m (the steepest streets reach
//                ~35 % only at their single steepest point), and 25 % is at
//                or beyond the SIM range of current smart trainers. The rate
//                limit stops a DEM step from slamming the flywheel: at
//                36 km/h it allows at most 1.5 % per second. Slope scaling
//                for "feel" is applied later by the trainer controller;
//                speed uses this true grade.
//   6. gain      Elevation gain/loss with 2 m hysteresis on the smoothed
//                profile: swings smaller than the threshold never count.
//                Measured on 10 km of +/-1 m white noise, steps 3-4 leave
//                ~0.2 m sigma of slow wiggles whose peak-to-trough swings
//                still reach ~1.3 m, so a 1 m threshold counts ~15 m of
//                phantom climbing where 2 m counts none. Real climbs count
//                in full either way (peak minus trough).
//   7. speed     With timestamps: speed over a 100 m window of *moving*
//                time, for Steady mode. Each raw interval's speed is clamped
//                to 1..30 m/s first, so a stop at a junction costs a few
//                seconds instead of freezing the replay, and a GPS teleport
//                cannot become a 200 km/h sprint.
// Grade and elevation can disagree slightly where the clamp or rate limit
// bites; elevation (display, gain) stays true to the smoothed data and grade
// is what the rider feels. All windows are options, in metres.
import { clamp, limitRate, runningMedian, savitzkyGolay } from './filters'
import { lerpLon } from './geo'
import type { ProfilePoint, RoutePoint, RouteSummary } from './model'

export interface ProfileOptions {
  /** Resampling spacing, m. */
  spacingM?: number
  /** Running-median window, m (rounded to an odd number of samples; 0 disables). */
  spikeWindowM?: number
  /** Savitzky-Golay window, m (rounded to an odd number of samples; 0 disables). */
  smoothWindowM?: number
  /** Savitzky-Golay polynomial order. */
  smoothOrder?: number
  /** Grade is the elevation change over this centred baseline, m. */
  gradeBaselineM?: number
  /** Grade clamp, +/- %. */
  maxGradePct?: number
  /** Largest grade change allowed per 10 m, % (Infinity disables). */
  maxGradeChangePer10mPct?: number
  /** Hysteresis for elevation gain/loss, m. */
  gainThresholdM?: number
  /** Recorded speed is the mean over this window, m. */
  speedWindowM?: number
  /** Raw interval speeds are clamped to this range, m/s. */
  minRecordedMps?: number
  maxRecordedMps?: number
}

export const DEFAULT_PROFILE_OPTIONS: Readonly<Required<ProfileOptions>> = {
  spacingM: 10,
  spikeWindowM: 50,
  smoothWindowM: 100,
  smoothOrder: 2,
  gradeBaselineM: 50,
  maxGradePct: 25,
  maxGradeChangePer10mPct: 1.5,
  gainThresholdM: 2,
  speedWindowM: 100,
  minRecordedMps: 1,
  maxRecordedMps: 30,
}

/** Raw points -> resampled, smoothed profile with grade (and recorded speed when timed). */
export function buildProfile(points: readonly RoutePoint[], opts?: ProfileOptions): ProfilePoint[] {
  const o = resolveOptions(opts)
  const dist = relativeDistances(points)
  const grid = gridDistances(dist[dist.length - 1]!, o.spacingM)
  const lat = resample(dist, grid, linear(Float64Array.from(points, (p) => p.lat)))
  const lons = Float64Array.from(points, (p) => p.lon)
  const lon = resample(dist, grid, (j, f) => lerpLon(lons[j]!, lons[j + 1]!, f))
  const rawEle = resample(dist, grid, linear(fillElevation(points)))
  const despiked = runningMedian(rawEle, oddSamples(o.spikeWindowM / o.spacingM))
  const ele = savitzkyGolay(despiked, oddSamples(o.smoothWindowM / o.spacingM), o.smoothOrder)
  const grade = gradeProfile(grid, ele, o)
  const speed = recordedSpeed(points, grid, o)
  return Array.from(grid, (distM, k) => {
    const p: ProfilePoint = { distM, ele: ele[k]!, gradePct: grade[k]!, lat: lat[k]!, lon: lon[k]! }
    if (speed) p.recordedMps = speed[k]!
    return p
  })
}

/** Distance, elevation gain/loss (with hysteresis), grade and elevation range of a profile. */
export function summarize(profile: readonly ProfilePoint[], opts?: ProfileOptions): RouteSummary {
  const first = profile[0]
  const last = profile[profile.length - 1]
  if (!first || !last) {
    return { distanceM: 0, elevationGainM: 0, elevationLossM: 0, maxGradePct: 0, minGradePct: 0, minEle: 0, maxEle: 0 }
  }
  const { gainM, lossM } = elevationGainLoss(
    profile.map((p) => p.ele),
    resolveOptions(opts).gainThresholdM,
  )
  let maxGradePct = -Infinity
  let minGradePct = Infinity
  let minEle = Infinity
  let maxEle = -Infinity
  for (const p of profile) {
    maxGradePct = Math.max(maxGradePct, p.gradePct)
    minGradePct = Math.min(minGradePct, p.gradePct)
    minEle = Math.min(minEle, p.ele)
    maxEle = Math.max(maxEle, p.ele)
  }
  return { distanceM: last.distM - first.distM, elevationGainM: gainM, elevationLossM: lossM, maxGradePct, minGradePct, minEle, maxEle }
}

/**
 * Total climbing and descending with hysteresis: a rise only counts once the
 * elevation has moved `thresholdM` away from the last turning point, and then
 * it counts in full (peak minus trough). Wiggles smaller than the threshold
 * never count, so noise cannot inflate the total the way summing every
 * positive step does. A threshold <= 0 sums every step.
 */
export function elevationGainLoss(ele: ArrayLike<number>, thresholdM: number): { gainM: number; lossM: number } {
  const n = ele.length
  let gainM = 0
  let lossM = 0
  if (n < 2) return { gainM, lossM }
  if (!(thresholdM > 0)) {
    for (let i = 1; i < n; i++) {
      const d = ele[i]! - ele[i - 1]!
      if (d > 0) gainM += d
      else lossM -= d
    }
    return { gainM, lossM }
  }
  let dir: -1 | 0 | 1 = 0
  let lo = ele[0]!
  let hi = ele[0]!
  let anchor = ele[0]! // the last turning point
  let extreme = ele[0]! // the furthest point from it in the current direction
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
        gainM += extreme - anchor
        anchor = extreme
        extreme = e
        dir = -1
      }
    } else if (e < extreme) {
      extreme = e
    } else if (e - extreme >= thresholdM) {
      lossM += anchor - extreme
      anchor = extreme
      extreme = e
      dir = 1
    }
  }
  if (dir === 1) gainM += extreme - anchor
  else if (dir === -1) lossM += anchor - extreme
  return { gainM, lossM }
}

/**
 * Smoothed recorded speed at each of `grid` (distances from the first point),
 * m/s, or null when the points have no usable timestamps (fewer than two, or
 * under half of the points). Interior gaps in time are interpolated on
 * distance; untimed ends move at the timed stretch's mean speed. Each raw
 * interval's speed is clamped to [minRecordedMps, maxRecordedMps] (a stop, or
 * time running backwards, cannot stall or teleport the replay), then the
 * result is total distance / total moving time over a centred window.
 */
export function recordedSpeed(points: readonly RoutePoint[], grid: ArrayLike<number>, opts?: ProfileOptions): Float64Array | null {
  const o = resolveOptions(opts)
  if (points.length < 2) return null
  const dist = relativeDistances(points)
  const times = filledTimes(points, dist, o)
  if (!times) return null
  const n = points.length
  const moving = new Float64Array(n) // cumulative moving time, s
  for (let i = 1; i < n; i++) {
    const dd = dist[i]! - dist[i - 1]!
    const dt = times[i]! - times[i - 1]!
    const v = dt > 0 ? clamp(dd / dt, o.minRecordedMps, o.maxRecordedMps) : o.maxRecordedMps
    moving[i] = moving[i - 1]! + dd / v
  }
  const total = dist[n - 1]!
  const half = o.speedWindowM / 2
  const out = new Float64Array(grid.length)
  for (let k = 0; k < grid.length; k++) {
    const a = Math.max(0, grid[k]! - half)
    const b = Math.min(total, grid[k]! + half)
    const dt = interpAt(dist, moving, b) - interpAt(dist, moving, a)
    out[k] = dt > 0 ? clamp((b - a) / dt, o.minRecordedMps, o.maxRecordedMps) : o.maxRecordedMps
  }
  return out
}

/** Elevation per point with gaps interpolated on distance (held flat past the ends; 0 m when there is none). */
export function fillElevation(points: readonly RoutePoint[]): Float64Array {
  const n = points.length
  const out = new Float64Array(n)
  let prev = -1
  for (let i = 0; i < n; i++) {
    const e = points[i]!.ele
    if (e === null || !Number.isFinite(e)) continue
    out[i] = e
    if (prev === -1) out.fill(e, 0, i)
    else if (i - prev > 1) {
      const d0 = points[prev]!.distM
      const span = points[i]!.distM - d0
      const e0 = out[prev]!
      for (let k = prev + 1; k < i; k++) out[k] = span > 0 ? e0 + ((e - e0) * (points[k]!.distM - d0)) / span : e0
    }
    prev = i
  }
  if (prev >= 0) out.fill(out[prev]!, prev + 1)
  return out
}

/** Resampling distances: every multiple of `spacingM` below the end, then the end itself. */
export function gridDistances(totalM: number, spacingM: number): Float64Array {
  const whole = Math.floor(totalM / spacingM + 1e-9)
  const n = Math.abs(totalM - whole * spacingM) < 1e-6 ? whole + 1 : whole + 2
  const grid = new Float64Array(Math.max(2, n))
  for (let k = 0; k < grid.length - 1; k++) grid[k] = k * spacingM
  grid[grid.length - 1] = totalM
  return grid
}

// ---------------------------------------------------------------------------

function resolveOptions(opts: ProfileOptions = {}): Required<ProfileOptions> {
  const d = DEFAULT_PROFILE_OPTIONS
  const o: Required<ProfileOptions> = {
    spacingM: opts.spacingM ?? d.spacingM,
    spikeWindowM: opts.spikeWindowM ?? d.spikeWindowM,
    smoothWindowM: opts.smoothWindowM ?? d.smoothWindowM,
    smoothOrder: opts.smoothOrder ?? d.smoothOrder,
    gradeBaselineM: opts.gradeBaselineM ?? d.gradeBaselineM,
    maxGradePct: opts.maxGradePct ?? d.maxGradePct,
    maxGradeChangePer10mPct: opts.maxGradeChangePer10mPct ?? d.maxGradeChangePer10mPct,
    gainThresholdM: opts.gainThresholdM ?? d.gainThresholdM,
    speedWindowM: opts.speedWindowM ?? d.speedWindowM,
    minRecordedMps: opts.minRecordedMps ?? d.minRecordedMps,
    maxRecordedMps: opts.maxRecordedMps ?? d.maxRecordedMps,
  }
  const positive = ['spacingM', 'gradeBaselineM', 'maxGradePct', 'maxGradeChangePer10mPct', 'speedWindowM', 'minRecordedMps'] as const
  for (const key of positive) if (!(o[key] > 0)) throw new RangeError(`${key} must be > 0`)
  if (!Number.isFinite(o.spacingM)) throw new RangeError('spacingM must be finite')
  if (!(o.spikeWindowM >= 0 && o.smoothWindowM >= 0 && o.smoothOrder >= 0)) throw new RangeError('smoothing windows and order must be >= 0')
  if (!(o.maxRecordedMps > o.minRecordedMps)) throw new RangeError('maxRecordedMps must exceed minRecordedMps')
  return o
}

/** Distances relative to the first point, validated to be non-decreasing with a positive total. */
function relativeDistances(points: readonly RoutePoint[]): Float64Array {
  if (points.length < 2) throw new RangeError('a route needs at least two points')
  const d0 = points[0]!.distM
  const dist = Float64Array.from(points, (p) => p.distM - d0)
  for (let i = 1; i < dist.length; i++) {
    if (!(dist[i]! >= dist[i - 1]!)) throw new RangeError('point distances must be finite and non-decreasing')
  }
  if (!(dist[dist.length - 1]! > 0)) throw new RangeError('a route needs a non-zero length')
  return dist
}

/** Samples a piecewise function of distance at `at` (ascending); `value(j, f)` interpolates segment j at fraction f. */
function resample(dist: Float64Array, at: ArrayLike<number>, value: (j: number, f: number) => number): Float64Array {
  const out = new Float64Array(at.length)
  const last = dist.length - 2
  let j = 0
  for (let k = 0; k < at.length; k++) {
    const x = at[k]!
    while (j < last && dist[j + 1]! <= x) j++
    const x0 = dist[j]!
    const span = dist[j + 1]! - x0
    out[k] = value(j, span > 0 ? clamp((x - x0) / span, 0, 1) : 0)
  }
  return out
}

function linear(ys: ArrayLike<number>): (j: number, f: number) => number {
  return (j, f) => ys[j]! + (ys[j + 1]! - ys[j]!) * f
}

function interpAt(xs: ArrayLike<number>, ys: ArrayLike<number>, x: number): number {
  const n = xs.length
  if (x <= xs[0]!) return ys[0]!
  if (x >= xs[n - 1]!) return ys[n - 1]!
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1
    if (xs[mid]! <= x) lo = mid
    else hi = mid
  }
  const span = xs[hi]! - xs[lo]!
  return span > 0 ? ys[lo]! + ((ys[hi]! - ys[lo]!) * (x - xs[lo]!)) / span : ys[lo]!
}

function gradeProfile(dist: Float64Array, ele: Float64Array, o: Required<ProfileOptions>): Float64Array {
  const n = dist.length
  const total = dist[n - 1]!
  const half = o.gradeBaselineM / 2
  const raw = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, dist[k]! - half)
    const b = Math.min(total, dist[k]! + half)
    const g = b > a ? (100 * (interpAt(dist, ele, b) - interpAt(dist, ele, a))) / (b - a) : 0
    raw[k] = clamp(g, -o.maxGradePct, o.maxGradePct)
  }
  const maxStep = new Float64Array(n - 1)
  for (let k = 0; k < n - 1; k++) maxStep[k] = (o.maxGradeChangePer10mPct * (dist[k + 1]! - dist[k]!)) / 10
  return limitRate(raw, maxStep)
}

/** Times in seconds from the first timed point, gaps filled; null when the points are not usefully timed. */
function filledTimes(points: readonly RoutePoint[], dist: Float64Array, o: Required<ProfileOptions>): Float64Array | null {
  const n = points.length
  const timed: number[] = []
  for (let i = 0; i < n; i++) if (Number.isFinite(points[i]!.t)) timed.push(i)
  if (timed.length < 2 || timed.length < n / 2) return null
  const first = timed[0]!
  const last = timed[timed.length - 1]!
  const t0 = points[first]!.t!
  const spanS = (points[last]!.t! - t0) / 1000
  if (!(spanS > 0)) return null
  const meanMps = clamp((dist[last]! - dist[first]!) / spanS, o.minRecordedMps, o.maxRecordedMps)
  const out = new Float64Array(n)
  let prev = -1
  for (const i of timed) {
    out[i] = (points[i]!.t! - t0) / 1000
    if (prev >= 0 && i - prev > 1) {
      const span = dist[i]! - dist[prev]!
      for (let k = prev + 1; k < i; k++) {
        out[k] = span > 0 ? out[prev]! + ((out[i]! - out[prev]!) * (dist[k]! - dist[prev]!)) / span : out[prev]!
      }
    }
    prev = i
  }
  for (let i = 0; i < first; i++) out[i] = -(dist[first]! - dist[i]!) / meanMps
  for (let i = last + 1; i < n; i++) out[i] = out[last]! + (dist[i]! - dist[last]!) / meanMps
  return out
}

function oddSamples(samples: number): number {
  const n = Math.max(1, Math.round(samples))
  return n % 2 === 0 ? n + 1 : n
}
