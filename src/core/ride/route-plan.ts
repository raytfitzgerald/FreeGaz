// RoutePlan rides a route (GPX, TCX or a demo) as a RidePlan of kind 'route'.
//
// A RoutePlayer (routes/player.ts) turns power into a position and the
// position into a gradient:
//   Reactive   speed from the Martin power model (physics/bike.ts) on the
//              rider's power: the athlete snapshot's weight, plus the bike
//              mass, CdA and Crr from the trainer prefs, on the true grade.
//   Steady     the route's recorded pace (files with timestamps), else
//              25 km/h, or a fixed pace given as an option.
//   Challenge  Reactive plus a ghost of a previous effort.
// The trainer gets SIM at the player's look-ahead grade, unscaled: the
// trainer controller applies the rider's uphill/downhill/limit feel.
// Records get the true grade, the elevation, the virtual speed (a 1-second
// mean, so the recorded distance tracks the route position) and FIT gets
// them from there.
//
// Time is moving time: the plan advances by the change in PlanInput.movingS,
// not by the tick's nominal dt, so the position, the 1 Hz records and a
// ghost's clock share one axis and pauses never move anyone.
//
// Mid-ride:
//   setMode('reactive' | 'steady') swaps the player at the current position
//     and speed. In a Challenge ride the race is hidden while Steady (your
//     legs no longer set the pace); the ghost's clock keeps running, so the
//     true gap is back as soon as you switch to Reactive again.
//   The 'mode' command overrides the trainer: 'resistance' holds a level
//     (starting at 25 %), 'erg' holds a wattage (starting at your last 30 s,
//     rounded to 5 W), and 'nudge' changes either. The route keeps playing
//     and Reactive speed still comes from your power and the true grade, so
//     ERG on a route is a steady-power ride over real terrain. 'sim' hands
//     the trainer back to the route. HR-ERG is not offered on a route, and
//     skip/back/extend mean nothing here, so they are not handled.
//
// Segments: one per lap on a multi-lap loop, otherwise one per km marker
// (markerSpacingM), and the session laps the recording at each. The ride
// finishes at the end of the route or after the last lap; after that the
// trainer goes flat and speed keeps coming from physics until you press
// Finish, while the route position stays at the finish line.
import type { Desired } from '../control/trainer-controller'
import { DEFAULT_BIKE, stepSpeed, type BikeParams } from '../physics/bike'
import { sampleAt } from '../routes/lookup'
import type { ProfilePoint, Route } from '../routes/model'
import { RoutePlayer, type GhostSample, type RouteMode, type RouteState, type SpeedModel } from '../routes/player'
import type { RideCommand } from '../../shared/live'
import type { PlanInput, PlanTick, RidePlan } from './plan'
import {
  chunkSpeeds,
  cumulativeGain,
  gradeChunks,
  isLoopRoute,
  markerSpacingM,
  recordedPaceTimes,
  recordedTimeBetween,
  timeAtSpeeds,
  valueAtDistance,
  type GradeChunks,
} from './route-course'
import { shiftGhost } from './route-ghost'
import type { RideKind } from './types'

/** What the rider can switch between mid-ride. Challenge is Reactive with a ghost. */
export type RoutePlayback = 'reactive' | 'steady'

/** The rider and bike for Reactive speed. */
export interface RouteRider {
  /** Rider mass, kg (the athlete snapshot). */
  riderKg: number
  /** Bike mass, CdA and Crr from the trainer prefs. */
  bikeKg: number
  cda: number
  crr: number
  /** Used for the ERG override's starting watts when there is no recent power. */
  ftpW?: number
}

export interface RoutePlanOptions {
  mode: RouteMode
  rider: RouteRider
  /** Laps of a loop route (default 1). Point-to-point routes always ride once. */
  laps?: number
  /** Steady at a fixed pace, km/h, instead of the recorded pace (or 25 km/h). */
  steadyKmh?: number
  /** Challenge: the previous effort to race. */
  ghost?: readonly GhostSample[]
  /** What the HUD calls the ghost, e.g. "Your ride on 12 Sep". */
  ghostLabel?: string
  /** Trainer look-ahead, s (player default 1.5). */
  lookaheadS?: number
}

/** A trainer override while the route keeps playing. */
export type RouteOverride = { mode: 'resistance'; pct: number } | { mode: 'erg'; watts: number }

