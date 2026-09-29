// WorkoutPlan plays a structured workout, or an FTP test, as a RidePlan.
//
// The rider's place in the workout ("position", in timeline seconds) is
// moving time plus an offset. Skip and back change the offset. Extend and the
// interval-rescue breather edit a private copy of the timeline, always at or
// after the current position, so nothing already ridden ever moves. A log of
// offset changes maps each recorded second back onto the final timeline for
// post-ride analysis (FTP tests use it).
import type { Desired } from '../control/trainer-controller'
import { COGGAN_POWER } from '../metrics/zones'
import { compileWorkout, resolvePower, stepAt, targetAt, type TargetAt, type Timeline, type TimelineStep } from '../workout/compile'
import { computeFtpFromTest, type FtpTestResult } from '../workout/ftp-tests'
import { matchesEffortLabel } from '../workout/labels'
import type { FtpTestSpec, PowerTarget, Workout } from '../workout/model'
import { formatClock } from '../workout/numbers'
import type { RideCommand } from '../../shared/live'
import type { EffortProgress, PlanInput, PlanNext, PlanTick, RescueOffer, RidePlan } from './plan'
import type { RideKind } from './types'

/** What the trainer does while ERG is off (free ride, max effort, FTP-test efforts). */
export type ErgOffDesired = { mode: 'sim'; gradePct: number } | { mode: 'resistance'; pct: number }

export interface WorkoutPlanOptions {
  ftpW: number
  /** Default: a flat road (SIM 0 %), so the rider paces with the gears. */
  ergOff?: ErgOffDesired
  /** ERG targets go out this many seconds early to hide trainer lag. Default 1. */
  leadS?: number
  /** Offer interval rescue when a hard interval is failing. Default true. */
  rescue?: boolean
}

export const FLAT_ROAD: ErgOffDesired = { mode: 'sim', gradePct: 0 }

// Interval rescue: a hard step (≥ 88 % FTP) that is 15 s in, with ≥ 20 s to go,
// where the rider has been under 85 % of target (or below 50 rpm) for 10 s.
const RESCUE_HARD_FRACTION = 0.88
const RESCUE_UNDER = 0.85
const RESCUE_LOW_CADENCE = 50
const RESCUE_GRACE_S = 15
const RESCUE_MIN_REMAINING_S = 20
const RESCUE_AFTER_S = 10
export const RESCUE_REST_S = 30
const RESCUE_REST_FRACTION = 0.5

// Ramp test: the rider has failed when cadence stays under 55 rpm for 2.5 s
// (before auto-pause's 3 s of zeros), or, without cadence, power under 60 % of
// target for 5 s.
const RAMP_FAIL_CADENCE = 55
const RAMP_FAIL_CADENCE_S = 2.5
const RAMP_FAIL_UNDER = 0.6
const RAMP_FAIL_POWER_S = 5
const RAMP_WINDOW_S = 60

/** Back within this many seconds of a step's start goes to the previous step. */
const BACK_TO_PREVIOUS_S = 3

const EPS = 1e-6

interface PositionMark {
  movingS: number
  posS: number
}

export class WorkoutPlan implements RidePlan {
  readonly kind: RideKind
  readonly name: string
  readonly workoutId: string
  readonly workoutJson: string
  readonly workout: Workout

  private tl: Timeline
  private rev = 0
  private repCounts = new Map<number, number>()
  private offsetS = 0
  private lastPos = 0
  private readonly marks: PositionMark[] = [{ movingS: 0, posS: 0 }]
  private override: ErgOffDesired | null = null
  private resistancePct = 25
  private gradePct = 0
  private readonly cues: string[] = []

  private troubleSince: number | null = null
  private readonly rescued = new Set<string>()
  private pendingRescue: RescueOffer | null = null

  private effort = { stepIndex: -1, lastElapsedS: 0, sumWs: 0, validS: 0 }
  private readonly rampWindow: { t: number; w: number; dt: number }[] = []
  private rampBestW: number | null = null
  private rampTroubleSince: number | null = null
  private rampEndedAt: number | null = null

