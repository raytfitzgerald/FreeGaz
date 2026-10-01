// TriggerDetector: turns the ride loop into coaching moments for CoachEngine.
// It is fed every engine tick (the plan's tick plus live power, cadence, HR
// and metrics) and every SessionEvent, and returns CoachContexts whose data
// carries exactly what each trigger means: under_target is only ever sent
// while the rider really is under target, halfway only in a hard segment, and
// so on. The engine then decides what, if anything, is said.
//
// Two kinds of output:
//   edges       segment starts and ends, countdowns, halfway, last minute,
//               FTP-test minutes, stops, skips, intensity changes, PRs, the
//               end of the ride. Sent once (time-bound cues are retried for a
//               few seconds until spoken, so a busy moment does not lose them).
//   conditions  under/over target, cadence sag, HR, W′bal and reminders.
//               Re-sent (at most once a second) while they hold; the engine's
//               cooldowns do the pacing.
//
// Distress (abnormal HR, or a sudden stop during a hard effort) is sent as
// 'distress', which makes the engine switch to its supportive tone.
import { COGGAN_POWER, FRIEL_HR_LTHR } from '../metrics/zones'
import type { PlanTick } from '../ride/plan'
import type { PauseReason, SessionEvent, SessionState } from '../ride/session'
import type { RideKind } from '../ride/types'
import type { FtpTestProtocol } from '../workout/model'
import { TRIGGER_THRESHOLDS, type CoachContext, type CoachData, type CoachTrigger } from '../persona/types'
import { isAnnounced, isMicro, segmentFromNext, segmentFromTick, type CoachSegment, type SegmentResolver } from './segments'

/** The detector's own timings, on top of the engine's TRIGGER_THRESHOLDS. */
export const DETECTOR_RULES = {
  /** A step change with more than this left in the old step was a skip. */
  skipMinRemainingS: 2,
  /** A timeline edit that adds at least this much to the current step is an extension. */
  extendMinS: 5,
  /** Target jumps at least this big (W, or fraction of the old target) restart the under-target grace. */
  targetJumpW: 5,
  targetJumpFraction: 0.03,
  /** Segment averages skip the first seconds of ERG steps, while the trainer settles. */
  ergSettleS: 3,
  overTargetHoldS: 5,
  cadenceSagHoldS: 5,
  /** Cadence sag ignores the first seconds of a segment or after a stop... */
  cadenceSagWarmupS: 20,
  /** ...and needs this much segment average to compare against. */
  cadenceSagMinAvgS: 30,
  /** Below this cadence the rider is stopping, not sagging. */
  minPedalingRpm: 30,
  /** hr_high: the HR must sit above the zone cap this long, at least this far into the segment. */
  hrHighHoldS: 30,
  hrHighSettleS: 120,
  /** hr_spike_no_power: a jump this big within the window, with power under this fraction of FTP. */
  hrSpikeJumpBpm: 30,
  hrSpikeWindowS: 5,
  hrSpikeMaxPowerFraction: 0.55,
  /** Spikes only count above this fraction of max HR (or the fallback when max HR is unknown). */
  hrSpikeMaxHrFraction: 0.85,
  hrSpikeFallbackBpm: 160,
  /** Abnormal HR: this far above max HR (or the absolute fallback), held this long. */
  hrAbnormalOverMaxBpm: 5,
  hrAbnormalFallbackBpm: 210,
  hrAbnormalHoldS: 15,
  /** While abnormal HR persists, distress is sent again this often (the engine keeps the tone supportive). */
  hrDistressRepeatS: 240,
  /** Zero power and cadence this long is a stop (the session's auto-pause uses the same 3 s). */
  stopZeroS: 3,
  /** Stops in the first seconds of a ride are just the rider getting on. */
  stopMinMovingS: 30,
  /** A stop is sudden when the rider was working (power ≥ this fraction of target) this recently. */
  workingFraction: 0.5,
  workingWithinS: 8,
  /** Shorter stops get no "welcome back". */
  resumeMinPauseS: 5,
  /** A PR is announced once the effort stops improving it for this long. */
  prSettleS: 3,
  /** Intensity presses in quick succession are announced once. */
  intensitySettleS: 1.5,
  /** Conditions and retried cues are re-sent at most this often. */
  conditionRepeatS: 1,
  /** Retry windows for time-bound cues. */
  halfwayRetryS: 10,
  lastMinuteRetryS: 10,
  countdownLatestS: 6,
  /** After an interval-rescue offer, pushy lines wait while the rider answers. */
  rescueQuietS: 20,
  /** W′bal at or below this is empty (below TRIGGER_THRESHOLDS.wbalLowPct it is low). */
  wbalEmptyPct: 1,
  /** Banter: offered every few seconds (the engine paces it), never in hard efforts or near their start. */
  banterEveryS: 5,
  banterMinMovingS: 60,
  banterQuietAfterStartS: 15,
  /** No banter or reminders this long before a countdown, so they never run into one. */
  banterQuietBeforeCountdownS: 20,
  /** Endings: a bail needs this much riding; a free ride this much to count as complete. */
  bailMinMovingS: 120,
  freeRideCompleteMinS: 300,
  /** Finishing with no hard work left and less than this remaining counts as complete, not a bail. */
  bailMinRemainingS: 300,
  /** Fueling: one portion of carbs per reminder, spaced to meet carbsPerHourG. */
  fuelPortionG: 20,
  fuelMinEveryMin: 15,
  fuelMaxEveryMin: 40,
  /** Rides planned longer than this get fueling reminders; open-ended rides start them at fuelOpenEndedStartS. */
  fuelLongRideS: 3600,
  fuelOpenEndedStartS: 2700,
  /** Reminders are re-offered this often until spoken, and skipped this close to the end of a plan. */
  reminderRepeatS: 10,
  reminderEndQuietS: 300,
} as const