export interface RouteGhostProgress {
  /** The ghost's position in the current lap, m. */
  distM: number
  /** Positive: you are ahead, s / m. */
  gapS: number
  gapM: number
  lat: number
  lon: number
}

/** Route playback state for the HUD, on every RouteTick. */
export interface RouteProgress {
  routeId: string
  /** Playback now: Challenge is Reactive while a ghost is being raced. */
  mode: RouteMode
  /** This ride races a ghost (the race is hidden while Steady). */
  challenge: boolean
  /** One lap, m. */
  lengthM: number
  laps: number
  /** 0-based lap being ridden; equals `laps` once finished. */
  lap: number
  /** Position in the current lap, m. */
  distM: number
  /** Ridden on the route so far, across laps, m. */
  riddenM: number
  /** The whole ride: length x laps, m. */
  totalM: number
  remainingM: number
  /** Virtual speed right now, m/s. */
  speedMps: number
  /** True grade under the wheels, %. */
  gradePct: number
  /** Grade asked of the trainer before slope scaling, %. */
  lookaheadGradePct: number
  ele: number
  lat: number
  lon: number
  gainedM: number
  remainingGainM: number
  /** Estimated time to the finish: at your last 30 s of power (Reactive) or at the route's pace (Steady), s. */
  etaS: number | null
  /** Riding time on the route (stops at the finish), s. */
  elapsedS: number
  ghost: RouteGhostProgress | null
  override: RouteOverride | null
  finished: boolean
}

export interface RouteTick extends PlanTick {
  route: RouteProgress
  grade: number
  altitude: number
  speed: number
  distanceM: number
}

/** True for the ticks of a RoutePlan. */
export function isRouteTick(tick: PlanTick | null | undefined): tick is RouteTick {
  const route = (tick as Partial<RouteTick> | null | undefined)?.route
  return typeof route === 'object' && route !== null
}

/** Recorded speed is the mean over this much moving time, s (a record's own second). */
const RECORD_SPEED_WINDOW_S = 1
/** ETAs and the ERG override's start use the mean power over this much moving time, s. */
const RECENT_POWER_S = 30
/** Below this much power (or data) the Reactive ETA is unknown. */
const MIN_ETA_POWER_W = 10
/** The per-chunk speeds are recomputed when the recent power moves this much, W. */
const ETA_POWER_STEP_W = 2
const DEFAULT_LEVEL_PCT = 25
const DEFAULT_ERG_W = 150
/** Passing (or being passed by) the ghost is only announced past this margin, m... */
const GHOST_PASS_MARGIN_M = 5
/** ...and at most this often, s. */
const GHOST_CUE_EVERY_S = 20

export class RoutePlan implements RidePlan {
  readonly kind: RideKind = 'route'
  readonly name: string
  readonly route: Route
  readonly routeId: string
  /** The mode the ride was started in. */
  readonly startMode: RouteMode
  readonly laps: number
  readonly lengthM: number
  readonly totalM: number
  readonly ghostLabel: string | null
  readonly bike: Readonly<BikeParams>

  private readonly opts: RoutePlanOptions
  private readonly ftpW: number | null
  private readonly profile: readonly ProfilePoint[]
  private readonly ghost: readonly GhostSample[] | null
  private readonly speedModel: SpeedModel
  private readonly lapGain: Float64Array
  private readonly lapGainM: number
  private readonly chunks: GradeChunks
  private readonly paceTimes: Float64Array | null
  private readonly steadyMps: number | null
  /** Km-marker spacing, or null when segments are laps. */
  private readonly markerM: number | null
  private readonly segmentCount: number

  private player: RoutePlayer
  private playback: RoutePlayback
  /** Time and laps ridden by players that were replaced (mode switches, the final lap). */
  private baseElapsedS = 0
  private baseLaps = 0
  /** Moving time already ridden, s. A ride's moving time starts at 0, and so does the route. */
  private lastMovingS = 0
  private finishedAt: number | null = null
  private coolSpeedMps = 0
  private coolDistM = 0
  private readonly trail: { t: number; d: number }[] = [{ t: 0, d: 0 }]
  private readonly powerLog: { t: number; w: number; dt: number }[] = []
  private etaSpeeds: { powerW: number; speeds: Float64Array } | null = null
  private override: RouteOverride | null = null
  private levelPct = DEFAULT_LEVEL_PCT
  private ergW: number | null = null
  private readonly cues: string[] = []
  private segment = { index: 0, startS: 0 }
  private lapSeen = 0
  private ghostSide: 'ahead' | 'behind' | null = null
  private ghostCueAt = Number.NEGATIVE_INFINITY

