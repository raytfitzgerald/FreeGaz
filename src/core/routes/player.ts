// Route playback: turns rider power (or the recorded pace) into a position
// along a route, and the position into the grade the trainer should simulate.
//
// Modes (FulGaz semantics):
//   reactive   The rider's virtual speed comes from power through the
//              injected speed model (the physics lives elsewhere), and the
//              position advances at that speed.
//   steady     The position advances at the route's recorded speed (profile
//              recordedMps, when the file had timestamps) or at a fixed pace.
//              Power does not change progress, but the trainer still follows
//              the gradient.
//   challenge  Reactive, plus a ghost: a previous effort's distance-vs-time
//              curve, reported as gaps in metres and seconds.
//
// The player never talks to the trainer. `lookaheadGradePct` is the mean
// grade over the next speed x lookaheadS metres, because trainers take a
// moment to change resistance. Slope scaling for feel is applied by the
// trainer controller. The speed model always gets the true grade at the
// rider's position.
import { clamp } from './filters'
import { lookaheadGrade, profileIndex, sampleAt } from './lookup'
import type { ProfilePoint, Route } from './model'

export type RouteMode = 'reactive' | 'steady' | 'challenge'

/** The rider's speed after `dtS` s at `powerW` on `gradePct`, starting from `currentMps`. Injected so physics stays swappable. */
export type SpeedModel = (powerW: number, gradePct: number, currentMps: number, dtS: number) => number

/** One sample of a previous effort: seconds since its start, and its position along the route (unwrapped across laps). */
export interface GhostSample {
  tS: number
  distM: number
}

export interface RoutePlayerOptions {
  mode: RouteMode
  speedModel: SpeedModel
  /** Steady mode at this fixed pace, km/h. When omitted, Steady rides the recorded speed if the route has one, else 25 km/h. */
  steadyKmh?: number
  /** The trainer grade looks this many seconds ahead at the current speed. Default 1.5. */
  lookaheadS?: number
  /** Challenge mode's previous effort. Ignored in other modes. */
  ghost?: readonly GhostSample[]
  /** Ride the route as a loop instead of stopping at the finish. */
  loop?: boolean
  /** Start this far along the route, m. Default 0. */
  startDistM?: number
  /** Starting speed for reactive and challenge modes, m/s. Default 0 (a standing start). */
  initialSpeedMps?: number
}

export interface GhostState {
  /** The ghost's position along the route, m (wrapped per lap in loop mode). */
  distM: number
  /** Time gap, s: positive = the rider is ahead. */
  gapS: number
  /** Distance gap, m: positive = the rider is ahead. */
  gapM: number
}

export interface RouteState {
  /** Position along the route, m. Restarts at 0 on each lap in loop mode. */
  distM: number
  /** distM / route length, 0..1. */
  progress: number
  speedMps: number
  ele: number
  /** True grade at the position, %. */
  gradePct: number
  /** Grade to send the trainer before slope scaling, %. */
  lookaheadGradePct: number
  lat: number
  lon: number
  finished: boolean
  /** Riding time since the start, s. Stops at the finish, which is interpolated inside the step. */
  elapsedS: number
  /** Completed laps (loop mode). */
  lap: number
  /** Distance ridden since the start, across laps, m. */
  totalDistM: number
  /** Present in challenge mode when a usable ghost was given. */
  ghost?: GhostState
}

export interface RouteInput {
  dtS: number
  /** Rider power, W. null (no power data) means coasting. */
  powerW: number | null
}

export const DEFAULT_STEADY_KMH = 25
export const DEFAULT_LOOKAHEAD_S = 1.5
/** Longer ticks are integrated in sub-steps of at most this, so grade and speed stay current, s. */
const MAX_SUBSTEP_S = 1

export class RoutePlayer {
  readonly mode: RouteMode
  private readonly profile: readonly ProfilePoint[]
  private readonly length: number
  private readonly loop: boolean
  private readonly lookaheadS: number
  private readonly speedModel: SpeedModel
  /** Steady mode's fixed pace, m/s, or null to ride the recorded speed. */
  private readonly fixedMps: number | null
  private readonly ghost: Ghost | null
  private dist: number
  private laps = 0
  private ridden = 0
  private speed: number
  private elapsed = 0
  private done: boolean
  private current: RouteState

