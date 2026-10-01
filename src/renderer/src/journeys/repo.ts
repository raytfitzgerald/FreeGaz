// Saved journeys (Dexie): grand journeys and imported routes in progress.
import { newJourney, type Journey } from '@core/journeys/progress'
import type { JourneyCourse } from '@core/journeys/course'
import { db } from '../db/db'

export async function listJourneys(): Promise<Journey[]> {
  return (await db().journeys.toArray()).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getJourney(id: string): Promise<Journey | null> {
  return (await db().journeys.get(id)) ?? null
}

export async function saveJourney(j: Journey): Promise<void> {
  await db().journeys.put(j)
}

export async function deleteJourney(id: string): Promise<void> {
  await db().journeys.delete(id)
}

export async function startJourney(course: JourneyCourse): Promise<Journey> {
  const j = newJourney(course, `j-${course.id}-${Date.now().toString(36)}`, Date.now())
  await saveJourney(j)
  return j
}