const R = DETECTOR_RULES
const T = TRIGGER_THRESHOLDS

export interface DetectorMetrics {
  wbalJ: number | null
  np: number | null
  tss: number | null
  kj: number | null
  /** Intensity factor so far. */
  if: number | null
}

/** One engine tick, as the detector sees it (see RideProbe for building it from a live session). */
export interface DetectorTick {
  /** Engine clock, ms: the clock the session runs on. */
  now: number
  state: SessionState
  plan: PlanTick
  /** The target the rider is asked to hold (the plan's, or manual ERG watts), W. */
  targetW: number | null
  /** Instantaneous power and cadence; null means missing, never 0. */
  power: number | null
  cadence: number | null
  /** 3-s averages. */
  power3s: number | null
  cadence3s: number | null
  hr: number | null
  /** The trainer is holding the target (ERG). */
  erg: boolean
  intensityPct: number
  movingS: number
  /** Live metrics; may lag up to a second. */
  metrics: DetectorMetrics | null
}

export interface FuelingPlan {
  enabled: boolean
  carbsPerHourG: number
  drinkEveryMin: number
}

export interface DetectorOptions {
  rideKind: RideKind
  ftpW: number
  wPrimeJ?: number
  lthr?: number
  maxHr?: number
  workoutName?: string | null
  /** Planned length of the ride, s; null or undefined for open-ended rides. */
  plannedDurationS?: number | null
  /** The workout's steps as the coach sees them (workoutSegments); without it, steps are judged from the tick. */
  segments?: SegmentResolver | null
  ftpTestProtocol?: FtpTestProtocol | null
  fueling?: FuelingPlan | null
  /**
   * The rider's bests before this ride (SessionOptions.bests), W by duration.
   * The session also reports improvements on this ride's own earlier best, so
   * only durations with a real record to beat are announced, once per ride.
   */
  bests?: Partial<Record<number, number>>
}

const DEFAULT_W_PRIME_J = 20_000

/** Time-weighted mean of a signal. */
class Mean {
  private sum = 0
  private weight = 0
  add(v: number, dtS: number): void {
    this.sum += v * dtS
    this.weight += dtS
  }
  get seconds(): number {
    return this.weight
  }
  value(): number | null {
    return this.weight > 0 ? this.sum / this.weight : null
  }
}

interface SegState {
  seg: CoachSegment
  rev: number
  startedAt: number
  power: Mean
  target: Mean
  cadence: Mean
  countdownSpoken: boolean
  halfwaySpoken: boolean
  lastMinuteSpoken: boolean
  overEarlySpoken: boolean
}

type StopReason = PauseReason | 'zero'

interface StopState {
  at: number
  reason: StopReason
  announced: boolean
}

type Transition = 'natural' | 'skip' | 'back' | 'edit'

/** "5-second", "1-minute", "20-minute". */
export function prLabel(durationS: number): string {
  const s = Math.round(durationS)
  return s < 60 || s % 60 !== 0 ? `${s}-second` : `${s / 60}-minute`
}

const round = (v: number | null | undefined): number | undefined => (v === null || v === undefined || !Number.isFinite(v) ? undefined : Math.round(v))
const round1 = (v: number | null | undefined): number | undefined => (v === null || v === undefined || !Number.isFinite(v) ? undefined : Math.round(v * 10) / 10)

function compact(data: CoachData): CoachData {
  const out: CoachData = {}
  for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== null) out[k] = v
  return out
}

export class TriggerDetector {
  private readonly opts: DetectorOptions
  private fueling: FuelingPlan | null = null
  /** Moving time of the last fueling / drink reminder that was said. */
  private fuelLastS: number | null = null
  private drinkLastS: number | null = null

  private last: DetectorTick | null = null
  private metrics: DetectorMetrics | null = null
  private started = false
  private ended = false
  private planFinished = false
  private seg: SegState | null = null
  private rideCadence = new Mean()

  private stop: StopState | null = null
  private zeroSince: number | null = null
  private resumedAt = -Infinity
  private lastWorkingAt = -Infinity

  private lastTarget: number | null = null
  private lastTargetChangeAt = -Infinity
  private underSince: number | null = null
  private overSince: number | null = null
  private sagSince: number | null = null
  private hrHighSince: number | null = null
  private hrAbnormalSince: number | null = null
  private lastHrDistressAt = -Infinity
  private readonly hrWindow: { t: number; hr: number }[] = []
  private spikeArmed = true