  constructor(
    workout: Workout,
    private readonly opts: WorkoutPlanOptions,
  ) {
    this.workout = workout
    this.kind = workout.ftpTest ? 'ftp-test' : 'workout'
    this.name = workout.name
    this.workoutId = workout.id
    this.workoutJson = JSON.stringify(workout)
    this.tl = compileWorkout(workout)
    this.countReps()
  }

  /** FTP the workout's targets are sized to. */
  get ftpW(): number {
    return this.opts.ftpW
  }
  /** The timeline as edited by extend / rescue so far. */
  get timeline(): Timeline {
    return this.tl
  }
  get revision(): number {
    return this.rev
  }
  /** Timeline position where a ramp test ended on failure, if it did. */
  get rampEndedAtS(): number | null {
    return this.rampEndedAt
  }
  /** The rider switched to level/slope for this workout (null = ERG, as written). */
  get manualMode(): ErgOffDesired | null {
    return this.override
  }

  positionAt(movingS: number): number {
    let mark = this.marks[0]!
    for (const m of this.marks) {
      if (m.movingS > movingS + EPS) break
      mark = m
    }
    return clamp(mark.posS + (movingS - mark.movingS), 0, this.tl.durationS)
  }

  tick(input: PlanInput): PlanTick {
    let pos = this.pos(input.movingS)
    this.collectTexts(pos)
    let cur = pos < this.tl.durationS ? targetAt(this.tl, pos, this.opts.ftpW) : null
    if (cur && this.rampFailed(cur, input)) {
      pos = this.pos(input.movingS)
      cur = pos < this.tl.durationS ? targetAt(this.tl, pos, this.opts.ftpW) : null
    }
    if (!cur) return this.finishedTick()
    this.trackEffort(cur, input)
    this.checkRescue(cur, input)
    return this.stepTick(cur, pos, input)
  }

  command(cmd: RideCommand, movingS: number): boolean {
    switch (cmd.type) {
      case 'skip':
        return this.skip(movingS)
      case 'back':
        return this.back(movingS)
      case 'extend':
        return this.extend(movingS, cmd.seconds)
      case 'mode':
        return this.setMode(cmd.mode)
      case 'nudge':
        return this.nudge(cmd.delta)
      case 'rescue':
        if (cmd.choice === 'rest') return this.rest(movingS)
        this.pendingRescue = null
        return cmd.choice === 'dismiss'
      default:
        return false
    }
  }

  /** Values from 1 Hz records (record t covers moving [t, t+1)) placed on the final timeline. */
  alignToTimeline<R extends { t: number }, T>(records: readonly R[], pick: (r: R) => T | null): (T | null)[] {
    const out: (T | null)[] = new Array<T | null>(Math.ceil(this.tl.durationS - EPS)).fill(null)
    for (const r of records) {
      const k = Math.floor(this.positionAt(r.t + 0.5))
      if (k >= 0 && k < out.length) out[k] = pick(r)
    }
    return out
  }

  /** FTP from the recorded test (null when this isn't an FTP test or no effort was recorded). */
  ftpResult(records: readonly { t: number; power: number | null }[]): FtpTestResult | null {
    const power = this.alignToTimeline(records, (r) => r.power)
    return computeFtpFromTest(this.workout, this.tl, power)
  }

  // ---- ticks ------------------------------------------------------------------

  private stepTick(cur: TargetAt, pos: number, input: PlanInput): PlanTick {
    const step = cur.step
    const scale = (input.intensityPct ?? 100) / 100
    const spec = this.effortSpec(step)
    const pacing = spec && cur.ergOff ? this.pacingTarget(spec) : null
    const targetW = cur.watts !== null ? Math.round(cur.watts * scale) : pacing
    const next = cur.next
    return {
      desired: this.desired(cur, pos),
      targetW,
      segmentIndex: step.index,
      segmentLabel: this.label(step),
      segmentKind: step.kind,
      segmentRemainingS: cur.stepRemainingS,
      segmentElapsedS: cur.stepElapsedS,
      nextLabel: next ? this.describe(next, scale) : 'Finish',
      next: next ? this.nextInfo(next, scale) : null,
      remainingS: this.tl.durationS - pos,
      finished: false,
      cue: this.cues.shift() ?? null,
      positionS: pos,
      timelineRev: this.rev,
      cadence: cur.cadence ?? null,
      targetRangeW: this.range(step, scale),
      rescue: this.takeRescue(),
      effort: spec ? this.effortProgress(cur, spec, pacing) : null,
    }
  }

