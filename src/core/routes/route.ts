// Assembling a Route: raw points -> profile, summary, bounds and a stable id,
// plus one-call import of a GPX or TCX file.
import type { ProfilePoint, Route, RouteBounds, RoutePoint, RouteSource } from './model'
import { parseRouteFile } from './parse'
import { buildProfile, summarize, type ProfileOptions } from './smooth'

export interface RouteMeta {
  /** Defaults to a hash of the geometry, so importing the same track twice gives the same id. */
  id?: string
  name: string
  source: RouteSource
}

export interface RouteFileMeta {
  /** Used for the name when neither `name` nor the file has one. */
  fileName?: string
  id?: string
  /** Overrides the name found in the file. */
  name?: string
}

/** Builds a complete Route from raw points (from any importer, or synthetic). */
export function buildRoute(points: readonly RoutePoint[], meta: RouteMeta, opts?: ProfileOptions): Route {
  const profile = buildProfile(points, opts)
  const summary = summarize(profile, opts)
  return {
    id: meta.id ?? routeId(meta.source, points),
    name: meta.name,
    source: meta.source,
    points: points.map((p) => ({ ...p })),
    profile,
    distanceM: summary.distanceM,
    elevationGainM: summary.elevationGainM,
    elevationLossM: summary.elevationLossM,
    maxGradePct: summary.maxGradePct,
    minGradePct: summary.minGradePct,
    hasTimes: profile[0]?.recordedMps !== undefined,
    bounds: routeBounds(points, profile),
  }
}

/** Parses a GPX or TCX file and builds the Route. Throws RouteImportError with a rider-facing message. */
export function routeFromFile(content: string | Uint8Array, meta: RouteFileMeta = {}, opts?: ProfileOptions): Route {
  const parsed = parseRouteFile(content)
  const name = meta.name ?? parsed.name ?? nameFromFileName(meta.fileName) ?? 'Imported route'
  return buildRoute(parsed.points, { id: meta.id, name, source: parsed.format }, opts)
}

/**
 * A stable id from the geometry: `<source>-<16 hex>`, two MurmurHash3-style
 * 32-bit lanes over lat/lon (1e-6 degree) and elevation (0.1 m). For
 * de-duplicating imports, not for security.
 */
export function routeId(source: RouteSource, points: readonly RoutePoint[]): string {
  let h1 = points.length | 0
  let h2 = (points.length ^ 0x5bd1e995) | 0
  for (const p of points) {
    const lat = Math.round(p.lat * 1e6)
    const lon = Math.round(p.lon * 1e6)
    const ele = p.ele === null ? 0x7fffffff : Math.round(p.ele * 10)
    h1 = mix(mix(mix(h1, lat), lon), ele)
    h2 = mix(mix(mix(h2, ele ^ 0x27d4eb2f), lat ^ 0x165667b1), lon ^ 0x61c88647)
  }
  return `${source}-${hex(finalize(h1))}${hex(finalize(h2))}`
}

function mix(h: number, word: number): number {
  let k = Math.imul(word | 0, 0xcc9e2d51)
  k = (k << 15) | (k >>> 17)
  k = Math.imul(k, 0x1b873593)
  let x = h ^ k
  x = (x << 13) | (x >>> 19)
  return (Math.imul(x, 5) + 0xe6546b64) | 0
}

function finalize(h: number): number {
  let x = h ^ (h >>> 16)
  x = Math.imul(x, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  return x ^ (x >>> 16)
}

function hex(h: number): string {
  return (h >>> 0).toString(16).padStart(8, '0')
}

function routeBounds(points: readonly RoutePoint[], profile: readonly ProfilePoint[]): RouteBounds {
  const b: RouteBounds = { minLat: Infinity, minLon: Infinity, maxLat: -Infinity, maxLon: -Infinity, minEle: Infinity, maxEle: -Infinity }
  for (const p of points) {
    b.minLat = Math.min(b.minLat, p.lat)
    b.maxLat = Math.max(b.maxLat, p.lat)
    b.minLon = Math.min(b.minLon, p.lon)
    b.maxLon = Math.max(b.maxLon, p.lon)
  }
  for (const p of profile) {
    b.minEle = Math.min(b.minEle, p.ele)
    b.maxEle = Math.max(b.maxEle, p.ele)
  }
  return b
}

/** "Some/dir/Col du Test.gpx" -> "Col du Test". */
function nameFromFileName(fileName: string | undefined): string | undefined {
  const base = fileName?.split(/[\\/]/).pop()?.replace(/\.[^.]*$/, '').trim()
  return base ? base : undefined
}