  constructor(route: Route, opts: RoutePlanOptions) {
    this.opts = opts
    this.route = route
    this.routeId = route.id
    this.name = route.name
    this.profile = route.profile
    this.startMode = opts.mode
    this.lengthM = this.profile[this.profile.length - 1]?.distM ?? 0
    const laps = Math.floor(opts.laps ?? 1)
    this.laps = isLoopRoute(route) && laps > 1 ? Math.min(laps, 99) : 1
    this.totalM = this.lengthM * this.laps
    this.ghostLabel = opts.ghostLabel ?? null
    this.ghost = opts.mode === 'challenge' && opts.ghost && opts.ghost.length >= 2 ? opts.ghost : null
    const r = opts.rider
    this.bike = {
      ...DEFAULT_BIKE,
      riderKg: positiveOr(r.riderKg, DEFAULT_BIKE.riderKg),
      bikeKg: positiveOr(r.bikeKg, DEFAULT_BIKE.bikeKg),
      cda: positiveOr(r.cda, DEFAULT_BIKE.cda),
      crr: positiveOr(r.crr, DEFAULT_BIKE.crr),
    }
    const bike = this.bike
    this.speedModel = (powerW, gradePct, currentMps, dtS) => stepSpeed(currentMps, powerW, gradePct, dtS, bike)
    this.ftpW = r.ftpW !== undefined && r.ftpW > 0 ? r.ftpW : null

    this.lapGain = cumulativeGain(this.profile.map((p) => p.ele))
    this.lapGainM = this.lapGain[this.lapGain.length - 1] ?? 0
    this.chunks = gradeChunks(this.profile)
    this.paceTimes = recordedPaceTimes(this.profile)
    this.steadyMps = opts.steadyKmh !== undefined ? opts.steadyKmh / 3.6 : this.paceTimes ? null : 25 / 3.6
    this.markerM = this.laps > 1 ? null : markerSpacingM(this.totalM)
    this.segmentCount = this.markerM === null ? this.laps : Math.max(1, Math.ceil(this.totalM / this.markerM - 1e-9))

    this.playback = opts.mode === 'steady' ? 'steady' : 'reactive'
    this.player = this.makePlayer(this.playback, 0, 0)
  }

  /** Reactive or Steady right now. */
  get playbackMode(): RoutePlayback {
    return this.playback
  }
  /** Moving time at which the route was completed, s; null until then. */
  get finishedAtS(): number | null {
    return this.finishedAt
  }
  /** The trainer override in force, or null when the route has the trainer. */
  get trainerOverride(): RouteOverride | null {
    return this.override
  }
  /** Whether this ride races a ghost. */
  get racing(): boolean {
    return this.ghost !== null
  }

  /** Switches Reactive / Steady at the current position and speed. Returns false when nothing changes. */
  setMode(mode: RoutePlayback): boolean {
    if (mode === this.playback || this.finishedAt !== null) return false
    this.playback = mode
    this.swapPlayer()
    this.cues.push(mode === 'steady' ? 'Steady: the route sets the pace now.' : this.ghost ? 'Reactive: race on, your watts set the pace.' : 'Reactive: your watts set the pace.')
    return true
  }

  command(cmd: RideCommand): boolean {
    switch (cmd.type) {
      case 'routeMode':
        return this.setMode(cmd.mode)
      case 'mode':
        if (cmd.mode === 'hr') return false
        if (cmd.mode === 'sim') this.override = null
        else if (cmd.mode === 'resistance') this.override = { mode: 'resistance', pct: this.levelPct }
        else this.override = { mode: 'erg', watts: this.ergW ?? this.startingErgW() }
        return true
      case 'nudge': {
        const o = this.override
        if (!o || !Number.isFinite(cmd.delta)) return false
        if (o.mode === 'resistance') {
          this.levelPct = clamp(Math.round(o.pct + cmd.delta), 0, 100)
          this.override = { mode: 'resistance', pct: this.levelPct }
        } else {
          this.ergW = clamp(Math.round(o.watts + cmd.delta), 0, 1500)
          this.override = { mode: 'erg', watts: this.ergW }
        }
        return true
      }
      default:
        return false
    }
  }

