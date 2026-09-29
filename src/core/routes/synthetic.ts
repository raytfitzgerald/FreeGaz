// Synthetic routes: deterministic courses built from segments, for tests and
// for the app's built-in demo routes. Positions follow a great circle from an
// arbitrary origin, or a closed circle for loops, so the map has something to
// draw. They go through the same pipeline as imported routes.
import { destination } from './geo'
import type { Route, RoutePoint } from './model'
import { buildRoute } from './route'
import type { ProfileOptions } from './smooth'

export type SyntheticSegment =
  | { kind: 'flat'; lengthM: number; speedKmh?: number }
  /** Constant grade; negative for a descent. */
  | { kind: 'climb'; lengthM: number; gradePct: number; speedKmh?: number }
  /** Sine hills: elevation = start + amplitude x sin(2 pi s / wavelength). */
  | { kind: 'rolling'; lengthM: number; amplitudeM: number; wavelengthM: number; speedKmh?: number }

export interface SyntheticSpec {
  id?: string
  name?: string
  segments: readonly SyntheticSegment[]
  /** Elevation at the start, m. Default 100. */
  startEleM?: number
  /** Start position. Default 45 N, 7 E: an arbitrary round coordinate. */
  origin?: { lat: number; lon: number }
  /** 'line' follows a great circle; 'loop' is a closed circle with the route's length as circumference. Default 'line'. */
  shape?: 'line' | 'loop'
  /** Initial bearing of a 'line', degrees from north. Default 90 (east). */
  bearingDeg?: number
  /** Raw point spacing, m. Default 10. Segment boundaries always get a point. */
  spacingM?: number
  /**
   * Adds timestamps, so the route has a recorded speed for Steady mode. Set it
   * here or per segment; a segment without its own speed uses this one
   * (25 km/h when only some segments have one).
   */
  speedKmh?: number
  /** Epoch ms of the first point when timestamps are added. Default 2026-01-01T08:00:00Z. */
  startTimeMs?: number
}

export const DEFAULT_SYNTHETIC_ORIGIN = { lat: 45, lon: 7 } as const

/** Deterministic raw points for a spec. distM is the exact nominal distance along the course. */
export function syntheticPoints(spec: SyntheticSpec): RoutePoint[] {
  const spacing = spec.spacingM ?? 10
  if (!(spacing > 0 && Number.isFinite(spacing))) throw new RangeError('spacingM must be a finite number > 0')
  if (spec.segments.length === 0) throw new RangeError('a synthetic route needs at least one segment')
  for (const seg of spec.segments) {
    if (!(seg.lengthM > 0 && Number.isFinite(seg.lengthM))) throw new RangeError('segment lengthM must be a finite number > 0')
    if (seg.speedKmh !== undefined && !(seg.speedKmh > 0)) throw new RangeError('segment speedKmh must be > 0')
    if (seg.kind === 'rolling' && !(seg.wavelengthM > 0)) throw new RangeError('rolling wavelengthM must be > 0')
  }
  if (spec.speedKmh !== undefined && !(spec.speedKmh > 0)) throw new RangeError('speedKmh must be > 0')

  const origin = spec.origin ?? DEFAULT_SYNTHETIC_ORIGIN
  const total = spec.segments.reduce((sum, seg) => sum + seg.lengthM, 0)
  const timed = spec.speedKmh !== undefined || spec.segments.some((seg) => seg.speedKmh !== undefined)
  const fallbackKmh = spec.speedKmh ?? 25
  const place = placement(spec, origin, total)

  const points: RoutePoint[] = []
  let ele0 = spec.startEleM ?? 100
  let s0 = 0
  let t = spec.startTimeMs ?? Date.UTC(2026, 0, 1, 8, 0, 0)
  let prevS = 0
  const push = (s: number, seg: SyntheticSegment, ele: number): void => {
    if (timed) t += ((s - prevS) / ((seg.speedKmh ?? fallbackKmh) / 3.6)) * 1000
    prevS = s
    const p: RoutePoint = { ...place(s), ele, distM: s }
    if (timed) p.t = Math.round(t)
    points.push(p)
  }
  for (const [index, seg] of spec.segments.entries()) {
    const s1 = s0 + seg.lengthM
    if (index === 0) push(0, seg, ele0)
    for (let k = Math.floor(s0 / spacing) + 1; k * spacing < s1 - 1e-6; k++) {
      if (k * spacing - s0 > 1e-6) push(k * spacing, seg, segmentEle(seg, ele0, k * spacing - s0))
    }
    const end = segmentEle(seg, ele0, seg.lengthM)
    push(s1, seg, end)
    ele0 = end
    s0 = s1
  }
  return points
}

/** A synthetic Route (source 'synthetic'), through the same profile pipeline as imports. */
export function syntheticRoute(spec: SyntheticSpec, opts?: ProfileOptions): Route {
  return buildRoute(syntheticPoints(spec), { id: spec.id, name: spec.name ?? 'Synthetic route', source: 'synthetic' }, opts)
}

/** Built-in demo routes. The names are FreeGaz's own. */
export const DEMO_ROUTE_SPECS: readonly SyntheticSpec[] = [
  {
    id: 'demo-test-loop',
    name: 'FreeGaz Test Loop',
    shape: 'loop',
    segments: [
      { kind: 'flat', lengthM: 1000, speedKmh: 32 },
      { kind: 'climb', lengthM: 2000, gradePct: 4, speedKmh: 20 },
      { kind: 'flat', lengthM: 1000, speedKmh: 32 },
      { kind: 'climb', lengthM: 2000, gradePct: -4, speedKmh: 42 },
    ],
  },
  { id: 'demo-flat-five', name: 'FreeGaz Flat Five', segments: [{ kind: 'flat', lengthM: 5000 }] },
  {
    id: 'demo-six-percent',
    name: 'FreeGaz Six Percent',
    segments: [
      { kind: 'flat', lengthM: 500 },
      { kind: 'climb', lengthM: 3000, gradePct: 6 },
      { kind: 'flat', lengthM: 500 },
    ],
  },
  {
    id: 'demo-rollers',
    name: 'FreeGaz Rollers',
    segments: [{ kind: 'rolling', lengthM: 10000, amplitudeM: 15, wavelengthM: 1250 }],
  },
]

export function demoRoutes(opts?: ProfileOptions): Route[] {
  return DEMO_ROUTE_SPECS.map((spec) => syntheticRoute(spec, opts))
}

function segmentEle(seg: SyntheticSegment, ele0: number, along: number): number {
  switch (seg.kind) {
    case 'flat':
      return ele0
    case 'climb':
      return ele0 + (seg.gradePct / 100) * along
    case 'rolling':
      return ele0 + seg.amplitudeM * Math.sin((2 * Math.PI * along) / seg.wavelengthM)
  }
}

function placement(spec: SyntheticSpec, origin: { lat: number; lon: number }, total: number): (s: number) => { lat: number; lon: number } {
  if (spec.shape === 'loop') {
    // Start on the south side of a circle and ride it anticlockwise (east first).
    const radius = total / (2 * Math.PI)
    const centre = destination(origin.lat, origin.lon, 0, radius)
    return (s) => destination(centre.lat, centre.lon, 180 - (360 * s) / total, radius)
  }
  const bearing = spec.bearingDeg ?? 90
  return (s) => destination(origin.lat, origin.lon, bearing, s)
}