  private intensity: { value: number | null; from: number | null; changedAt: number } = { value: null, from: null, changedAt: 0 }
  private readonly prs = new Map<number, { watts: number; at: number }>()
  private readonly prsAnnounced = new Set<number>()
  private effortBaseS = 0
  private effortMinute = 0
  private rescueAt = -Infinity
  private lastBanterAt = -Infinity
  private readonly lastSent = new Map<CoachTrigger, number>()

  constructor(opts: DetectorOptions) {
    this.opts = opts
    this.fueling = opts.fueling ?? null
  }

  /** Fueling and hydration prefs, live: the next reminder is spaced from the last one said. */
  setFueling(f: FuelingPlan | null): void {
    this.fueling = f
  }

  /** Moving time at which the next fueling reminder is due, or null when there is none. */
  private fuelDueS(): number | null {
    const f = this.fueling
    const planned = this.opts.plannedDurationS ?? null
    if (!f?.enabled || !(f.carbsPerHourG > 0) || (planned !== null && planned <= R.fuelLongRideS)) return null
    const everyS = 60 * Math.min(R.fuelMaxEveryMin, Math.max(R.fuelMinEveryMin, (60 * R.fuelPortionG) / f.carbsPerHourG))
    if (this.fuelLastS !== null) return this.fuelLastS + everyS
    // an open-ended ride only needs fuel once it turns out to be a long one
    return planned === null ? Math.max(everyS, R.fuelOpenEndedStartS) : everyS
  }

  private drinkDueS(): number | null {
    const f = this.fueling
    if (!f?.enabled || !(f.drinkEveryMin > 0)) return null
    return (this.drinkLastS ?? 0) + f.drinkEveryMin * 60
  }

  /** Feed one engine tick. */
  tick(t: DetectorTick): CoachContext[] {
    const out: CoachContext[] = []
    if (this.ended || t.state === 'ready' || t.state === 'finished') {
      this.last = t
      return out
    }
    if (t.metrics) this.metrics = t.metrics
    const dtS = this.last ? Math.min(1, Math.max(0, (t.now - this.last.now) / 1000)) : 0
    if (!this.started) {
      this.started = true
      this.push(out, t.now, 'ride_start', { workoutName: this.opts.rideKind === 'free' ? undefined : this.opts.workoutName, elapsedS: 0 })
    }
    this.trackTarget(t)
    this.trackIntensity(t, out)
    this.trackStop(t, out)
    this.trackSegments(t, out, dtS)
    this.trackAbnormalHr(t, out)
    if (!this.stop && t.state === 'riding') {
      this.trackMilestone(t, out)
      this.trackCues(t, out)
      this.trackPower(t, out)
      this.trackCadence(t, out, dtS)
      this.trackHrZone(t, out)
      this.settlePrs(t.now, out)
      this.remind(t, out)
      if (out.length === 0) this.banter(t, out)
    }
    this.last = t
    return out
  }

  /** Feed one session event. */
  event(e: SessionEvent, now: number): CoachContext[] {
    const out: CoachContext[] = []
    switch (e.type) {
      case 'state':
        if (e.state === 'paused') {
          // A zero-power stop may already have been seen; the auto-pause that follows is the same stop.
          if (!this.stop && !this.ended) this.beginStop(e.reason === 'auto' ? now - R.stopZeroS * 1000 : now, now, e.reason ?? 'user', out)
        } else if (e.state === 'riding') {
          if (this.stop) this.endStop(now, out)
        } else if (e.state === 'finished') {
          this.finish(now, out)
        }
        break
      case 'pr': {
        const record = this.opts.bests?.[e.durationS]
        if (!(record !== undefined && record > 0) || this.prsAnnounced.has(e.durationS)) break
        const prev = this.prs.get(e.durationS)
        this.prs.set(e.durationS, { watts: Math.max(prev?.watts ?? 0, e.watts), at: now })
        break
      }
      case 'plan-finished':
        if (!this.planFinished && !this.ended) {
          this.planFinished = true
          const m = this.metrics
          this.push(out, now, 'workout_complete', { elapsedS: round(this.last?.movingS), np: round(m?.np), tss: round(m?.tss), kj: round(m?.kj), workoutName: this.opts.workoutName })
        }
        break
      case 'rescue':
        this.rescueAt = now
        this.underSince = this.sagSince = null
        break
      default:
        break
    }
    return out
  }

  /** The FTP-test result, known only after the ride is saved. */
  ftpResult(r: { ftpNew: number; ftpOld: number | null }, now: number): CoachContext[] {
    const out: CoachContext[] = []
    this.push(out, now, 'ftp_test_result', { ftpNew: round(r.ftpNew), ftpOld: round(r.ftpOld) })
    return out
  }

  /** Tell the detector a line for `trigger` was actually said: retried cues stop, reminders reschedule. */
  spoken(trigger: CoachTrigger): void {
    const moving = this.last?.movingS ?? 0
    const cur = this.seg
    switch (trigger) {
      case 'countdown_10s':
        if (cur) cur.countdownSpoken = true
        break
      case 'halfway':
        if (cur) cur.halfwaySpoken = true
        break
      case 'last_minute':
        if (cur) cur.lastMinuteSpoken = true
        break
      case 'over_target_early':
        if (cur) cur.overEarlySpoken = true
        break
      case 'fueling_reminder':
        this.fuelLastS = moving
        break
      case 'hydration_reminder':
        this.drinkLastS = moving
        break
      default:
        break
    }
  }

