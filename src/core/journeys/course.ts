// A journey's course: the road (as a Route, so the route lookups work on it),
// how long it is, and its milestones. Built from the shipped journey data, or
// from a route the rider imported.
import { haversineM } from '../routes/geo'
import type { Route, RoutePoint } from '../routes/model'
import { buildRoute } from '../routes/route'
import type { ProfileOptions } from '../routes/smooth'
import { decodePolyline } from './polyline'

export type JourneyKind = 'drop' | 'grand' | 'route'
export type MilestoneKind = 'place' | 'summit' | 'border' | 'halfway' | 'finish'

/** One entry of the shipped catalogue (index.json): enough for the picker. */
export interface JourneyMeta {
  id: string
  name: string
  kind: 'drop' | 'grand'
  blurb: string
  start: string
  end: string
  lengthM: number
  gainM: number
}

/** A shipped journey file, as scripts/journeys/build.mjs writes it. */
export interface JourneyData extends JourneyMeta {
  v: 1
  /** The road, as an encoded polyline. */
  line: string
  /** Elevation every `stepM` metres along the road, m. */
  ele: { stepM: number; m: number[] }
  milestones: { m: number; name: string; kind: MilestoneKind }[]
}

export interface Milestone {
  atM: number
  name: string
  kind: MilestoneKind
}

export interface JourneyCourse {
  /** "paris-rome", or "route:<route id>" for an imported route. */
  id: string
  name: string
  kind: JourneyKind
  start: string
  end: string
  route: Route
  lengthM: number
  milestones: Milestone[]
}

// Shipped elevation is sparse (every 50 or 250 m), so smooth over a few samples
// of it, not the 50 m the importers use on dense GPX tracks.
const PROFILE: Record<'drop' | 'grand', ProfileOptions> = {
  drop: { spacingM: 10, spikeWindowM: 0, smoothWindowM: 250, gradeBaselineM: 100 },
  grand: { spacingM: 50, spikeWindowM: 0, smoothWindowM: 1000, gradeBaselineM: 500 },
}

/** Elevation at `distM` from the evenly spaced samples, linearly interpolated. */
function eleAt(ele: JourneyData['ele'], distM: number): number {
  const m = ele.m
  if (m.length === 0) return 0
  const x = Math.max(0, distM / ele.stepM)
  const i = Math.min(m.length - 1, Math.floor(x))
  const j = Math.min(m.length - 1, i + 1)
  return m[i]! + (m[j]! - m[i]!) * (x - i)
}

/** Road vertices plus points every `stepM` in between, each with its elevation. */
function densePoints(data: JourneyData): RoutePoint[] {
  const pts = decodePolyline(data.line)
  const out: RoutePoint[] = []
  let dist = 0
  for (let i = 0; i < pts.length; i++) {
    const [lat, lon] = pts[i]!
    if (i > 0) {
      const [pLat, pLon] = pts[i - 1]!
      const seg = haversineM(pLat, pLon, lat, lon)
      if (seg < 0.5) continue
      const extra = Math.floor(seg / data.ele.stepM)
      for (let k = 1; k <= extra; k++) {
        const f = (k * data.ele.stepM) / seg
        if (f >= 1) break
        const d = dist + f * seg
        out.push({ lat: pLat + (lat - pLat) * f, lon: pLon + (lon - pLon) * f, ele: eleAt(data.ele, d), distM: d })
      }
      dist += seg
    }
    out.push({ lat, lon, ele: eleAt(data.ele, dist), distM: dist })
  }
  return out
}

/** Halfway (on anything long enough to have one) and the milestones in order. */
function withHalfway(lengthM: number, ms: Milestone[]): Milestone[] {
  const out = [...ms]
  if (lengthM >= 10_000) out.push({ atM: lengthM / 2, name: 'Halfway', kind: 'halfway' })
  return out.sort((a, b) => a.atM - b.atM)
}

export function courseFromData(data: JourneyData): JourneyCourse {
  const route = buildRoute(densePoints(data), { id: `journey:${data.id}`, name: data.name, source: 'journey' }, PROFILE[data.kind])
  const lengthM = route.distanceM
  const scale = data.lengthM > 0 ? lengthM / data.lengthM : 1
  const milestones = data.milestones.map((m) => ({ atM: Math.min(lengthM, m.m * scale), name: m.name, kind: m.kind }))
  return { id: data.id, name: data.name, kind: data.kind, start: data.start, end: data.end, route, lengthM, milestones: withHalfway(lengthM, milestones) }
}

/** An imported route as a journey: distance from watts along its road, no slope control. */
export function courseFromRoute(route: Route): JourneyCourse {
  return {
    id: `route:${route.id}`,
    name: route.name,
    kind: 'route',
    start: 'the start',
    end: 'the finish',
    route,
    lengthM: route.distanceM,
    milestones: withHalfway(route.distanceM, [{ atM: route.distanceM, name: 'the finish', kind: 'finish' }]),
  }
}
