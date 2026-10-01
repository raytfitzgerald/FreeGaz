// What a journey reports on every ride tick, for the mini map, the coach and the FIT file.
import type { JourneyKind, MilestoneKind } from './course'

export interface JourneyTick {
  courseId: string
  /** The saved journey this ride continues; null for a one-off drop. */
  journeyId: string | null
  name: string
  kind: JourneyKind
  lengthM: number
  /** Where the ride started on the course, m. */
  startM: number
  /** Ridden this ride, m. */
  rideM: number
  /** Where the dot is now, m (past the end it rides back the way it came). */
  positionM: number
  /** The journey's progress: the furthest point reached, m (at most lengthM). */
  progressM: number
  reversed: boolean
  lat: number
  lon: number
  ele: number
  /** Road grade under the dot, % (0 on flat terrain). */
  gradePct: number
  speedMps: number
  /** The course's end has been reached (this ride or before). */
  finished: boolean
  next: { name: string; kind: MilestoneKind; inM: number } | null
}

/** Fired on the one tick that passes a milestone. */
export interface MilestoneEvent {
  name: string
  kind: MilestoneKind
  atM: number
  journeyName: string
  kmDone: number
  kmLeft: number
}
