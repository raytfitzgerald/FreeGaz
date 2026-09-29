// The route library: FreeGaz's built-in demo routes plus whatever the rider
// imports (GPX / TCX), and the rides on each route that a Challenge can race.
import type { RideRecord } from '@core/ride/recorder'
import { isLoopRoute } from '@core/ride/route-course'
import { ghostFromDistances, recordedPaceGhost } from '@core/ride/route-ghost'
import type { RideSummary } from '@core/ride/types'
import type { Route, RouteSource } from '@core/routes/model'
import type { GhostSample, RouteMode } from '@core/routes/player'
import { buildRoute, routeFromFile } from '@core/routes/route'
import { demoRoutes } from '@core/routes/synthetic'
import { db } from '../db/db'
import { routeThumb, toStoredRoute, unpackPoints, type RouteThumb, type StoredRoute, type StoredRouteRide } from './route-codec'

/** What the library shows for a route, without building its profile. */
export interface RouteEntry {
  id: string
  name: string
  source: RouteSource
  builtin: boolean
  distanceM: number
  elevationGainM: number
  maxGradePct: number
  /** The file had timestamps: Steady rides its recorded pace. */
  hasTimes: boolean
  /** Ends where it starts, so it can be ridden for laps. */
  loop: boolean
  thumb: RouteThumb
  importedAt: number | null
  fileName?: string
}

/** A previous ride on a route, as a Challenge ghost candidate. */
export interface RouteRideEntry {
  rideId: string
  startedAt: number
  name: string
  mode: RouteMode
  laps: number
  /** Moving time to the finish, s; null when the ride stopped short of it. */
  finishS: number | null
  movingS: number
  distanceM: number
  avgPower: number | null
  simulated: boolean
}

/** Import files bigger than this are refused before parsing (a 3-hour 1 Hz GPX is about 2 MB). */
export const MAX_ROUTE_FILE_BYTES = 50 * 1024 * 1024
export const ROUTE_FILE_EXTENSIONS = ['.gpx', '.tcx'] as const

let builtins: Route[] | null = null
/** Rebuilt routes by id, valid while the stored row keeps its import time (a re-import or a restore invalidates it). */
const cache = new Map<string, { importedAt: number; route: Route }>()

/** The demo routes, built once. */
export function builtinRoutes(): Route[] {
  builtins ??= demoRoutes()
  return builtins
}

export const isBuiltinRoute = (id: string): boolean => builtinRoutes().some((r) => r.id === id)

/** Built-ins first, then imports, newest first. */
export async function listRoutes(): Promise<RouteEntry[]> {
  const stored = await db().routes.orderBy('importedAt').reverse().toArray()
  return [...builtinRoutes().map(builtinEntry), ...stored.map(storedEntry)]
}

/** The full route (profile rebuilt from the stored points), or null if it's gone. */
export async function loadRoute(id: string): Promise<Route | null> {
  const builtin = builtinRoutes().find((r) => r.id === id)
  if (builtin) return builtin
  const row = await db().routes.get(id)
  if (!row) {
    cache.delete(id)
    return null
  }
  const hit = cache.get(id)
  if (hit && hit.importedAt === row.importedAt) return hit.route.name === row.name ? hit.route : { ...hit.route, name: row.name }
  const route = buildRoute(unpackPoints(row.points), { id: row.id, name: row.name, source: row.source })
  cache.set(id, { importedAt: row.importedAt, route })
  return route
}

export interface ImportResult {
  route: Route
  /** The same track was already in the library (routes are identified by their geometry). */
  duplicate: boolean
}

/** Parses and stores a GPX or TCX file. Throws RouteImportError (a rider-facing message) for bad files. */
export async function importRouteFile(fileName: string, content: string | Uint8Array): Promise<ImportResult> {
  const size = typeof content === 'string' ? content.length : content.byteLength
  if (size > MAX_ROUTE_FILE_BYTES) throw new Error(`${fileName} is too big to be a route (over ${MAX_ROUTE_FILE_BYTES / 1024 / 1024} MB).`)
  const route = routeFromFile(content, { fileName })
  const existing = await loadRoute(route.id)
  if (existing) return { route: existing, duplicate: true }
  const row = toStoredRoute(route, { fileName, importedAt: Date.now() })
  await db().routes.put(row)
  cache.set(route.id, { importedAt: row.importedAt, route })
  return { route, duplicate: false }
}

export async function renameRoute(id: string, name: string): Promise<void> {
  const trimmed = name.trim().slice(0, 120)
  if (!trimmed || isBuiltinRoute(id)) return
  await db().routes.update(id, { name: trimmed })
}