  /** The current step as the coach sees it (null outside a plan). */
  get segment(): CoachSegment | null {
    return this.seg?.seg ?? null
  }

  /** The rider is stopped (paused, or zero power and cadence). */
  get stopped(): boolean {
    return this.stop !== null
  }

  // ---- ticks ------------------------------------------------------------------

  private trackTarget(t: DetectorTick): void {
    const target = t.targetW
    const prev = this.lastTarget
    const jumped =
      (target === null) !== (prev === null) ||
      (target !== null && prev !== null && Math.abs(target - prev) >= Math.max(R.targetJumpW, R.targetJumpFraction * prev))
    if (jumped) this.lastTargetChangeAt = t.now
    this.lastTarget = target
  }

  private trackIntensity(t: DetectorTick, out: CoachContext[]): void {
    const s = this.intensity
    if (s.value === null) {
      s.value = t.intensityPct
      return
    }
    if (t.intensityPct !== s.value) {
      s.from ??= s.value
      s.value = t.intensityPct
      s.changedAt = t.now
      this.lastTargetChangeAt = t.now
    }
    if (s.from !== null && t.now - s.changedAt >= R.intensitySettleS * 1000) {
      if (s.value !== s.from) this.push(out, t.now, s.value < s.from ? 'intensity_down' : 'intensity_up', { intensityPct: round(s.value), ...this.segData() })
      s.from = null
    }
  }

  private trackStop(t: DetectorTick, out: CoachContext[]): void {
    const now = t.now
    const riding = t.state === 'riding'
    if (riding && !this.stop && t.power3s !== null) {
      const ref = t.targetW ?? this.opts.ftpW
      if (ref > 0 && t.power3s >= R.workingFraction * ref) this.lastWorkingAt = now
    }
    if (!riding) {
      this.zeroSince = null
      return
    }
    const pedaling = (t.power !== null && t.power > 0) || (t.cadence !== null && t.cadence > 0)
    if (this.stop) {
      // Only a stop we detected ourselves ends here; paused sessions end with their 'riding' event.
      if (this.stop.reason === 'zero' && pedaling) this.endStop(now, out)
      return
    }
    const zero = t.power === 0 && (t.cadence === null || t.cadence === 0)
    if (!zero) {
      this.zeroSince = null
      return
    }
    this.zeroSince ??= now
    if (now - this.zeroSince >= R.stopZeroS * 1000) this.beginStop(this.zeroSince, now, 'zero', out)
  }

  private beginStop(at: number, now: number, reason: StopReason, out: CoachContext[]): void {
    this.stop = { at, reason, announced: false }
    this.zeroSince = null
    this.resetHolds()
    const moving = this.last?.movingS ?? 0
    // Sleep and sensor dropouts are not the rider's doing; the first seconds are just getting on.
    if (reason === 'system' || reason === 'sensor-lost' || moving < R.stopMinMovingS || this.ended) return
    const seg = this.seg?.seg
    const sudden = reason !== 'user' && seg?.hard === true && at - this.lastWorkingAt <= R.workingWithinS * 1000
    if (sudden) this.push(out, now, 'distress', { power: round(this.last?.power3s), hr: round(this.last?.hr), ...this.segData() })
    else this.push(out, now, 'stopped_pedaling', { elapsedS: round(moving), ...this.segData() })
    this.stop.announced = true
  }

  private endStop(now: number, out: CoachContext[]): void {
    const s = this.stop
    this.stop = null
    this.zeroSince = null
    this.resumedAt = now
    this.lastTargetChangeAt = now
    this.resetHolds()
    if (!s || this.ended) return
    const pausedS = Math.round((now - s.at) / 1000)
    if (s.announced && pausedS >= R.resumeMinPauseS) this.push(out, now, 'resumed', { pausedS, elapsedS: round(this.last?.movingS), ...this.segData() })
  }

  private resetHolds(): void {
    this.underSince = this.overSince = this.sagSince = this.hrHighSince = null
  }