  private finishedTick(): PlanTick {
    const last = this.tl.steps.at(-1)
    const easyW = 0.5 * this.opts.ftpW
    const lastW = last?.to ? resolvePower(last.to, this.opts.ftpW) : easyW
    const desired: Desired = this.override ?? (last?.ergOff ? (this.opts.ergOff ?? FLAT_ROAD) : { mode: 'erg', watts: Math.min(lastW, easyW) })
    return {
      desired,
      targetW: null,
      segmentIndex: this.tl.steps.length,
      segmentLabel: 'Workout complete',
      segmentKind: 'done',
      segmentRemainingS: null,
      segmentElapsedS: null,
      nextLabel: null,
      next: null,
      remainingS: 0,
      finished: true,
      cue: this.cues.shift() ?? null,
      positionS: this.tl.durationS,
      timelineRev: this.rev,
    }
  }

  private desired(cur: TargetAt, pos: number): Desired {
    if (this.override) return this.override
    if (cur.ergOff) return this.opts.ergOff ?? FLAT_ROAD
    const ahead = targetAt(this.tl, Math.min(pos + (this.opts.leadS ?? 1), this.tl.durationS - EPS), this.opts.ftpW)
    const watts = ahead && !ahead.ergOff && ahead.watts !== null ? ahead.watts : (cur.watts ?? 0)
    return { mode: 'erg', watts }
  }

  // ---- commands -----------------------------------------------------------------

  private skip(movingS: number): boolean {
    const pos = this.pos(movingS)
    const step = stepAt(this.tl, pos)
    if (!step) return false
    const spec = this.workout.ftpTest
    const to = spec?.protocol === 'ramp' && matchesEffortLabel(step.label, spec.effortLabel) ? this.afterEfforts(spec) : step.endS
    this.jump(movingS, to)
    return true
  }

  private back(movingS: number): boolean {
    const pos = this.pos(movingS)
    const step = stepAt(this.tl, pos) ?? this.tl.steps.at(-1)
    if (!step) return false
    const prev = this.tl.steps[step.index - 1]
    const to = pos - step.startS <= BACK_TO_PREVIOUS_S && prev && pos < this.tl.durationS ? prev.startS : step.startS
    this.jump(movingS, to)
    return true
  }

  private extend(movingS: number, seconds: number): boolean {
    const step = stepAt(this.tl, this.pos(movingS))
    if (!step || !(seconds > 0)) return false
    this.edit(extendStep(this.tl, step.index, seconds))
    return true
  }

  private rest(movingS: number): boolean {
    this.pendingRescue = null
    const pos = this.pos(movingS)
    const step = stepAt(this.tl, pos)
    if (!step || step.ergOff) return false
    this.edit(insertRest(this.tl, pos, RESCUE_REST_S, this.restPower(step), 'Breather', this.opts.ftpW))
    this.cues.push('Thirty seconds to breathe. Then we finish what we started.')
    return true
  }

  private setMode(mode: 'erg' | 'resistance' | 'sim' | 'hr'): boolean {
    if (mode === 'hr') return false
    this.override = mode === 'erg' ? null : mode === 'resistance' ? { mode, pct: this.resistancePct } : { mode, gradePct: this.gradePct }
    return true
  }

  private nudge(delta: number): boolean {
    const o = this.override
    if (!o) return false
    if (o.mode === 'resistance') {
      this.resistancePct = clamp(Math.round(o.pct + delta), 0, 100)
      this.override = { mode: 'resistance', pct: this.resistancePct }
    } else {
      this.gradePct = clamp(Math.round((o.gradePct + delta) * 10) / 10, -10, 20)
      this.override = { mode: 'sim', gradePct: this.gradePct }
    }
    return true
  }

  // ---- position and cues --------------------------------------------------------

  private pos(movingS: number): number {
    return clamp(movingS + this.offsetS, 0, this.tl.durationS)
  }

