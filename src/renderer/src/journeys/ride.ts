// A ride's journey, from start to save: which course and where on it (from
// the ride picker's choice or the Settings default), the layer the session
// applies, and afterwards the journey's new progress and the Strava text.
import type { JourneyCourse } from '@core/journeys/course'
import { JourneyLayer } from '@core/journeys/layer'
import { journeyRideText, nextDay, recordRide, type Journey } from '@core/journeys/progress'
import type { RidePlan } from '@core/ride/plan'
import type { AthleteSnapshot } from '@core/ride/types'
import type { JourneyPrefs } from '@shared/settings'
import { patchSettings, settingsStore } from '../stores/settings'
import { loadCourse, randomDrop } from './catalogue'
import { journeyChoiceStore, type JourneyChoice } from './choice'
import { getJourney, saveJourney, startJourney } from './repo'

export interface RideJourney {
  layer: JourneyLayer
  course: JourneyCourse
  /** The saved journey this ride moves (null for a drop). */
  journey: Journey | null
}

/** What the saved-ride card shows about the journey. */
export interface SavedJourney {
  name: string
  kind: JourneyCourse['kind']
  courseId: string
  journeyId: string | null
  rodeM: number
  progressM: number
  lengthM: number
  day: number | null
  passed: string[]
  /** This ride reached the end of a saved journey. */
  justFinished: boolean
  /** Not saved: a simulated ride never moves a journey. */
  simulated: boolean
}

/** Shorter than this, a ride didn't really go anywhere: no journey text, no progress. */
const MIN_RIDE_M = 100

let lastDrop: string | null = null

function defaultChoice(prefs: JourneyPrefs): JourneyChoice {
  if (prefs.mode === 'continue' && prefs.activeId) return { kind: 'continue', journeyId: prefs.activeId }
  if (prefs.mode === 'none') return { kind: 'none' }
  return { kind: 'drop', courseId: null }
}

async function resolve(choice: JourneyChoice): Promise<{ course: JourneyCourse; journey: Journey | null; startM: number } | null> {
  switch (choice.kind) {
    case 'none':
      return null
    case 'drop': {
      const id = choice.courseId ?? randomDrop(Math.random, lastDrop).id
      lastDrop = id
      return { course: await loadCourse(id), journey: null, startM: 0 }
    }
    case 'continue': {
      const journey = await getJourney(choice.journeyId)
      // a journey that's gone or done: somewhere new instead
      if (!journey || journey.finishedAt !== null) return resolve({ kind: 'drop', courseId: null })
      return { course: await loadCourse(journey.courseId), journey, startM: journey.progressM }
    }
    case 'start': {
      const course = await loadCourse(choice.courseId)
      const journey = await startJourney(course)
      await patchSettings({ journeys: { ...settingsStore.getState().journeys, activeId: journey.id } })
      return { course, journey, startM: 0 }
    }
  }
}

/** The journey for a ride about to start, or null (journeys off, a route ride, or "no journey"). */
export async function prepareRideJourney(o: { plan?: RidePlan; athlete: AthleteSnapshot }): Promise<RideJourney | null> {
  const prefs = settingsStore.getState().journeys
  const choice = journeyChoiceStore.getState().choice
  journeyChoiceStore.setState({ choice: null })
  // a route ride already has its road
  if (!prefs.enabled || o.plan?.kind === 'route') return null
  try {
    const r = await resolve(choice ?? defaultChoice(prefs))
    if (!r) return null
    const t = settingsStore.getState().trainer
    const layer = new JourneyLayer({
      course: r.course,
      journeyId: r.journey?.id ?? null,
      startM: r.startM,
      terrain: prefs.terrain,
      rider: { riderKg: o.athlete.weightKg, bikeKg: t.bikeKg, cda: t.cda, crr: t.crr },
      gps: prefs.gps,
    })
    return { layer, course: r.course, journey: r.journey }
  } catch {
    // a journey is a nice extra: never let it stop a ride from starting
    return null
  }
}

/** After the ride: the Strava title and description, and the journey moved on (real rides only). */
export async function finishRideJourney(rj: RideJourney, ride: { rideId: string; endedAt: number; simulated: boolean }): Promise<{ title: string; description: string; saved: SavedJourney } | null> {
  const fromM = rj.layer.opts.startM
  const rodeM = rj.layer.riddenM
  if (rodeM < MIN_RIDE_M) return null
  const toM = Math.min(rj.course.lengthM, fromM + rodeM)
  const day = rj.journey ? nextDay(rj.journey) : null
  const passed = rj.layer.passedThisRide
  const text = journeyRideText({ course: rj.course, day, fromM, toM, passed })
  let journey = rj.journey
  let justFinished = false
  if (journey && !ride.simulated) {
    const before = journey.finishedAt
    journey = recordRide(journey, { rideId: ride.rideId, at: ride.endedAt, fromM, toM })
    justFinished = before === null && journey.finishedAt !== null
    await saveJourney(journey)
  }
  return {
    ...text,
    saved: {
      name: rj.course.name,
      kind: rj.course.kind,
      courseId: rj.course.id,
      journeyId: journey?.id ?? null,
      rodeM,
      progressM: journey && !ride.simulated ? journey.progressM : toM,
      lengthM: rj.course.lengthM,
      day,
      passed,
      justFinished,
      simulated: ride.simulated,
    },
  }
}