  private trackSegments(t: DetectorTick, out: CoachContext[], dtS: number): void {
    const plan = t.plan
    const idx = plan.finished ? null : plan.segmentIndex
    const rev = plan.timelineRev ?? 0
    const cur = this.seg
    const lastPlan = this.last?.plan
    if (idx === null) {
      if (cur) this.closeSegment(cur, null, 'natural', t.now, out)
      this.seg = null
      return
    }
    if (cur && cur.seg.index === idx) {
      const elapsed = plan.segmentElapsedS
      const prevElapsed = lastPlan?.segmentElapsedS ?? null
      if (elapsed !== null && prevElapsed !== null && elapsed < prevElapsed - 1.5 && rev === cur.rev) {
        // "back" to the start of the same step: ride it again
        this.openSegment(idx, rev, t, out, null, 'back')
        return
      }
      if (rev !== cur.rev) {
        cur.rev = rev
        const extra = (plan.segmentRemainingS ?? 0) - (lastPlan?.segmentRemainingS ?? 0)
        cur.seg = this.resolve(idx, t) ?? cur.seg
        if (extra >= R.extendMinS) this.push(out, t.now, 'extended_interval', { extraS: Math.round(extra), segmentLabel: cur.seg.label, ...this.segData() })
      }
      this.accumulate(cur, t, dtS)
      return
    }
    let reason: Transition = 'natural'
    if (cur) {
      if (rev !== cur.rev) reason = 'edit'
      else if (idx < cur.seg.index) reason = 'back'
      else if ((lastPlan?.segmentRemainingS ?? 0) > R.skipMinRemainingS) reason = 'skip'
    }
    const next = this.resolve(idx, t)
    if (cur) this.closeSegment(cur, next, reason, t.now, out)
    this.openSegment(idx, rev, t, out, cur?.seg ?? null, reason, next)
  }

  private resolve(index: number, t: DetectorTick): CoachSegment | null {
    const fromPlan = this.opts.segments?.(index)
    if (fromPlan) return fromPlan
    return t.plan.segmentIndex === index ? segmentFromTick(t.plan, this.opts.ftpW) : null
  }

  private nextSegment(t: DetectorTick): CoachSegment | null {
    const idx = t.plan.segmentIndex
    if (idx === null) return null
    const fromPlan = this.opts.segments?.(idx + 1)
    if (fromPlan) return fromPlan
    return t.plan.next ? segmentFromNext(t.plan.next, idx + 1, this.opts.ftpW) : null
  }

  private openSegment(
    idx: number,
    rev: number,
    t: DetectorTick,
    out: CoachContext[],
    prev: CoachSegment | null,
    reason: Transition,
    resolved?: CoachSegment | null,
  ): void {
    const seg = resolved ?? this.resolve(idx, t)
    if (!seg) {
      this.seg = null
      return
    }
    this.seg = {
      seg,
      rev,
      startedAt: t.now,
      power: new Mean(),
      target: new Mean(),
      cadence: new Mean(),
      countdownSpoken: false,
      halfwaySpoken: false,
      lastMinuteSpoken: false,
      overEarlySpoken: false,
    }
    this.lastTargetChangeAt = t.now
    this.resetHolds()
    if (seg.ftpEffort) {
      // Consecutive effort steps (the ramp test's one-minute steps) are one effort.
      if (prev?.ftpEffort && reason === 'natural') this.effortBaseS += prev.durationS
      else this.effortBaseS = this.effortMinute = 0
      if (prev?.ftpEffort) return
    }
    if (!isAnnounced(seg)) return
    this.push(out, t.now, 'segment_start', {
      segmentKind: seg.kind,
      hard: seg.hard,
      targetW: round(t.targetW),
      remainingS: round(t.plan.segmentRemainingS ?? seg.durationS),
      durationS: round(seg.durationS),
      segmentLabel: seg.label,
      rep: seg.rep,
      reps: seg.reps,
    })
  }

  /** The verdict on a hard segment that just ended, when it is worth one. */
  private closeSegment(cur: SegState, next: CoachSegment | null, reason: Transition, now: number, out: CoachContext[]): void {
    const s = cur.seg
    if (reason === 'skip') {
      if (s.hard && !s.ftpEffort) this.push(out, now, 'skipped_interval', { segmentLabel: s.label, segmentKind: s.kind, hard: true, rep: s.rep, reps: s.reps })
      return
    }
    // Edits (extend, the rescue breather) and "back" are not endings; FTP efforts get their result later.
    if (reason !== 'natural' || !s.hard || s.ftpEffort) return
    // Hard into hard (over-unders): the next cue matters more than a verdict.
    if (next?.hard) return
    if (isMicro(s) && s.rep !== s.reps) return
    const avg = cur.power.value()
    if (avg === null || cur.power.seconds < Math.min(5, s.durationS / 2)) return
    const target = cur.target.value()
    // decided on the numbers that are sent, so the line can never contradict them
    const pct = round1(target !== null && target > 0 ? (avg / target) * 100 : null)
    const failed = pct !== undefined && pct < T.failedBelowPct
    this.push(out, now, failed ? 'segment_end_failed' : 'segment_end_success', {
      avgW: round(avg),
      targetW: round(target),
      pct,
      segmentKind: s.kind,
      hard: true,
      segmentLabel: s.label,
      rep: s.rep,
      reps: s.reps,
    })
  }

  private accumulate(cur: SegState, t: DetectorTick, dtS: number): void {
    if (t.state !== 'riding' || this.stop || dtS <= 0) return
    const elapsed = t.plan.segmentElapsedS ?? (t.now - cur.startedAt) / 1000
    if (t.targetW !== null && elapsed < R.ergSettleS) return
    if (t.power !== null) cur.power.add(t.power, dtS)
    if (t.targetW !== null) cur.target.add(t.targetW, dtS)
  }

