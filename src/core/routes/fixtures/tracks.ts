// Synthetic track generators for the route tests: pure and deterministic,
// never real rides. Coordinates run along a great circle from a round,
// arbitrary origin.
import { destination } from '../geo'
import type { RoutePoint } from '../model'

/** Seeded PRNG (mulberry32), uniform in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface LineTrackOptions {
  lengthM: number
  spacingM: number
  /** Elevation at distance s along the track (point index i); null = missing. */
  ele: (s: number, i: number) => number | null
  /** Speed at distance s, m/s. Adds timestamps when set. */
  speedMps?: (s: number) => number
  origin?: { lat: number; lon: number }
  bearingDeg?: number
}

/** Points every spacingM (plus the exact end) along a straight line, with distM = nominal distance. */
export function lineTrack(o: LineTrackOptions): RoutePoint[] {
  const origin = o.origin ?? { lat: 45, lon: 7 }
  const bearing = o.bearingDeg ?? 90
  const distances: number[] = []
  for (let i = 0; i * o.spacingM < o.lengthM - 1e-9; i++) distances.push(i * o.spacingM)
  distances.push(o.lengthM)
  let t = Date.UTC(2026, 0, 1, 8, 0, 0)
  return distances.map((s, i) => {
    if (o.speedMps && i > 0) {
      const prev = distances[i - 1]!
      t += ((s - prev) / o.speedMps((s + prev) / 2)) * 1000
    }
    const p: RoutePoint = { ...destination(origin.lat, origin.lon, bearing, s), ele: o.ele(s, i), distM: s }
    if (o.speedMps) p.t = t
    return p
  })
}

/** Serialises points as a minimal GPX 1.1 track. */
export function toGpx(points: readonly RoutePoint[], name = 'Synthetic track'): string {
  const pts = points
    .map((p) => {
      const ele = p.ele === null ? '' : `<ele>${p.ele.toFixed(2)}</ele>`
      const time = p.t === undefined ? '' : `<time>${new Date(p.t).toISOString()}</time>`
      return `<trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${ele}${time}</trkpt>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="FreeGaz tests" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>${name}</name><trkseg>
${pts}
</trkseg></trk>
</gpx>
`
}
