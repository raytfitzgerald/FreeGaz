// Workout → timeline. The timeline is the unit of truth for the player,
// stats, FTP analysis and the exporters' round-trip tests: a flat list of
// contiguous steps with absolute times, plus text cues on absolute times.
//
// Semantics worth knowing:
// - Intervals expand into alternating on/off steps with repIndex 0..repeat-1.
//   Part cadence/label fall back to the segment's.
// - Text-event offsets are relative to their segment. For intervals the
//   segment is the whole expanded block, so an offset past the first rep
//   lands in a later rep (it is not repeated per rep). Events outside
//   [0, segment duration) are dropped (validateWorkout reports them); events
//   without durationS show for DEFAULT_TEXT_DURATION_S.
// - Labels and cue messages are whitespace-normalized; empty ones vanish.
// - Power ranges survive only on steady/interval targets with low < high;
//   ramp endpoints never carry one. Freeride steps resolve flatRoad
//   (default true). Optional fields are omitted rather than set to undefined,
//   so compiled timelines compare cleanly.
// - Steps with a non-positive duration are skipped.

import { normalizeText } from './labels'
import type { CadenceTarget, IntervalPart, IntervalsSegment, PowerTarget, Segment, TextEvent, Workout } from './model'

export { validateWorkout, workoutIssues, type IssueSeverity, type WorkoutIssue } from './validate'

export type StepKind = 'steady' | 'ramp' | 'on' | 'off' | 'freeride' | 'maxeffort'

export interface TimelineStep {
  index: number
  segmentIndex: number
  /** Rep number (0-based) for the on/off steps of an intervals segment. */
  repIndex?: number
  kind: StepKind
  startS: number
  endS: number
  durationS: number
  /** Null for freeride/maxeffort; the same target as `to` for steady/on/off. */
  from: PowerTarget | null
  to: PowerTarget | null
  cadence?: CadenceTarget
  label?: string
  showAverage?: boolean
  /** True for freeride/maxeffort: the rider, not ERG, sets the power. */
  ergOff: boolean
  /** Freeride only: keep the trainer on a flat road (resolved, default true). */
  flatRoad?: boolean
  /** Ramp steps only. */
  role?: 'warmup' | 'cooldown' | 'ramp'
}

export interface TimelineText {
  atS: number
  message: string
  durationS: number
  stepIndex: number
}

export interface Timeline {
  steps: TimelineStep[]
  durationS: number
  texts: TimelineText[]
}

/** How long a cue shows when its TextEvent has no durationS (Zwift's default). */
export const DEFAULT_TEXT_DURATION_S = 10

/** Memory guard while compiling hostile imports; validateWorkout flags long workouts long before this. */
export const MAX_COMPILED_REPEAT = 10_000

type StepDraft = Omit<TimelineStep, 'index' | 'segmentIndex' | 'startS' | 'endS'>

export function compileWorkout(w: Workout): Timeline {
  const steps: TimelineStep[] = []
  const texts: TimelineText[] = []
  let t = 0
  w.segments.forEach((seg, segmentIndex) => {
    const segStart = t
    const first = steps.length
    for (const d of segmentSteps(seg)) {
      if (!isPositive(d.durationS)) continue
      steps.push(
        compact({
          index: steps.length,
          segmentIndex,
          repIndex: d.repIndex,
          kind: d.kind,
          startS: t,
          endS: t + d.durationS,
          durationS: d.durationS,
          from: d.from,
          to: d.to,
          cadence: d.cadence,
          label: d.label,
          showAverage: d.showAverage,
          ergOff: d.ergOff,
          flatRoad: d.flatRoad,
          role: d.role,
        }),
      )
      t += d.durationS
    }
    placeTexts(seg.text, segStart, t, steps, first, texts)
  })
  return { steps, durationS: t, texts }
}

/** Watts for a target at the given FTP. Not rounded: the trainer controller rounds. */
export function resolvePower(t: PowerTarget, ftpW: number): number {
  return t.unit === 'ftp' ? t.value * ftpW : t.value
}

/** The step covering `tS` (start inclusive, end exclusive), or null outside the workout. */
export function stepAt(tl: Timeline, tS: number): TimelineStep | null {
  const i = findStepIndex(tl.steps, tS, 0, tl.steps.length - 1)
  return i === -1 ? null : (tl.steps[i] ?? null)
}

export interface TargetAt {
  step: TimelineStep
  stepElapsedS: number
  stepRemainingS: number
  /** ERG target in watts; null when ERG is off (freeride/maxeffort). */
  watts: number | null
  /** `watts` as a fraction of FTP. */
  fraction: number | null
  cadence?: CadenceTarget
  ergOff: boolean
  next: TimelineStep | null
}

/** Everything the player needs at time `tS`; ramps interpolate linearly in watts. */
export function targetAt(tl: Timeline, tS: number, ftpW: number): TargetAt | null {
  const step = stepAt(tl, tS)
  if (!step) return null
  const elapsed = tS - step.startS
  let watts: number | null = null
  if (step.from && step.to) {
    const a = resolvePower(step.from, ftpW)
    if (step.kind === 'ramp') {
      const b = resolvePower(step.to, ftpW)
      watts = a + (b - a) * (step.durationS > 0 ? elapsed / step.durationS : 0)
    } else {
      watts = a
    }
  }
  return compact({
    step,
    stepElapsedS: elapsed,
    stepRemainingS: step.endS - tS,
    watts,
    fraction: watts !== null && ftpW > 0 ? watts / ftpW : null,
    cadence: step.cadence,
    ergOff: step.ergOff,
    next: tl.steps[step.index + 1] ?? null,
  })
}