  /** Countdowns, halfway, last minute and FTP-test minute marks. */
  private trackCues(t: DetectorTick, out: CoachContext[]): void {
    const cur = this.seg
    const plan = t.plan
    const elapsed = plan.segmentElapsedS
    const remaining = plan.segmentRemainingS
    if (!cur || elapsed === null || remaining === null) return
    const s = cur.seg
    const now = t.now
    const dur = elapsed + remaining

    if (!s.hard && !cur.countdownSpoken && remaining <= T.countdownS && remaining > R.countdownLatestS) {
      const next = this.nextSegment(t)
      if (next?.hard && isAnnounced(next) && !(s.ftpEffort && next.ftpEffort)) {
        this.pushEvery(out, now, 'countdown_10s', {
          segmentKind: next.kind,
          hard: true,
          targetW: round(plan.next?.watts),
          remainingS: round(remaining),
          durationS: round(next.durationS),
          segmentLabel: next.label,
          rep: next.rep,
          reps: next.reps,
        })
      }
    }

    if (s.hard && !s.ftpEffort) {
      const effort = { power: round(t.power3s), targetW: round(t.targetW), remainingS: round(remaining), durationS: round(dur), ...this.segData() }
      if (!cur.halfwaySpoken && dur >= T.halfwayMinS && elapsed >= dur / 2 && elapsed <= dur / 2 + R.halfwayRetryS && remaining > 5) {
        this.pushEvery(out, now, 'halfway', effort)
      }
      if (!cur.lastMinuteSpoken && dur >= T.lastMinuteMinS && remaining <= 60 && remaining >= 60 - R.lastMinuteRetryS) {
        this.pushEvery(out, now, 'last_minute', effort)
      }
    }

    if (s.ftpEffort && plan.effort) {
      const minute = Math.floor((this.effortBaseS + plan.effort.elapsedS) / 60)
      if (minute > this.effortMinute) {
        this.effortMinute = minute
        const ramp = this.opts.ftpTestProtocol === 'ramp'
        if (minute >= 1 && (ramp || plan.effort.remainingS >= 5)) {
          this.push(out, now, 'ftp_test_minute', {
            minute,
            projectedFtp: round(plan.effort.projectedFtpW),
            ftpOld: round(this.opts.ftpW),
            remainingS: ramp ? undefined : round(plan.effort.remainingS),
            ...this.segData(),
          })
        }
      }
    }
  }

  /** Under target (ERG), over target early (not ERG), and W′bal. */
  private trackPower(t: DetectorTick, out: CoachContext[]): void {
    const now = t.now
    const target = t.targetW
    const p = t.power3s
    const quiet = now - this.rescueAt < R.rescueQuietS * 1000
    const remainingS = round(t.plan.segmentRemainingS)
    // judged on the watts that are sent, so "{deficitW} watts under" always matches the trigger
    const tw = target !== null && target > 0 ? Math.round(target) : null

    const graceOver = now - this.lastTargetChangeAt >= T.targetChangeGraceS * 1000
    const under = p === null ? null : Math.floor(p)
    if (t.erg && tw !== null && under !== null && under < tw * (1 - T.underTargetPct / 100) && graceOver && !quiet) {
      this.underSince ??= now
      if (now - this.underSince >= T.underTargetHoldS * 1000) {
        this.pushEvery(out, now, 'under_target', { power: under, targetW: tw, erg: true, remainingS, ...this.segData() })
      }
    } else {
      this.underSince = null
    }

    const cur = this.seg
    const elapsed = t.plan.segmentElapsedS
    const dur = elapsed !== null && t.plan.segmentRemainingS !== null ? elapsed + t.plan.segmentRemainingS : null
    const early =
      cur !== null &&
      !cur.overEarlySpoken &&
      elapsed !== null &&
      dur !== null &&
      dur >= T.overTargetEarlyMinS &&
      elapsed <= dur * T.overTargetEarlyFraction &&
      elapsed >= T.targetChangeGraceS
    const over = p === null ? null : Math.ceil(p)
    if (!t.erg && early && tw !== null && over !== null && over > tw * (1 + T.overTargetEarlyPct / 100)) {
      this.overSince ??= now
      if (now - this.overSince >= R.overTargetHoldS * 1000) {
        this.pushEvery(out, now, 'over_target_early', { power: over, targetW: tw, erg: false, remainingS, ...this.segData() })
      }
    } else {
      this.overSince = null
    }

    // W′bal is a condition: sent while it holds, paced by the engine's cooldown.
    const wPrime = this.opts.wPrimeJ ?? DEFAULT_W_PRIME_J
    const wbalJ = this.metrics?.wbalJ
    if (wbalJ === null || wbalJ === undefined || !(wPrime > 0)) return
    const pct = (wbalJ / wPrime) * 100
    // Only while it is being spent: a low reserve during recovery is just recovery.
    const draining = cur?.seg.hard === true || (p !== null && p >= this.opts.ftpW)
    if (pct < T.wbalLowPct && draining) {
      this.pushEvery(out, now, pct <= R.wbalEmptyPct ? 'wbal_empty' : 'wbal_low', {
        // floored, so "below 25 %" never reads as 25
        wbalPct: Math.max(0, Math.floor(pct)),
        power: round(p),
        targetW: round(target),
        ...this.segData(),
      })
    }
  }

