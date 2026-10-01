// The journeys FreeGaz ships (built by scripts/journeys/build.mjs from
// OpenStreetMap roads and NASA SRTM elevation), plus the rider's own imported
// routes. The index is small and always loaded; each journey's road is a
// separate file, loaded the first time it's ridden.
import { courseFromData, courseFromRoute, type JourneyCourse, type JourneyData, type JourneyMeta } from '@core/journeys/course'
import { listRoutes, loadRoute } from '../routes/routes-repo'
import INDEX from './data/index.json'

export const CATALOGUE: readonly JourneyMeta[] = INDEX as JourneyMeta[]
export const DROPS = CATALOGUE.filter((j) => j.kind === 'drop')
export const GRAND = CATALOGUE.filter((j) => j.kind === 'grand')

const files = import.meta.glob<JourneyData>(['./data/*.json', '!./data/index.json'], { import: 'default' })
const cache = new Map<string, Promise<JourneyCourse>>()

/** Courses: a shipped journey by id, or "route:<id>" for an imported route. */
export function loadCourse(id: string): Promise<JourneyCourse> {
  let hit = cache.get(id)
  if (!hit) {
    hit = (async () => {
      if (id.startsWith('route:')) {
        const route = await loadRoute(id.slice('route:'.length))
        if (!route) throw new Error('That route is no longer in your library.')
        return courseFromRoute(route)
      }
      const load = files[`./data/${id}.json`]
      if (!load) throw new Error(`Unknown journey ${id}`)
      return courseFromData(await load())
    })()
    hit.catch(() => cache.delete(id))
    cache.set(id, hit)
  }
  return hit
}

/** The rider's imported routes that are real roads (demo shapes have nowhere to be). */
export async function routeJourneys(): Promise<{ id: string; name: string; lengthM: number }[]> {
  const routes = await listRoutes()
  return routes.filter((r) => !r.builtin && r.source !== 'synthetic').map((r) => ({ id: `route:${r.id}`, name: r.name, lengthM: r.distanceM }))
}

/** A drop to ride, at random, avoiding the one just ridden when there's a choice. */
export function randomDrop(rng: () => number = Math.random, avoid: string | null = null): JourneyMeta {
  const pool = DROPS.length > 1 && avoid ? DROPS.filter((d) => d.id !== avoid) : DROPS
  return pool[Math.floor(rng() * pool.length)] ?? DROPS[0]!
}