  private jump(movingS: number, posS: number): void {
    const to = clamp(posS, 0, this.tl.durationS)
    this.offsetS = to - movingS
    this.lastPos = to
    this.cues.length = 0
    this.troubleSince = null
    this.rampTroubleSince = null
    this.marks.push({ movingS, posS: to })
  }

  private edit(tl: Timeline): void {
    this.tl = tl
    this.rev++
    this.countReps()
  }

  /** Cues whose time was crossed since the last tick, moving forward only. */
  private collectTexts(pos: number): void {
    if (pos > this.lastPos) {
      for (const t of this.tl.texts) if (t.atS >= this.lastPos && t.atS < pos) this.cues.push(t.message)
    }
    this.lastPos = pos
  }

  // ---- FTP tests ----------------------------------------------------------------

  private effortSpec(step: TimelineStep): FtpTestSpec | null {
    const spec = this.workout.ftpTest
    return spec && matchesEffortLabel(step.label, spec.effortLabel) ? spec : null
  }

  /** The average that would confirm the current FTP (20-min: FTP / 0.95). */
  private pacingTarget(spec: FtpTestSpec): number | null {
    return spec.protocol === 'ramp' || !(spec.factor > 0) ? null : Math.round(this.opts.ftpW / spec.factor)
  }

  private afterEfforts(spec: FtpTestSpec): number {
    const last = this.tl.steps.findLast((s) => matchesEffortLabel(s.label, spec.effortLabel))
    return last ? last.endS : this.tl.durationS
  }

  private trackEffort(cur: TargetAt, input: PlanInput): void {
    const spec = this.effortSpec(cur.step)
    if (!spec) return
    if (spec.protocol === 'ramp') {
      if (input.power === null) return
      this.rampWindow.push({ t: input.movingS, w: input.power, dt: input.dtS })
      while (this.rampWindow.length > 0 && this.rampWindow[0]!.t <= input.movingS - RAMP_WINDOW_S) this.rampWindow.shift()
      const covered = this.rampWindow.reduce((a, s) => a + s.dt, 0)
      if (covered >= RAMP_WINDOW_S - 3) {
        const mean = this.rampWindow.reduce((a, s) => a + s.w * s.dt, 0) / covered
        this.rampBestW = Math.max(this.rampBestW ?? 0, mean)
      }
      return
    }
    const e = this.effort
    if (e.stepIndex !== cur.step.index || cur.stepElapsedS + 1 < e.lastElapsedS) {
      this.effort = { stepIndex: cur.step.index, lastElapsedS: cur.stepElapsedS, sumWs: 0, validS: 0 }
    }
    this.effort.lastElapsedS = cur.stepElapsedS
    if (input.power !== null) {
      this.effort.sumWs += input.power * input.dtS
      this.effort.validS += input.dtS
    }
  }

  private effortProgress(cur: TargetAt, spec: FtpTestSpec, pacing: number | null): EffortProgress {
    const ramp = spec.protocol === 'ramp'
    const avgW = ramp ? this.rampBestW : this.effort.stepIndex === cur.step.index && this.effort.validS >= 1 ? this.effort.sumWs / this.effort.validS : null
    return {
      label: cur.step.label ?? spec.effortLabel,
      elapsedS: cur.stepElapsedS,
      remainingS: cur.stepRemainingS,
      avgW: avgW === null ? null : Math.round(avgW),
      targetW: pacing,
      projectedFtpW: avgW === null ? null : Math.round(avgW * spec.factor),
    }
  }

  private rampFailed(cur: TargetAt, input: PlanInput): boolean {
    const spec = this.workout.ftpTest
    if (spec?.protocol !== 'ramp' || !matchesEffortLabel(cur.step.label, spec.effortLabel) || cur.watts === null) {
      this.rampTroubleSince = null
      return false
    }
    const target = (cur.watts * (input.intensityPct ?? 100)) / 100
    const byCadence = input.cadence !== null
    const failing = byCadence ? input.cadence! < RAMP_FAIL_CADENCE : input.power !== null && input.power < RAMP_FAIL_UNDER * target
    if (!failing) {
      this.rampTroubleSince = null
      return false
    }
    this.rampTroubleSince ??= input.movingS
    if (input.movingS - this.rampTroubleSince < (byCadence ? RAMP_FAIL_CADENCE_S : RAMP_FAIL_POWER_S)) return false
    this.rampEndedAt = cur.step.startS + cur.stepElapsedS
    this.jump(input.movingS, this.afterEfforts(spec))
    this.cues.push('That is the ramp done. Spin easy while your FTP is worked out.')
    return true
  }