/**
 * First difference between two timelines as "path: a ≠ b", or null when they
 * match. Numbers compare with relative tolerance `eps` (file formats store
 * about six decimals); missing and undefined fields are equal.
 */
export function diffTimelines(a: Timeline, b: Timeline, eps = 1e-6): string | null {
  return deepDiff(a, b, 'timeline', eps)
}

// ---------------------------------------------------------------------------

function segmentSteps(seg: Segment): StepDraft[] {
  const label = normalizeText(seg.label)
  const cadence = copyCadence(seg.cadence)
  const showAverage = seg.showAverage === true ? true : undefined
  switch (seg.kind) {
    case 'steady': {
      const p = copyTarget(seg.power, true)
      return [{ kind: 'steady', durationS: seg.durationS, from: p, to: p, cadence, label, showAverage, ergOff: false }]
    }
    case 'ramp':
      return [
        {
          kind: 'ramp',
          durationS: seg.durationS,
          from: copyTarget(seg.from, false),
          to: copyTarget(seg.to, false),
          cadence,
          label,
          showAverage,
          ergOff: false,
          role: seg.role,
        },
      ]
    case 'intervals':
      return intervalSteps(seg, label, cadence, showAverage)
    case 'freeride':
      return [
        {
          kind: 'freeride',
          durationS: seg.durationS,
          from: null,
          to: null,
          cadence,
          label,
          showAverage,
          ergOff: true,
          flatRoad: seg.flatRoad ?? true,
        },
      ]
    case 'maxeffort':
      return [{ kind: 'maxeffort', durationS: seg.durationS, from: null, to: null, cadence, label, showAverage, ergOff: true }]
  }
}

function intervalSteps(
  seg: IntervalsSegment,
  label: string | undefined,
  cadence: CadenceTarget | undefined,
  showAverage: true | undefined,
): StepDraft[] {
  const n = Number.isFinite(seg.repeat) ? Math.min(MAX_COMPILED_REPEAT, Math.max(0, Math.floor(seg.repeat))) : 0
  const part = (p: IntervalPart, kind: 'on' | 'off', repIndex: number): StepDraft => {
    const target = copyTarget(p.power, true)
    return {
      repIndex,
      kind,
      durationS: p.durationS,
      from: target,
      to: target,
      cadence: copyCadence(p.cadence) ?? cadence,
      label: normalizeText(p.label) ?? label,
      showAverage,
      ergOff: false,
    }
  }
  const out: StepDraft[] = []
  for (let r = 0; r < n; r++) out.push(part(seg.on, 'on', r), part(seg.off, 'off', r))
  return out
}

function placeTexts(
  events: TextEvent[] | undefined,
  segStart: number,
  segEnd: number,
  steps: TimelineStep[],
  firstStep: number,
  out: TimelineText[],
): void {
  if (!events || events.length === 0 || firstStep >= steps.length) return
  const segDuration = segEnd - segStart
  const placed = events
    .map((e) => ({ offsetS: e.offsetS, message: normalizeText(e.message), durationS: e.durationS }))
    .filter((e) => Number.isFinite(e.offsetS) && e.offsetS >= 0 && e.offsetS < segDuration && e.message !== undefined)
    .sort((x, y) => x.offsetS - y.offsetS)
  for (const e of placed) {
    const atS = segStart + e.offsetS
    const i = findStepIndex(steps, atS, firstStep, steps.length - 1)
    out.push({
      atS,
      message: e.message ?? '',
      durationS: isPositive(e.durationS) ? e.durationS : DEFAULT_TEXT_DURATION_S,
      stepIndex: i === -1 ? steps.length - 1 : i,
    })
  }
}

function findStepIndex(steps: TimelineStep[], tS: number, lo: number, hi: number): number {
  if (!Number.isFinite(tS)) return -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const s = steps[mid]
    if (!s) return -1
    if (tS < s.startS) hi = mid - 1
    else if (tS >= s.endS) lo = mid + 1
    else return mid
  }
  return -1
}

function copyTarget(p: PowerTarget, keepRange: boolean): PowerTarget {
  const out: PowerTarget = { unit: p.unit, value: p.value }
  if (keepRange && Number.isFinite(p.low) && Number.isFinite(p.high) && (p.low ?? 0) < (p.high ?? 0)) {
    out.low = p.low
    out.high = p.high
  }
  return out
}

function copyCadence(c: CadenceTarget | undefined): CadenceTarget | undefined {
  if (!c) return undefined
  const out: CadenceTarget = {}
  if (isPositive(c.rpm)) out.rpm = c.rpm
  if (isPositive(c.low)) out.low = c.low
  if (isPositive(c.high)) out.high = c.high
  return out.rpm === undefined && out.low === undefined && out.high === undefined ? undefined : out
}

function isPositive(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

/** Drop keys whose value is undefined (in place). */
function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k]
  return o
}

function deepDiff(a: unknown, b: unknown, path: string, eps: number): string | null {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b || Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b))) return null
    return `${path}: ${a} ≠ ${b}`
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}.length: ${a.length} ≠ ${b.length}`
    for (let i = 0; i < a.length; i++) {
      const d = deepDiff(a[i], b[i], `${path}[${i}]`, eps)
      if (d) return d
    }
    return null
  }
  if (isRecord(a) && isRecord(b) && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) {
      const d = deepDiff(a[k], b[k], `${path}.${k}`, eps)
      if (d) return d
    }
    return null
  }
  return Object.is(a, b) ? null : `${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}