  private trackCadence(t: DetectorTick, out: CoachContext[], dtS: number): void {
    const now = t.now
    const cur = this.seg
    const acc = cur ? cur.cadence : this.rideCadence
    const c = t.cadence3s
    const into = cur ? (t.plan.segmentElapsedS ?? (now - cur.startedAt) / 1000) : t.movingS
    const warm = into >= R.cadenceSagWarmupS && now - this.resumedAt >= R.cadenceSagWarmupS * 1000
    if (c === null || c < R.minPedalingRpm || !warm) {
      this.sagSince = null
      return
    }
    const avg = acc.value()
    const sagging = avg !== null && acc.seconds >= R.cadenceSagMinAvgS && avg - c >= T.cadenceSagRpm
    if (!sagging) {
      // the reference is the rider's normal cadence, so sagging samples are left out of it
      acc.add(c, dtS)
      this.sagSince = null
      return
    }
    this.sagSince ??= now
    const quiet = now - this.rescueAt < R.rescueQuietS * 1000
    if (now - this.sagSince >= R.cadenceSagHoldS * 1000 && !quiet) {
      this.pushEvery(out, now, 'cadence_sag', { cadence: round(c), cadenceAvg: round(avg), power: round(t.power3s), targetW: round(t.targetW), ...this.segData() })
    }
  }

  private hrAbnormalLimit(): number {
    const max = this.opts.maxHr
    return max && max > 0 ? max + R.hrAbnormalOverMaxBpm : R.hrAbnormalFallbackBpm
  }

  /** Abnormal HR is distress, stopped or not. */
  private trackAbnormalHr(t: DetectorTick, out: CoachContext[]): void {
    const hr = t.hr
    const now = t.now
    if (hr === null || hr < this.hrAbnormalLimit() || this.ended) {
      this.hrAbnormalSince = null
      return
    }
    this.hrAbnormalSince ??= now
    if (now - this.hrAbnormalSince >= R.hrAbnormalHoldS * 1000 && now - this.lastHrDistressAt >= R.hrDistressRepeatS * 1000) {
      this.lastHrDistressAt = now
      this.push(out, now, 'distress', { hr: round(hr), power: round(t.power3s), ...this.segData() })
    }
  }

  /** The HR cap for the current step: the Friel zone matching its power zone, for steady aerobic work only. */
  private hrCap(t: DetectorTick): number | null {
    const cur = this.seg
    if (!cur) return null
    const s = cur.seg
    if (s.hard || s.ftpEffort || s.kind === 'off' || s.kind === 'freeride') return null
    if ((t.plan.segmentElapsedS ?? 0) < R.hrHighSettleS) return null
    const lthr = this.opts.lthr && this.opts.lthr > 0 ? this.opts.lthr : this.opts.maxHr && this.opts.maxHr > 0 ? 0.9 * this.opts.maxHr : null
    const f = s.fraction ?? (t.targetW !== null && this.opts.ftpW > 0 ? t.targetW / this.opts.ftpW : null)
    if (lthr === null || f === null) return null
    const zone = COGGAN_POWER.zones.findIndex((z) => f >= z.lo && (z.hi === null || f < z.hi))
    // power Z1-Z3 (recovery, endurance, tempo) map onto Friel HR Z1-Z3; above that HR is meant to be high
    if (zone < 0 || zone > 2) return null
    const hi = FRIEL_HR_LTHR.zones[zone]?.hi
    return hi ? Math.round(lthr * hi) : null
  }

  /** hr_high (drift above the zone cap) and hr_spike_no_power (a strap glitch). */
  private trackHrZone(t: DetectorTick, out: CoachContext[]): void {
    const hr = t.hr
    const now = t.now
    if (hr === null) {
      this.hrHighSince = null
      return
    }
    const win = this.hrWindow
    win.push({ t: now, hr })
    while (win.length > 0 && win[0]!.t < now - R.hrSpikeWindowS * 1000) win.shift()
    const limit = this.hrAbnormalLimit()
    const max = this.opts.maxHr
    const floor = max && max > 0 ? R.hrSpikeMaxHrFraction * max : R.hrSpikeFallbackBpm
    if (!this.spikeArmed && hr < floor - 5) this.spikeArmed = true
    let low = hr
    for (const s of win) low = Math.min(low, s.hr)
    const p = t.power3s
    if (this.spikeArmed && hr - low >= R.hrSpikeJumpBpm && hr >= floor && hr < limit && p !== null && p < R.hrSpikeMaxPowerFraction * this.opts.ftpW) {
      this.spikeArmed = false
      this.push(out, now, 'hr_spike_no_power', { hr: round(hr), power: round(p), ...this.segData() })
      return
    }
    const cap = this.hrCap(t)
    const bpm = Math.round(hr)
    if (cap !== null && this.spikeArmed && bpm > cap && hr < limit) {
      this.hrHighSince ??= now
      if (now - this.hrHighSince >= R.hrHighHoldS * 1000) {
        this.pushEvery(out, now, 'hr_high', { hr: bpm, hrCap: cap, power: round(p), targetW: round(t.targetW), ...this.segData() })
      }
    } else {
      this.hrHighSince = null
    }
  }

