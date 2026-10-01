// A RidePlan drives what the trainer should do over the course of a ride:
// a structured workout, a route, an FTP test, or nothing (free ride).
import type { Desired } from '../control/trainer-controller'
import type { CadenceTarget } from '../workout/model'
import type { RideCommand } from '../../shared/live'
import type { JourneyTick, MilestoneEvent } from '../journeys/types'
import type { RideKind } from './types'

export interface PlanInput {
  now: number
  /** Moving time in seconds (fractional). */
  movingS: number
  dtS: number
  power: number | null
  cadence: number | null
  hr: number | null
  /** The rider's ERG intensity in % (100 = as written). */
  intensityPct?: number
}

/** The step after the current one, for the "Next" preview. */
export interface PlanNext {
  label: string
  durationS: number
  /** Target watts at the start of the step (intensity applied), or null when ERG is off. */
  watts: number | null
  /** Ramps: target watts at the end of the step. */
  endWatts: number | null
  ergOff: boolean
}

/** Interval rescue: the rider is failing a hard interval; offer help instead of a bail. */
export interface RescueOffer {
  key: string
  reason: 'low-power' | 'low-cadence'
  message: string
}

/** Live progress through an FTP-test effort. */
export interface EffortProgress {
  label: string
  elapsedS: number
  remainingS: number
  /** Average power so far (20-min / 8-min) or best minute so far (ramp). */
  avgW: number | null
  /** The pace that would confirm the current FTP. */
  targetW: number | null
  projectedFtpW: number | null
}

export interface PlanTick {
  /** Desired trainer state now; null = leave control to the rider/UI. */
  desired: Desired | null
  /** Target watts to record (ERG target, or the FTP-test pacing target). */
  targetW: number | null
  segmentIndex: number | null
  segmentLabel: string | null
  segmentKind: string | null
  segmentRemainingS: number | null
  segmentElapsedS: number | null
  nextLabel: string | null
  /** Remaining time/distance in the whole plan (null = open-ended). */
  remainingS: number | null
  finished: boolean
  /** Route values (routes only). */
  grade?: number | null
  altitude?: number | null
  speed?: number | null
  distanceM?: number | null
  /** Where on a real-world route, degrees (routes only). */
  lat?: number | null
  lon?: number | null
  /** An on-screen / spoken cue that fires now. */
  cue?: string | null
  /** Workouts: position on the (possibly edited) timeline, s. */
  positionS?: number | null
  /** Bumped whenever the plan's timeline changes (extend, rescue rest). */
  timelineRev?: number
  next?: PlanNext | null
  cadence?: CadenceTarget | null
  /** Target range (intensity applied) when the step has one, e.g. 95–105 %. */
  targetRangeW?: [number, number] | null
  /** Set on the one tick that offers interval rescue. */
  rescue?: RescueOffer | null
  /** FTP tests only, during the effort. */
  effort?: EffortProgress | null
  /** Journeys: where on the virtual road the rider is. */
  journey?: JourneyTick | null
  /** Journeys: set on the one tick that passes a milestone. */
  milestone?: MilestoneEvent | null
}

export interface RidePlan {
  readonly kind: RideKind
  readonly name: string
  readonly workoutId?: string
  readonly workoutJson?: string
  tick(input: PlanInput): PlanTick
  /** Workout controls (skip/back/extend). Returns true if handled. */
  command?(cmd: RideCommand, movingS: number): boolean
}

export const IDLE_TICK: PlanTick = {
  desired: null,
  targetW: null,
  segmentIndex: null,
  segmentLabel: null,
  segmentKind: null,
  segmentRemainingS: null,
  segmentElapsedS: null,
  nextLabel: null,
  remainingS: null,
  finished: false,
}

/** Free ride: no plan, the rider controls the trainer from the UI. */
export function freeRidePlan(name = 'Free ride'): RidePlan {
  return { kind: 'free', name, tick: () => IDLE_TICK }
}