  tick(input: PlanInput): RouteTick {
    const t = input.movingS
    const dt = Number.isFinite(t) ? Math.max(0, t - this.lastMovingS) : 0
    if (dt > 0) this.lastMovingS = t
    const power = input.power !== null && Number.isFinite(input.power) ? Math.max(0, input.power) : null
    if (dt > 0) {
      if (power !== null) this.powerLog.push({ t, w: power, dt })
      this.advance(dt, power)
    }
    while (this.powerLog.length > 0 && this.powerLog[0]!.t <= t - RECENT_POWER_S) this.powerLog.shift()
    this.pushTrail(t)
    return this.buildTick(t, input)
  }

  // ---- playback -----------------------------------------------------------

  private makePlayer(mode: RoutePlayback, startDistM: number, speedMps: number): RoutePlayer {
    const racing = mode === 'reactive' && this.ghost !== null
    return new RoutePlayer(this.route, {
      mode: mode === 'steady' ? 'steady' : racing ? 'challenge' : 'reactive',
      speedModel: this.speedModel,
      steadyKmh: this.opts.steadyKmh,
      lookaheadS: this.opts.lookaheadS,
      // Loop while more laps follow; the last lap stops at the line, so the
      // finish is exact and the look-ahead never wraps past it.
      loop: this.baseLaps < this.laps - 1,
      startDistM,
      initialSpeedMps: speedMps,
      ghost: racing ? shiftGhost(this.ghost!, this.baseElapsedS, this.baseLaps * this.lengthM) : undefined,
    })
  }

  /** Replaces the player at the current position and speed, carrying time and laps over. */
  private swapPlayer(): void {
    const s = this.player.state
    this.baseElapsedS += s.elapsedS
    this.baseLaps += s.lap
    this.player = this.makePlayer(this.playback, s.distM, s.speedMps)
  }

  private advance(dt: number, power: number | null): void {
    if (this.finishedAt !== null) {
      // Past the finish: a flat road, speed from physics, for the cool-down.
      const v0 = this.coolSpeedMps
      const v1 = stepSpeed(v0, power ?? 0, 0, dt, this.bike)
      this.coolDistM += ((v0 + v1) / 2) * dt
      this.coolSpeedMps = v1
      return
    }
    const s = this.player.step({ dtS: dt, powerW: power })
    if (s.finished) {
      this.finish(this.baseElapsedS + s.elapsedS, s.speedMps)
      return
    }
    const laps = this.baseLaps + s.lap
    if (laps >= this.laps) {
      // A loop player overshot the last line within one long step: finish at
      // the interpolated crossing.
      const over = this.position(s) - this.totalM
      this.finish(this.baseElapsedS + s.elapsedS - (s.speedMps > 0 ? over / s.speedMps : 0), s.speedMps)
      return
    }
    if (s.lap > 0 && laps === this.laps - 1) this.swapPlayer() // into the last lap
  }

  private finish(elapsedS: number, speedMps: number): void {
    this.finishedAt = Math.max(0, elapsedS)
    this.coolSpeedMps = speedMps
    const g = this.ghostProgress(this.player.state, this.totalM)
    const race = g ? ` ${formatGap(g.gapS)} ${g.gapS >= 0 ? 'ahead of' : 'behind'} your ghost.` : ''
    this.cues.push(`Route complete!${race}`)
  }

  /** Where the rider is along the whole ride (laps unwrapped), m. */
  private position(s: RouteState): number {
    return Math.min(this.totalM, (this.baseLaps + s.lap) * this.lengthM + s.distM)
  }

  private elapsed(s: RouteState): number {
    return this.finishedAt ?? this.baseElapsedS + s.elapsedS
  }

  // ---- ticks --------------------------------------------------------------