  constructor(
    readonly route: Route,
    opts: RoutePlayerOptions,
  ) {
    const profile = route.profile
    const end = profile[profile.length - 1]?.distM ?? 0
    if (profile.length < 2 || profile[0]!.distM !== 0 || !(end > 0)) {
      throw new RangeError('RoutePlayer needs a route profile that starts at 0 m and has a positive length')
    }
    const lookaheadS = opts.lookaheadS ?? DEFAULT_LOOKAHEAD_S
    if (!(lookaheadS >= 0 && Number.isFinite(lookaheadS))) throw new RangeError('lookaheadS must be a finite number >= 0')
    if (opts.steadyKmh !== undefined && !(opts.steadyKmh > 0 && Number.isFinite(opts.steadyKmh))) {
      throw new RangeError('steadyKmh must be a finite number > 0')
    }
    const startDistM = opts.startDistM ?? 0
    if (!(startDistM >= 0 && Number.isFinite(startDistM))) throw new RangeError('startDistM must be a finite number >= 0')
    const initialSpeed = opts.initialSpeedMps ?? 0
    if (!(initialSpeed >= 0 && Number.isFinite(initialSpeed))) throw new RangeError('initialSpeedMps must be a finite number >= 0')

    this.mode = opts.mode
    this.profile = profile
    this.length = end
    this.loop = opts.loop ?? false
    this.lookaheadS = lookaheadS
    this.speedModel = opts.speedModel
    const recorded = profile.every((p) => p.recordedMps !== undefined && p.recordedMps > 0)
    this.fixedMps = opts.steadyKmh !== undefined ? opts.steadyKmh / 3.6 : recorded ? null : DEFAULT_STEADY_KMH / 3.6
    this.ghost = opts.mode === 'challenge' && opts.ghost ? Ghost.from(opts.ghost) : null
    this.dist = this.loop ? mod(startDistM, end) : Math.min(startDistM, end)
    this.done = !this.loop && this.dist >= end
    this.speed = this.mode === 'steady' ? this.steadySpeedAt(this.dist) : initialSpeed
    this.current = this.snapshot()
  }

  get state(): RouteState {
    return this.current
  }

  /** Advances the ride by `dtS` seconds. Returns (and stores) the new state; a no-op once finished. */
  step(input: RouteInput): RouteState {
    const { dtS } = input
    if (this.done || !(dtS > 0) || !Number.isFinite(dtS)) return this.current
    if (this.mode === 'steady') {
      this.advanceSteady(dtS)
    } else {
      const powerW = input.powerW !== null && Number.isFinite(input.powerW) ? input.powerW : 0
      let left = dtS
      while (left > 1e-12 && !this.done) {
        const dt = Math.min(MAX_SUBSTEP_S, left)
        this.advanceReactive(dt, powerW)
        left -= dt
      }
    }
    this.current = this.snapshot()
    return this.current
  }

  /** The ghost's position (unwrapped) at `tS` seconds into its effort, or null without a ghost. */
  ghostDistM(tS: number): number | null {
    return this.ghost ? this.ghost.distAt(tS) : null
  }

  /** The current effort as a ghost sample: record these to race this ride later. */
  ghostSample(): GhostSample {
    return { tS: this.elapsed, distM: this.laps * this.length + this.dist }
  }

  private advanceReactive(dt: number, powerW: number): void {
    const v0 = this.speed
    const raw = this.speedModel(powerW, sampleAt(this.profile, this.dist).gradePct, v0, dt)
    const v1 = Number.isFinite(raw) ? Math.max(0, raw) : 0
    const advance = ((v0 + v1) / 2) * dt
    const toEnd = this.length - this.dist
    if (!this.loop && advance >= toEnd) {
      // The finish falls inside this step: speed changes linearly over the
      // step, so solve toEnd = v0 t + a t^2 / 2 for the crossing time.
      const a = (v1 - v0) / dt
      const t = clamp(timeToCover(toEnd, v0, a), 0, dt)
      this.elapsed += t
      this.speed = v0 + a * t
      this.finish()
      return
    }
    this.elapsed += dt
    this.speed = v1
    this.moveBy(advance)
  }

  private advanceSteady(dtS: number): void {
    let left = dtS
    while (left > 1e-12) {
      const from = this.dist
      let to: number
      let used: number
      if (this.fixedMps !== null) {
        to = Math.min(this.length, from + this.fixedMps * left)
        used = (to - from) / this.fixedMps
      } else {
        const r = advanceAtRecordedSpeed(this.profile, from, left)
        to = r.distM
        used = r.usedS
      }
      this.ridden += to - from
      this.dist = to
      left -= used
      if (this.dist >= this.length - 1e-9) {
        if (!this.loop) {
          this.finish()
          break
        }
        this.dist = 0
        this.laps += 1
      } else if (!(used > 0)) {
        break
      }
    }
    this.elapsed += this.done ? dtS - Math.max(0, left) : dtS
    this.speed = this.steadySpeedAt(this.dist)
  }

  private moveBy(m: number): void {
    this.ridden += m
    let d = this.dist + m
    if (this.loop && d >= this.length) {
      const laps = Math.floor(d / this.length)
      this.laps += laps
      d -= laps * this.length
    }
    this.dist = Math.min(d, this.length)
  }

  private finish(): void {
    this.ridden += this.length - this.dist
    this.dist = this.length
    this.done = true
  }

  private steadySpeedAt(distM: number): number {
    return this.fixedMps ?? sampleAt(this.profile, distM).recordedMps ?? DEFAULT_STEADY_KMH / 3.6
  }

