// How the coach sees a workout step: the persona engine's segment kind, whether
// it is a hard effort, and its place in an interval set.
//
// Classification goes by intensity, not by the step's type in the file. The
// "over" of an over-under is an interval "off" step at 105 % FTP, and the long
// block between endurance surges is an "on" step at 68 % FTP; calling the
// first a recovery and the second an interval would make every cue wrong.
import type { PlanNext, PlanTick } from '../ride/plan'
import type { WorkoutPlan } from '../ride/workout-plan'
import { resolvePower, type TimelineStep } from '../workout/compile'
import { matchesEffortLabel } from '../workout/labels'
import type { FtpTestProtocol } from '../workout/model'
import { isHardKind } from '../persona/template'
import { isSegmentKind, type SegmentKind } from '../persona/types'

export const SEGMENT_RULES = {
  /** A step at or above this fraction of FTP is a hard effort (the interval rescue uses the same line). */
  hardFraction: 0.88,
  /** A steady step below this fraction of FTP is a recovery. */
  recoveryFraction: 0.6,
  /** Hard steps shorter than this, in a set of at least `microMinReps`, are micro-intervals (30/30s, 40/20s). */
  microMaxS: 60,
  microMinReps: 3,
} as const

export interface CoachSegment {
  /** Step index on the plan's timeline (PlanTick.segmentIndex). */
  index: number
  kind: SegmentKind
  hard: boolean
  durationS: number
  label: string | null
  /** 1-based repetition within an interval set, and the size of the set. */
  rep: number | null
  reps: number | null
  /** An FTP-test effort: minute marks replace the usual interval cues. */
  ftpEffort: boolean
  /** Target as a fraction of FTP (a ramp's highest point); null when ERG is off. */
  fraction: number | null
}

/** Looks up the coach's view of a step by its timeline index (null past the end). */
export type SegmentResolver = (index: number) => CoachSegment | null

/** A 30-s rep in a set of ten: only the first and last reps get cues and verdicts. */
export function isMicro(seg: Pick<CoachSegment, 'hard' | 'durationS' | 'reps'>): boolean {
  return seg.hard && seg.durationS < SEGMENT_RULES.microMaxS && (seg.reps ?? 0) >= SEGMENT_RULES.microMinReps
}

/** Micro-interval reps other than the first and the last stay quiet. */
export function isAnnounced(seg: Pick<CoachSegment, 'hard' | 'durationS' | 'rep' | 'reps'>): boolean {
  return !isMicro(seg) || seg.rep === 1 || seg.rep === seg.reps
}

type StepShape = Pick<TimelineStep, 'kind' | 'role' | 'from' | 'to'>

function stepFraction(step: StepShape, ftpW: number): number | null {
  if (!(ftpW > 0)) return null
  const values = [step.from, step.to].filter((p) => p !== null).map((p) => resolvePower(p, ftpW) / ftpW)
  return values.length > 0 ? Math.max(...values) : null
}

/** The engine's segment kind and hard flag for a timeline step. */
export function classifyStep(
  step: StepShape,
  ftpW: number,
  ftpEffort: FtpTestProtocol | null = null,
): { kind: SegmentKind; hard: boolean; fraction: number | null } {
  const fraction = stepFraction(step, ftpW)
  if (ftpEffort) return { kind: ftpEffort === 'ramp' ? 'ramp' : 'steady', hard: true, fraction }
  const hard = fraction !== null && fraction >= SEGMENT_RULES.hardFraction
  switch (step.kind) {
    case 'maxeffort':
      return { kind: 'maxeffort', hard: true, fraction }
    case 'freeride':
      return { kind: 'freeride', hard: false, fraction }
    case 'ramp':
      if (step.role === 'warmup') return { kind: 'warmup', hard: false, fraction }
      if (step.role === 'cooldown') return { kind: 'cooldown', hard: false, fraction }
      return hard ? { kind: 'ramp', hard: true, fraction } : { kind: 'steady', hard: false, fraction }
    default:
      if (hard) return { kind: 'on', hard: true, fraction }
      if (fraction !== null && fraction < SEGMENT_RULES.recoveryFraction) return { kind: 'off', hard: false, fraction }
      return { kind: step.kind === 'off' ? 'off' : 'steady', hard: false, fraction }
  }
}

/**
 * The coach's view of every step of a workout, rebuilt whenever the timeline
 * changes (extend, interval rescue). Rep numbers follow the player's labels:
 * both halves of an interval pair share the rep number.
 */
export function workoutSegments(plan: WorkoutPlan): SegmentResolver {
  let rev = -1
  let segments: CoachSegment[] = []
  const rebuild = () => {
    const steps = plan.timeline.steps
    const spec = plan.workout.ftpTest
    const reps = new Map<number, number>()
    for (const s of steps) {
      if (s.kind === 'on' && s.repIndex !== undefined) reps.set(s.segmentIndex, Math.max(reps.get(s.segmentIndex) ?? 0, s.repIndex + 1))
    }
    segments = steps.map((s) => {
      const effort = spec && matchesEffortLabel(s.label, spec.effortLabel) ? spec.protocol : null
      const c = classifyStep(s, plan.ftpW, effort)
      const n = reps.get(s.segmentIndex) ?? 0
      const inSet = s.repIndex !== undefined && n > 1
      return {
        index: s.index,
        kind: c.kind,
        hard: c.hard,
        durationS: s.durationS,
        label: s.label ?? null,
        rep: inSet ? s.repIndex! + 1 : null,
        reps: inSet ? n : null,
        ftpEffort: effort !== null,
        fraction: c.fraction,
      }
    })
    rev = plan.revision
  }
  return (index) => {
    if (rev !== plan.revision) rebuild()
    return segments[index] ?? null
  }
}

/** Best-effort view of the current step from the tick alone (plans without a timeline). */
export function segmentFromTick(tick: PlanTick, ftpW: number): CoachSegment | null {
  if (tick.segmentIndex === null || tick.finished) return null
  const raw = tick.segmentKind
  const fraction = tick.targetW !== null && ftpW > 0 ? tick.targetW / ftpW : null
  const kind: SegmentKind = isSegmentKind(raw) ? raw : 'steady'
  const hard = tick.effort ? true : fraction !== null ? fraction >= SEGMENT_RULES.hardFraction : isHardKind(kind)
  const durationS = (tick.segmentElapsedS ?? 0) + (tick.segmentRemainingS ?? 0)
  return {
    index: tick.segmentIndex,
    kind: hard && kind !== 'maxeffort' && kind !== 'ramp' ? 'on' : kind,
    hard,
    durationS,
    label: tick.segmentLabel,
    rep: null,
    reps: null,
    ftpEffort: !!tick.effort,
    fraction,
  }
}

/** Best-effort view of the next step from the tick's "Next" preview. */
export function segmentFromNext(next: PlanNext, index: number, ftpW: number): CoachSegment {
  const top = Math.max(next.watts ?? 0, next.endWatts ?? 0)
  const fraction = next.watts !== null && ftpW > 0 ? top / ftpW : null
  const hard = fraction !== null && fraction >= SEGMENT_RULES.hardFraction
  return {
    index,
    kind: hard ? 'on' : next.ergOff ? 'freeride' : 'steady',
    hard,
    durationS: next.durationS,
    label: next.label,
    rep: null,
    reps: null,
    ftpEffort: false,
    fraction,
  }
}