  private buildTick(t: number, input: PlanInput): RouteTick {
    const s = this.player.state
    const done = this.finishedAt !== null
    const position = done ? this.totalM : this.position(s)
    const lap = done ? this.laps : Math.min(this.laps - 1, this.baseLaps + s.lap)
    const distM = done ? this.lengthM : s.distM
    const speedMps = done ? this.coolSpeedMps : s.speedMps
    const gainedM = done ? this.lapGainM * this.laps : lap * this.lapGainM + valueAtDistance(this.profile, this.lapGain, distM)
    const elapsedS = this.elapsed(s)
    const ghost = this.ghostProgress(s, position)
    if (!done) this.ghostCues(ghost, elapsedS)
    if (!done && lap > this.lapSeen) {
      this.lapSeen = lap
      this.cues.push(lap === this.laps - 1 ? `Last lap: ${lap + 1} of ${this.laps}.` : `Lap ${lap + 1} of ${this.laps}.`)
    }

    const seg = this.segmentAt(position, done)
    if (seg.index !== this.segment.index) this.segment = { index: seg.index, startS: elapsedS }
    const desired: Desired = this.override ?? { mode: 'sim', gradePct: done ? 0 : round2(s.lookaheadGradePct) }
    const intensity = (input.intensityPct ?? 100) / 100
    const etaS = done ? 0 : this.timeBetween(position, this.totalM)
    const grade = done ? 0 : s.gradePct

    const progress: RouteProgress = {
      routeId: this.routeId,
      mode: this.player.mode,
      challenge: this.ghost !== null,
      lengthM: this.lengthM,
      laps: this.laps,
      lap,
      distM,
      riddenM: position,
      totalM: this.totalM,
      remainingM: Math.max(0, this.totalM - position),
      speedMps,
      gradePct: grade,
      lookaheadGradePct: done ? 0 : s.lookaheadGradePct,
      ele: s.ele,
      lat: s.lat,
      lon: s.lon,
      gainedM,
      remainingGainM: Math.max(0, this.lapGainM * this.laps - gainedM),
      etaS,
      elapsedS,
      ghost,
      override: this.override,
      finished: done,
    }
    return {
      desired,
      targetW: this.override?.mode === 'erg' ? Math.round(this.override.watts * intensity) : null,
      segmentIndex: seg.index,
      segmentLabel: seg.label,
      segmentKind: seg.kind,
      segmentRemainingS: done ? null : this.timeBetween(position, seg.endM),
      segmentElapsedS: done ? null : elapsedS - this.segment.startS,
      nextLabel: seg.next,
      remainingS: etaS,
      finished: done,
      grade: round2(grade),
      altitude: Math.round(s.ele * 10) / 10,
      speed: this.recordSpeed(t, speedMps),
      distanceM: position,
      // a real course goes in the FIT as GPS; the demo routes are shapes at an arbitrary spot, so they stay off the map
      ...(this.route.source !== 'synthetic' ? { lat: s.lat, lon: s.lon } : {}),
      cue: this.cues.shift() ?? null,
      route: progress,
    }
  }

  private segmentAt(position: number, done: boolean): { index: number; label: string | null; kind: string; next: string | null; endM: number } {
    if (done) return { index: this.segmentCount, label: 'Route complete', kind: 'done', next: null, endM: this.totalM }
    if (this.markerM === null) {
      const lap = Math.min(this.laps - 1, Math.floor(position / this.lengthM))
      return {
        index: lap,
        label: `Lap ${lap + 1} of ${this.laps}`,
        kind: 'lap',
        next: lap + 1 < this.laps ? `Lap ${lap + 2} of ${this.laps}` : 'Finish',
        endM: (lap + 1) * this.lengthM,
      }
    }
    const m = this.markerM
    const index = Math.min(this.segmentCount - 1, Math.floor(position / m))
    const label = (k: number) => `${formatKm(k * m)}–${formatKm(Math.min(this.totalM, (k + 1) * m))} km`
    return { index, label: label(index), kind: 'km', next: index + 1 < this.segmentCount ? label(index + 1) : 'Finish', endM: Math.min(this.totalM, (index + 1) * m) }
  }

  private ghostProgress(s: RouteState, position: number): RouteGhostProgress | null {
    const g = s.ghost
    if (!g) return null
    // The player's gap is exact across swaps (its ghost is shifted); place the
    // ghost from it, so a ghost a lap behind still shows in the right spot.
    const total = position - g.gapM
    const inLap = total >= this.totalM ? this.lengthM : total <= 0 ? 0 : this.laps > 1 ? total - Math.min(this.laps - 1, Math.floor(total / this.lengthM)) * this.lengthM : total
    const at = sampleAt(this.profile, inLap)
    return { distM: inLap, gapS: g.gapS, gapM: g.gapM, lat: at.lat, lon: at.lon }
  }

  private ghostCues(g: RouteGhostProgress | null, elapsedS: number): void {
    if (!g) return
    const side = g.gapM > GHOST_PASS_MARGIN_M ? 'ahead' : g.gapM < -GHOST_PASS_MARGIN_M ? 'behind' : null
    if (side === null || side === this.ghostSide) return
    const first = this.ghostSide === null
    this.ghostSide = side
    if (first || elapsedS - this.ghostCueAt < GHOST_CUE_EVERY_S) return
    this.ghostCueAt = elapsedS
    this.cues.push(side === 'ahead' ? 'You passed your ghost.' : 'Your ghost just passed you.')
  }

