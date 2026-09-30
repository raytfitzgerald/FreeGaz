// "Ride for time": a ride that is just a length of time, built as a one-block
// workout so it gets the workout player for free (progress, time left, the
// coach's halfway and last-minute calls, a finish). Either the trainer holds
// a steady wattage (ERG), or the rider sets the effort themselves.
import type { Segment, Workout } from './model'

export const TIME_RIDE_ID = 'time-ride'
export const TIME_RIDE_MINUTES = [20, 30, 45, 60, 90] as const
export const TIME_RIDE_MIN = 5
export const TIME_RIDE_MAX = 300
/** Warm-up and cool-down length when asked for, minutes. */
export const EASE_MIN = 5

export type TimeRideEffort = { kind: 'erg'; watts: number } | { kind: 'free' }

export interface TimeRideOptions {
  minutes: number
  effort: TimeRideEffort
  /** Add a 5-minute ramp in and out (ERG only), inside the total time. */
  ease: boolean
}

/** A workout lasting exactly `minutes`, ready for WorkoutPlan. */
export function timeRideWorkout(o: TimeRideOptions, now = Date.now()): Workout {
  const minutes = Math.round(Math.min(TIME_RIDE_MAX, Math.max(TIME_RIDE_MIN, o.minutes)))
  const totalS = minutes * 60
  const segments: Segment[] = []
  if (o.effort.kind === 'free') {
    segments.push({ kind: 'freeride', durationS: totalS, flatRoad: true, label: 'Your pace' })
  } else {
    const watts = Math.round(Math.min(2000, Math.max(30, o.effort.watts)))
    // easing only fits rides long enough to keep a main block of at least half the time
    const ease = o.ease && totalS >= 4 * EASE_MIN * 60 ? EASE_MIN * 60 : 0
    const start = { unit: 'watts' as const, value: Math.round(watts * 0.6) }
    const target = { unit: 'watts' as const, value: watts }
    if (ease) segments.push({ kind: 'ramp', role: 'warmup', durationS: ease, from: start, to: target, label: 'Warm-up' })
    segments.push({ kind: 'steady', durationS: totalS - 2 * ease, power: target, label: `${watts} W` })
    if (ease) segments.push({ kind: 'ramp', role: 'cooldown', durationS: ease, from: target, to: start, label: 'Cool-down' })
  }
  return {
    id: TIME_RIDE_ID,
    name: `${minutes}-minute ride`,
    description: o.effort.kind === 'free' ? 'Ride for time at your own pace.' : `Ride for time, the trainer holding ${Math.round(o.effort.watts)} W.`,
    tags: ['time'],
    sportType: 'bike',
    segments,
    source: 'user',
    createdAt: now,
    updatedAt: now,
  }
}