  private snapshot(): RouteState {
    const here = sampleAt(this.profile, this.dist)
    const s: RouteState = {
      distM: this.dist,
      progress: this.dist / this.length,
      speedMps: this.speed,
      ele: here.ele,
      gradePct: here.gradePct,
      lookaheadGradePct: lookaheadGrade(this.profile, this.dist, this.speed * this.lookaheadS, { loop: this.loop }),
      lat: here.lat,
      lon: here.lon,
      finished: this.done,
      elapsedS: this.elapsed,
      lap: this.laps,
      totalDistM: this.ridden,
    }
    if (this.ghost) {
      const position = this.laps * this.length + this.dist
      const ghostAt = this.ghost.distAt(this.elapsed)
      s.ghost = {
        distM: this.loop ? mod(ghostAt, this.length) : clamp(ghostAt, 0, this.length),
        gapS: this.ghost.timeAt(position) - this.elapsed,
        gapM: position - ghostAt,
      }
    }
    return s
  }
}

/**
 * Moves along the profile at its recorded speed for up to `dtS` seconds.
 * Returns where that ends and the time it took, which is less than dtS only
 * when the route end is reached. Speed is linear in distance between profile
 * points, so within a segment dx/dt = v0 + k (x - x0) integrates exactly:
 * x(t) = x0 + v0 (e^(kt) - 1) / k, and crossing the rest of it takes
 * ln(v1 / v0) / k.
 */
export function advanceAtRecordedSpeed(profile: readonly ProfilePoint[], fromM: number, dtS: number): { distM: number; usedS: number } {
  const n = profile.length
  let x = clamp(fromM, profile[0]!.distM, profile[n - 1]!.distM)
  let left = dtS
  let i = profileIndex(profile, x)
  while (left > 0 && i < n - 1) {
    const a = profile[i]!
    const b = profile[i + 1]!
    const va = a.recordedMps
    const vb = b.recordedMps
    if (va === undefined || vb === undefined || !(va > 0) || !(vb > 0)) throw new RangeError('the profile has no recorded speed here')
    const k = (vb - va) / (b.distM - a.distM)
    const vx = va + k * (x - a.distM)
    const rest = b.distM - x
    const cross = Math.abs(k) < 1e-12 ? rest / vx : Math.log1p((k * rest) / vx) / k
    if (cross <= left) {
      x = b.distM
      left -= cross
      i++
      continue
    }
    const moved = Math.abs(k) < 1e-12 ? vx * left : (vx * Math.expm1(k * left)) / k
    x = Math.min(b.distM, x + moved)
    left = 0
  }
  return { distM: x, usedS: dtS - left }
}

/** Time to cover `s` metres from speed v0 at constant acceleration a (the smaller positive root, in a cancellation-free form). */
function timeToCover(s: number, v0: number, a: number): number {
  if (!(s > 0)) return 0
  const denom = v0 + Math.sqrt(Math.max(0, v0 * v0 + 2 * a * s))
  return denom > 0 ? (2 * s) / denom : 0
}

function mod(x: number, m: number): number {
  return ((x % m) + m) % m
}

/** A previous effort, as a monotone distance-vs-time curve. */
class Ghost {
  private constructor(
    private readonly t: Float64Array,
    private readonly d: Float64Array,
    private readonly meanMps: number,
  ) {}

  /** Cleans the samples (finite, time-sorted, never going backwards); null when too few remain to race. */
  static from(samples: readonly GhostSample[]): Ghost | null {
    const clean = samples.filter((s) => Number.isFinite(s.tS) && Number.isFinite(s.distM)).sort((p, q) => p.tS - q.tS)
    const t: number[] = []
    const d: number[] = []
    for (const s of clean) {
      const last = t.length - 1
      const dist = last >= 0 ? Math.max(d[last]!, s.distM) : s.distM
      if (last >= 0 && s.tS === t[last]) d[last] = dist
      else {
        t.push(s.tS)
        d.push(dist)
      }
    }
    const n = t.length
    if (n < 2) return null
    const spanS = t[n - 1]! - t[0]!
    const spanM = d[n - 1]! - d[0]!
    if (!(spanS > 0) || !(spanM > 0)) return null
    return new Ghost(Float64Array.from(t), Float64Array.from(d), spanM / spanS)
  }

  /** Position at `tS`, held at the first/last sample outside the recording. */
  distAt(tS: number): number {
    const { t, d } = this
    const n = t.length
    if (!(tS > t[0]!)) return d[0]!
    if (tS >= t[n - 1]!) return d[n - 1]!
    let lo = 0
    let hi = n - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1
      if (t[mid]! <= tS) lo = mid
      else hi = mid
    }
    return d[lo]! + ((d[hi]! - d[lo]!) * (tS - t[lo]!)) / (t[hi]! - t[lo]!)
  }

  /** The first time the ghost reached `distM`. Outside the recording it is extrapolated at the ghost's mean speed. */
  timeAt(distM: number): number {
    const { t, d } = this
    const n = d.length
    if (distM <= d[0]!) return t[0]! - (d[0]! - distM) / this.meanMps
    if (distM > d[n - 1]!) return t[n - 1]! + (distM - d[n - 1]!) / this.meanMps
    let lo = 0 // d[lo] < distM <= d[hi]
    let hi = n - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1
      if (d[mid]! >= distM) hi = mid
      else lo = mid
    }
    return t[lo]! + ((t[hi]! - t[lo]!) * (distM - d[lo]!)) / (d[hi]! - d[lo]!)
  }
}