  // ---- recorded speed -------------------------------------------------------

  /** Distance covered on the route plus any cool-down after it, for the recorded speed. */
  private virtualDistance(): number {
    return this.finishedAt !== null ? this.totalM + this.coolDistM : this.position(this.player.state)
  }

  private pushTrail(t: number): void {
    this.trail.push({ t, d: this.virtualDistance() })
    while (this.trail.length > 2 && this.trail[1]!.t <= t - RECORD_SPEED_WINDOW_S) this.trail.shift()
  }

  /**
   * The mean speed over the last second of moving time, m/s. The recorder
   * integrates the speed it is given once per record, so a mean over the
   * record's own second keeps the recorded distance on the route position
   * (an instantaneous speed would drift ahead while accelerating).
   */
  private recordSpeed(t: number, instant: number): number {
    const first = this.trail[0]
    const last = this.trail[this.trail.length - 1]
    let v = instant
    if (first && last) {
      const from = t - RECORD_SPEED_WINDOW_S
      if (first.t > from) {
        const span = last.t - first.t
        if (span >= 0.2) v = (last.d - first.d) / span
      } else {
        const next = this.trail[1] ?? last
        const f = next.t > first.t ? clamp((from - first.t) / (next.t - first.t), 0, 1) : 1
        v = (last.d - (first.d + (next.d - first.d) * f)) / RECORD_SPEED_WINDOW_S
      }
    }
    return Math.round(Math.max(0, v) * 1000) / 1000
  }

  // ---- estimates ------------------------------------------------------------

  /** Mean power over the last 30 s of moving time, W, or null without enough data. */
  private recentPower(): number | null {
    let sum = 0
    let time = 0
    for (const p of this.powerLog) {
      sum += p.w * p.dt
      time += p.dt
    }
    return time >= 3 ? sum / time : null
  }

  private startingErgW(): number {
    const p = this.recentPower()
    if (p !== null && p >= 50) return Math.round(p / 5) * 5
    return this.ftpW !== null ? Math.round((0.6 * this.ftpW) / 5) * 5 : DEFAULT_ERG_W
  }

  /** Riding time from `fromM` to `toM` along the whole ride (laps unwrapped), s; null when unknown. */
  private timeBetween(fromM: number, toM: number): number | null {
    if (!(toM > fromM)) return 0
    const L = this.lengthM
    let total = 0
    for (let lap = Math.min(this.laps - 1, Math.floor(fromM / L)); lap < this.laps; lap++) {
      const start = lap * L
      if (toM <= start) break
      const a = Math.max(0, fromM - start)
      const b = Math.min(L, toM - start)
      if (!(b > a)) continue
      const piece = this.lapTime(a, b)
      if (piece === null) return null
      total += piece
    }
    return Number.isFinite(total) ? total : null
  }

  /** Time for [a, b] within one lap in the current playback, s. */
  private lapTime(a: number, b: number): number | null {
    if (this.playback === 'steady') {
      if (this.steadyMps !== null) return (b - a) / this.steadyMps
      return this.paceTimes ? recordedTimeBetween(this.profile, this.paceTimes, a, b) : null
    }
    const p = this.recentPower()
    if (p === null || p < MIN_ETA_POWER_W) return null
    if (!this.etaSpeeds || Math.abs(this.etaSpeeds.powerW - p) >= ETA_POWER_STEP_W) {
      this.etaSpeeds = { powerW: p, speeds: chunkSpeeds(this.chunks, p, this.bike) }
    }
    const time = timeAtSpeeds(this.chunks, this.etaSpeeds.speeds, a, b)
    return Number.isFinite(time) ? time : null
  }
}

function positiveOr(v: number, fallback: number): number {
  return Number.isFinite(v) && v > 0 ? v : fallback
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const round2 = (v: number) => {
  const r = Math.round(v * 100) / 100
  return r === 0 ? 0 : r // never -0
}

/** 12000 -> "12", 42195 -> "42.2". */
function formatKm(m: number): string {
  const km = m / 1000
  return Number.isInteger(Math.round(km * 10) / 10) ? String(Math.round(km)) : (Math.round(km * 10) / 10).toFixed(1)
}

/** 72.4 -> "1:12", 8.2 -> "8 s". */
function formatGap(s: number): string {
  const v = Math.round(Math.abs(s))
  return v >= 60 ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : `${v} s`
}