  // ---- interval rescue ----------------------------------------------------------

  private checkRescue(cur: TargetAt, input: PlanInput): void {
    const step = cur.step
    const key = rescueKey(step)
    const eligible =
      this.opts.rescue !== false &&
      !this.workout.ftpTest &&
      !cur.ergOff &&
      step.kind !== 'ramp' &&
      cur.watts !== null &&
      (cur.fraction ?? 0) >= RESCUE_HARD_FRACTION &&
      cur.stepElapsedS >= RESCUE_GRACE_S &&
      cur.stepRemainingS >= RESCUE_MIN_REMAINING_S &&
      !this.rescued.has(key)
    if (!eligible) {
      this.troubleSince = null
      return
    }
    const target = (cur.watts! * (input.intensityPct ?? 100)) / 100
    const lowCadence = input.cadence !== null && input.cadence < RESCUE_LOW_CADENCE
    const lowPower = input.power !== null && input.power < RESCUE_UNDER * target
    if (!lowCadence && !lowPower) {
      this.troubleSince = null
      return
    }
    this.troubleSince ??= input.movingS
    if (input.movingS - this.troubleSince < RESCUE_AFTER_S) return
    this.troubleSince = null
    this.rescued.add(key)
    this.pendingRescue = {
      key,
      reason: lowCadence ? 'low-cadence' : 'low-power',
      message: lowCadence ? 'Your cadence is fading. Take it 5 % easier, or grab a 30-second breather?' : 'This one is biting. Take it 5 % easier, or grab a 30-second breather?',
    }
  }

  private takeRescue(): RescueOffer | null {
    const r = this.pendingRescue
    this.pendingRescue = null
    return r
  }

  /** The breather uses the set's own recovery power, or 50 % FTP. */
  private restPower(step: TimelineStep): PowerTarget {
    const off = this.tl.steps.find((s) => s.segmentIndex === step.segmentIndex && s.kind === 'off' && s.index > step.index)
    return off?.to ? { unit: off.to.unit, value: off.to.value } : { unit: 'ftp', value: RESCUE_REST_FRACTION }
  }

  // ---- labels -------------------------------------------------------------------

  private countReps(): void {
    this.repCounts = new Map()
    for (const s of this.tl.steps) {
      if (s.kind === 'on' && s.repIndex !== undefined) this.repCounts.set(s.segmentIndex, Math.max(this.repCounts.get(s.segmentIndex) ?? 0, s.repIndex + 1))
    }
  }

  private label(step: TimelineStep): string {
    const base = step.label ?? defaultStepName(step, this.opts.ftpW)
    const n = this.repCounts.get(step.segmentIndex) ?? 0
    return step.kind === 'on' && step.repIndex !== undefined && n > 1 ? `${base} ${step.repIndex + 1}/${n}` : base
  }

  private nextInfo(step: TimelineStep, scale: number): PlanNext {
    const w = (t: PowerTarget | null) => (t ? Math.round(resolvePower(t, this.opts.ftpW) * scale) : null)
    return {
      label: this.label(step),
      durationS: step.durationS,
      watts: step.ergOff ? null : w(step.from),
      endWatts: step.kind === 'ramp' ? w(step.to) : null,
      ergOff: step.ergOff,
    }
  }

  private describe(step: TimelineStep, scale: number): string {
    const n = this.nextInfo(step, scale)
    const target = n.ergOff ? 'ERG off' : n.endWatts !== null ? `${n.watts}→${n.endWatts} W` : `${n.watts} W`
    return `${n.label} · ${formatClock(n.durationS)} · ${target}`
  }

