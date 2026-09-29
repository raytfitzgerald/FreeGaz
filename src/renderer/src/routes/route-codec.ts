// How routes are kept in IndexedDB. The raw points are packed into typed
// arrays (about 20 bytes a point instead of an object per point); the
// smoothed profile is not stored but rebuilt on load by the same pipeline, so
// a later smoothing fix applies to routes imported before it. Each row also
// carries its summary and a small elevation thumbnail, so the library lists
// without rebuilding anything.
import { isLoopRoute } from '@core/ride/route-course'
import { gradeIntegral, sampleAt } from '@core/routes/lookup'
import type { ProfilePoint, Route, RoutePoint, RouteSource } from '@core/routes/model'
import type { RouteMode } from '@core/routes/player'

export interface PackedPoints {
  n: number
  /** Degrees x 1e7 (about 1 cm). */
  lat: Int32Array
  lon: Int32Array
  /** m; NaN where the file had no elevation. */
  ele: Float32Array
  /** Cumulative distance as parsed, m. */
  dist: Float64Array
  /** Epoch ms, NaN for an untimed point; absent when no point had a time. */
  t?: Float64Array
}

/** Elevation and mean grade in even slices along the route, for the library card. */
export interface RouteThumb {
  ele: number[]
  grade: number[]
}

/** A route in the library (the `routes` table). */
export interface StoredRoute {
  id: string
  name: string
  source: RouteSource
  fileName?: string
  importedAt: number
  distanceM: number
  elevationGainM: number
  elevationLossM: number
  maxGradePct: number
  minGradePct: number
  hasTimes: boolean
  loop: boolean
  thumb: RouteThumb
  points: PackedPoints
}

/**
 * A ride on a route (the `routeRides` table), so a later ride can race it.
 * The row is written when the ride starts, which links a crash-recovered
 * ride to its route too; the ghost itself is added when the ride ends.
 */
export interface StoredRouteRide {
  rideId: string
  routeId: string
  startedAt: number
  mode: RouteMode
  laps: number
  /** Moving time at which the route was completed, s; null when the ride stopped short. */
  finishS: number | null
  /** Distance at the end of each moving second, m, cut at the finish. Null until the ride ends (then the ride's streams stand in). */
  dist: Float32Array | null
}

const DEG = 1e7

export function packPoints(points: readonly RoutePoint[]): PackedPoints {
  const n = points.length
  const out: PackedPoints = {
    n,
    lat: new Int32Array(n),
    lon: new Int32Array(n),
    ele: new Float32Array(n),
    dist: new Float64Array(n),
  }
  const timed = points.some((p) => p.t !== undefined)
  if (timed) out.t = new Float64Array(n)
  points.forEach((p, i) => {
    out.lat[i] = Math.round(p.lat * DEG)
    out.lon[i] = Math.round(p.lon * DEG)
    out.ele[i] = p.ele ?? Number.NaN
    out.dist[i] = p.distM
    if (out.t) out.t[i] = p.t ?? Number.NaN
  })
  return out
}

export function unpackPoints(p: PackedPoints): RoutePoint[] {
  const out: RoutePoint[] = []
  for (let i = 0; i < p.n; i++) {
    const ele = p.ele[i]!
    const point: RoutePoint = { lat: p.lat[i]! / DEG, lon: p.lon[i]! / DEG, ele: Number.isNaN(ele) ? null : ele, distM: p.dist[i]! }
    const t = p.t?.[i]
    if (t !== undefined && !Number.isNaN(t)) point.t = t
    out.push(point)
  }
  return out
}

/** Elevation at the middle of each of `slices` even pieces, with each piece's mean grade. */
export function routeThumb(profile: readonly ProfilePoint[], slices = 64): RouteThumb {
  const start = profile[0]?.distM ?? 0
  const end = profile[profile.length - 1]?.distM ?? 0
  const step = (end - start) / slices
  const ele: number[] = []
  const grade: number[] = []
  for (let k = 0; k < slices && step > 0; k++) {
    const a = start + k * step
    ele.push(round1(sampleAt(profile, a + step / 2).ele))
    grade.push(round1(gradeIntegral(profile, a, a + step) / step))
  }
  return { ele, grade }
}

export function toStoredRoute(route: Route, meta: { fileName?: string; importedAt: number }): StoredRoute {
  const row: StoredRoute = {
    id: route.id,
    name: route.name,
    source: route.source,
    importedAt: meta.importedAt,
    distanceM: route.distanceM,
    elevationGainM: route.elevationGainM,
    elevationLossM: route.elevationLossM,
    maxGradePct: route.maxGradePct,
    minGradePct: route.minGradePct,
    hasTimes: route.hasTimes,
    loop: isLoopRoute(route),
    thumb: routeThumb(route.profile),
    points: packPoints(route.points),
  }
  if (meta.fileName) row.fileName = meta.fileName
  return row
}

const round1 = (v: number) => Math.round(v * 10) / 10
