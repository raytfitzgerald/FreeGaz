// A saved journey: which course, how far along it the rider is, and the rides
// that got them there. Grand journeys and imported routes are saved; a drop
// is a one-off and isn't.
import type { JourneyCourse, JourneyKind } from './course'

export interface JourneyRide {
  rideId: string
  /** Epoch ms the ride ended. */
  at: number
  fromM: number
  toM: number
}

export interface Journey {
  id: string
  courseId: string
  name: string
  kind: JourneyKind
  lengthM: number
  /** The furthest point reached, m. */
  progressM: number
  createdAt: number
  updatedAt: number
  finishedAt: number | null
  rides: JourneyRide[]
}

export function newJourney(course: JourneyCourse, id: string, now: number): Journey {
  return { id, courseId: course.id, name: course.name, kind: course.kind, lengthM: course.lengthM, progressM: 0, createdAt: now, updatedAt: now, finishedAt: null, rides: [] }
}

/** The journey after a ride that went from `fromM` to `toM`. A ride that doesn't move it leaves it alone. */
export function recordRide(j: Journey, ride: JourneyRide): Journey {
  if (j.rides.some((r) => r.rideId === ride.rideId)) return j
  const toM = Math.min(j.lengthM, Math.max(ride.fromM, ride.toM))
  if (toM - ride.fromM < 1) return j
  const progressM = Math.max(j.progressM, toM)
  const finishedAt = j.finishedAt ?? (progressM >= j.lengthM - 1 ? ride.at : null)
  return { ...j, progressM, finishedAt, updatedAt: ride.at, rides: [...j.rides, { ...ride, toM }] }
}

/** The day number the next ride would be (day 1 is the first ride). */
export function nextDay(j: Journey): number {
  return j.rides.length + 1
}

export interface JourneyTotals {
  rides: number
  distanceM: number
  /** Calendar days from the first ride to the last (1 for a single ride). */
  days: number
}

export function journeyTotals(j: Journey): JourneyTotals {
  const first = j.rides[0]?.at
  const last = j.rides.at(-1)?.at
  const days = first !== undefined && last !== undefined ? Math.floor((last - first) / 86_400_000) + 1 : 0
  return { rides: j.rides.length, distanceM: j.rides.reduce((a, r) => a + (r.toM - r.fromM), 0), days }
}

/** The Strava title suffix and description lines for a ride on a journey. */
export function journeyRideText(o: { course: Pick<JourneyCourse, 'name' | 'lengthM' | 'kind' | 'start'>; day: number | null; fromM: number; toM: number; passed: readonly string[] }): { title: string; description: string } {
  const km = (m: number) => (m / 1000).toFixed(m < 100_000 ? 1 : 0)
  const rodeKm = km(Math.max(0, o.toM - o.fromM))
  if (o.course.kind === 'drop') {
    return {
      title: o.course.name,
      description: [`Dropped at ${o.course.start} and rode ${rodeKm} km.`, ...(o.passed.length > 0 ? [`Passed ${o.passed.join(', ')}.`] : [])].join(' '),
    }
  }
  const day = o.day !== null ? `day ${o.day}` : null
  const progress = `${km(Math.min(o.toM, o.course.lengthM))} of ${km(o.course.lengthM)} km`
  return {
    title: [o.course.name, day].filter(Boolean).join(', '),
    description: [`${o.course.name}${day ? `, ${day}` : ''}: ${rodeKm} km today, ${progress}.`, ...(o.passed.length > 0 ? [`Passed ${o.passed.join(', ')}.`] : [])].join(' '),
  }
}