  private range(step: TimelineStep, scale: number): [number, number] | null {
    const p = step.to
    if (step.kind === 'ramp' || !p || p.low === undefined || p.high === undefined) return null
    const w = (v: number) => Math.round(resolvePower({ unit: p.unit, value: v }, this.opts.ftpW) * scale)
    return [w(p.low), w(p.high)]
  }
}

// ---- timeline edits ---------------------------------------------------------------

/** Lengthens step `index` by `seconds`; everything after it moves later. */
export function extendStep(tl: Timeline, index: number, seconds: number): Timeline {
  const s = tl.steps[index]
  if (!s || !(seconds > 0)) return tl
  const oldEnd = s.endS
  return {
    steps: tl.steps.map((x) =>
      x.index < index ? { ...x } : x.index === index ? { ...x, endS: x.endS + seconds, durationS: x.durationS + seconds } : { ...x, startS: x.startS + seconds, endS: x.endS + seconds },
    ),
    durationS: tl.durationS + seconds,
    texts: tl.texts.map((t) => (t.atS >= oldEnd ? { ...t, atS: t.atS + seconds } : { ...t })),
  }
}

/**
 * Splits the step at `atS` and inserts a recovery step there; the rest of the
 * split step follows it. Ramps are split at their interpolated target.
 */
export function insertRest(tl: Timeline, atS: number, durationS: number, power: PowerTarget, label: string, ftpW: number): Timeline {
  const s = stepAt(tl, atS)
  if (!s || !(durationS > 0)) return tl
  const mid = s.kind === 'ramp' && s.from && s.to ? interpolate(s.from, s.to, (atS - s.startS) / s.durationS, ftpW) : null
  const steps: TimelineStep[] = tl.steps.slice(0, s.index).map((x) => ({ ...x }))
  if (atS - s.startS > EPS) steps.push({ ...s, endS: atS, durationS: atS - s.startS, ...(mid ? { to: mid } : {}) })
  steps.push({ index: 0, segmentIndex: s.segmentIndex, kind: 'off', startS: atS, endS: atS + durationS, durationS, from: power, to: power, label, ergOff: false })
  steps.push({ ...s, startS: atS + durationS, endS: s.endS + durationS, durationS: s.endS - atS, ...(mid ? { from: mid } : {}) })
  for (const x of tl.steps.slice(s.index + 1)) steps.push({ ...x, startS: x.startS + durationS, endS: x.endS + durationS })
  steps.forEach((x, i) => (x.index = i))
  const out: Timeline = { steps, durationS: tl.durationS + durationS, texts: [] }
  out.texts = tl.texts.map((t) => {
    const atS2 = t.atS >= atS ? t.atS + durationS : t.atS
    return { ...t, atS: atS2, stepIndex: stepAt(out, atS2)?.index ?? steps.length - 1 }
  })
  return out
}

function interpolate(a: PowerTarget, b: PowerTarget, frac: number, ftpW: number): PowerTarget {
  const f = clamp(frac, 0, 1)
  if (a.unit === b.unit) return { unit: a.unit, value: a.value + (b.value - a.value) * f }
  const aw = resolvePower(a, ftpW)
  return { unit: 'watts', value: aw + (resolvePower(b, ftpW) - aw) * f }
}

function rescueKey(step: TimelineStep): string {
  return `${step.segmentIndex}:${step.repIndex ?? -1}:${step.kind}`
}

/** "Warm-up", "Interval", "Threshold"… for steps without a label. */
export function defaultStepName(step: TimelineStep, ftpW: number): string {
  switch (step.kind) {
    case 'ramp':
      return step.role === 'warmup' ? 'Warm-up' : step.role === 'cooldown' ? 'Cool-down' : 'Ramp'
    case 'on':
      return 'Interval'
    case 'off':
      return 'Recovery'
    case 'freeride':
      return 'Free ride'
    case 'maxeffort':
      return 'Max effort'
    case 'steady': {
      const f = step.to && ftpW > 0 ? resolvePower(step.to, ftpW) / ftpW : 0
      const zone = COGGAN_POWER.zones.find((z) => f >= z.lo && (z.hi === null || f < z.hi))
      return zone?.name ?? 'Steady'
    }
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