  /** PRs are announced once the effort stops improving them; the longest duration wins. */
  private settlePrs(now: number, out: CoachContext[]): void {
    let best: { durationS: number; watts: number } | null = null
    for (const [durationS, v] of this.prs) {
      if (now - v.at < R.prSettleS * 1000) continue
      if (!best || durationS > best.durationS) best = { durationS, watts: v.watts }
      this.prs.delete(durationS)
      this.prsAnnounced.add(durationS)
    }
    if (best) this.push(out, now, 'pr', { prLabel: prLabel(best.durationS), power: round(best.watts), ...this.segData() })
  }

  /** The run-up to a hard segment's countdown, when nothing optional should start. */
  private nearHardStart(t: DetectorTick): boolean {
    const remaining = t.plan.segmentRemainingS
    return this.seg !== null && remaining !== null && remaining <= T.countdownS + R.banterQuietBeforeCountdownS && this.nextSegment(t)?.hard === true
  }

  private remind(t: DetectorTick, out: CoachContext[]): void {
    if (!this.fueling?.enabled || this.seg?.seg.hard || this.nearHardStart(t)) return
    const left = t.plan.remainingS
    if (left !== null && left < R.reminderEndQuietS) return
    const m = t.movingS
    const fuel = this.fuelDueS()
    if (fuel !== null && m >= fuel) {
      this.pushEvery(out, t.now, 'fueling_reminder', { elapsedS: round(m) }, R.reminderRepeatS)
      return
    }
    const drink = this.drinkDueS()
    if (drink !== null && m >= drink) this.pushEvery(out, t.now, 'hydration_reminder', { elapsedS: round(m) }, R.reminderRepeatS)
  }

  private banter(t: DetectorTick, out: CoachContext[]): void {
    const now = t.now
    if (t.movingS < R.banterMinMovingS || now - this.lastBanterAt < R.banterEveryS * 1000) return
    if (now - this.rescueAt < R.rescueQuietS * 1000) return
    const cur = this.seg
    if (cur && (cur.seg.hard || now - cur.startedAt < R.banterQuietAfterStartS * 1000 || this.nearHardStart(t))) return
    this.lastBanterAt = now
    this.push(out, now, 'idle_banter', { elapsedS: round(t.movingS), power: round(t.power3s), cadence: round(t.cadence3s), targetW: round(t.targetW), ...this.segData() })
  }

  /** Is there still real work left in the plan (so stopping now is a bail)? */
  private workLeft(): boolean {
    const plan = this.last?.plan
    const remaining = plan?.remainingS ?? null
    if (!plan || remaining === null || remaining > R.bailMinRemainingS) return true
    const idx = plan.segmentIndex
    const resolve = this.opts.segments
    if (idx === null || !resolve) return false
    for (let i = idx; i < idx + 500; i++) {
      const s = resolve(i)
      if (!s) break
      if (s.hard && (i > idx || (plan.segmentRemainingS ?? 0) > T.countdownS)) return true
    }
    return false
  }

  private finish(now: number, out: CoachContext[]): void {
    if (this.ended) return
    this.ended = true
    this.stop = null
    const moving = this.last?.movingS ?? 0
    if (this.planFinished) return
    const m = this.metrics
    const complete = { elapsedS: round(moving), np: round(m?.np), tss: round(m?.tss), kj: round(m?.kj) }
    if (this.opts.rideKind === 'free') {
      if (moving >= R.freeRideCompleteMinS) this.push(out, now, 'workout_complete', complete)
    } else if (moving >= R.bailMinMovingS) {
      // stopping in the last minutes of the cool-down is finishing, not bailing
      if (this.workLeft()) this.push(out, now, 'ride_bailed', { elapsedS: round(moving), remainingS: round(this.last?.plan.remainingS) })
      else this.push(out, now, 'workout_complete', { ...complete, workoutName: this.opts.workoutName })
    }
  }

  // ---- output -----------------------------------------------------------------

  private segData(): CoachData {
    const s = this.seg?.seg
    return s ? { segmentKind: s.kind, hard: s.hard, rep: s.rep, reps: s.reps } : {}
  }

  /** A journey passed a town, border, summit, halfway or its finish. */
  private trackMilestone(t: DetectorTick, out: CoachContext[]): void {
    const m = t.plan.milestone
    if (!m) return
    this.push(out, t.now, 'journey_milestone', { place: m.name, milestoneKind: m.kind, journeyName: m.journeyName, kmDone: m.kmDone, kmLeft: m.kmLeft })
  }

  private push(out: CoachContext[], now: number, trigger: CoachTrigger, data: CoachData): void {
    const iff = this.metrics?.if
    out.push({ now, trigger, data: compact(data), rideKind: this.opts.rideKind, ...(iff !== null && iff !== undefined && Number.isFinite(iff) ? { intensityFactor: iff } : {}) })
    this.lastSent.set(trigger, now)
  }

  private pushEvery(out: CoachContext[], now: number, trigger: CoachTrigger, data: CoachData, everyS: number = R.conditionRepeatS): void {
    if (now - (this.lastSent.get(trigger) ?? -Infinity) < everyS * 1000) return
    this.push(out, now, trigger, data)
  }
}