/** Removes an imported route and its ride index (the rides themselves stay in History). */
export async function deleteRoute(id: string): Promise<void> {
  if (isBuiltinRoute(id)) throw new Error('Built-in routes cannot be deleted.')
  await db().transaction('rw', db().routes, db().routeRides, async () => {
    await db().routes.delete(id)
    await db().routeRides.where('routeId').equals(id).delete()
  })
  cache.delete(id)
}

// ---- rides on a route --------------------------------------------------------

/** Links a ride that is starting to its route (so even a crash-recovered ride can be raced later). */
export async function noteRouteRide(row: Omit<StoredRouteRide, 'dist' | 'finishS'>): Promise<void> {
  await db().routeRides.put({ ...row, finishS: null, dist: null })
}

/**
 * Stores the ghost of a finished route ride: the cumulative distance of its
 * records, cut where the route was completed.
 */
export async function saveRouteRideGhost(rideId: string, records: readonly RideRecord[], finish: { finishS: number | null; totalM: number }): Promise<void> {
  const row = await db().routeRides.get(rideId)
  if (!row) return
  const dist = ghostDistances(Float32Array.from(records, (r) => r.distance), finish.totalM)
  await db().routeRides.put({ ...row, finishS: finish.finishS, dist })
}

/**
 * Previous rides on a route that still exist in History, fastest finish
 * first, then unfinished ones, newest first. Index rows whose ride was
 * discarded or deleted are skipped.
 */
export async function routeRides(routeId: string): Promise<RouteRideEntry[]> {
  const rows = await db().routeRides.where('routeId').equals(routeId).toArray()
  const rides = await db().rides.bulkGet(rows.map((r) => r.rideId))
  const out: RouteRideEntry[] = []
  rows.forEach((row, i) => {
    const ride = rides[i]
    if (ride) out.push(rideEntry(row, ride))
  })
  return out.sort((a, b) => (a.finishS ?? Infinity) - (b.finishS ?? Infinity) || b.startedAt - a.startedAt)
}

/** A previous ride's ghost: its stored distances, or, for a ride recovered after a crash, its recorded streams. */
export async function loadGhost(rideId: string): Promise<GhostSample[] | null> {
  const row = await db().routeRides.get(rideId)
  if (!row) return null
  let dist = row.dist
  if (!dist) {
    const streams = await db().rideStreams.get(rideId)
    if (!streams) return null
    const route = await loadRoute(row.routeId)
    dist = ghostDistances(streams.distance, route ? route.distanceM * row.laps : Number.POSITIVE_INFINITY)
  }
  const ghost = ghostFromDistances(dist)
  return ghost.length >= 2 && ghost[ghost.length - 1]!.distM > 0 ? ghost : null
}

/** The route's own recorded pace as a ghost (timed routes only). */
export function recordedGhost(route: Route, laps = 1): GhostSample[] | null {
  return recordedPaceGhost(route.profile, laps)
}

/** Per-second distance, cut after the first second that reaches `untilM`. */
function ghostDistances(distance: ArrayLike<number>, untilM: number): Float32Array {
  let end = distance.length
  for (let k = 0; k < distance.length; k++) {
    if (distance[k]! >= untilM - 1e-3) {
      end = k + 1
      break
    }
  }
  return Float32Array.from({ length: end }, (_, k) => distance[k]!)
}

function rideEntry(row: StoredRouteRide, ride: RideSummary): RouteRideEntry {
  return {
    rideId: row.rideId,
    startedAt: ride.startedAt,
    name: ride.name,
    mode: row.mode,
    laps: row.laps,
    finishS: row.finishS,
    movingS: ride.movingS,
    distanceM: ride.distanceM,
    avgPower: ride.avgPower,
    simulated: ride.simulated,
  }
}

function builtinEntry(r: Route): RouteEntry {
  return {
    id: r.id,
    name: r.name,
    source: r.source,
    builtin: true,
    distanceM: r.distanceM,
    elevationGainM: r.elevationGainM,
    maxGradePct: r.maxGradePct,
    hasTimes: r.hasTimes,
    loop: isLoopRoute(r),
    thumb: routeThumb(r.profile),
    importedAt: null,
  }
}

function storedEntry(r: StoredRoute): RouteEntry {
  const e: RouteEntry = {
    id: r.id,
    name: r.name,
    source: r.source,
    builtin: false,
    distanceM: r.distanceM,
    elevationGainM: r.elevationGainM,
    maxGradePct: r.maxGradePct,
    hasTimes: r.hasTimes,
    loop: r.loop,
    thumb: r.thumb,
    importedAt: r.importedAt,
  }
  if (r.fileName) e.fileName = r.fileName
  return e
}
