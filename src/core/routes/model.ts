// The route model: a real course (GPX, TCX, FIT or a synthetic demo) that a
// SIM-mode ride follows. The trainer gets the gradient at the rider's position.
//
// A route keeps two representations:
//   points   the raw track as parsed: validated, de-duplicated, with cumulative
//            haversine distance. Kept for the map and for re-processing with
//            different smoothing options.
//   profile  what the ride engine reads: resampled to a fixed spacing, with the
//            elevation de-spiked and smoothed, and the grade derived, clamped and
//            rate-limited (see smooth.ts).

export type RouteSource = 'gpx' | 'tcx' | 'fit' | 'synthetic' | 'journey'

export interface RoutePoint {
  lat: number
  lon: number
  /** Metres above sea level, or null when the file has no usable elevation here. */
  ele: number | null
  /** Cumulative distance from the first point, m. */
  distM: number
  /** Epoch ms from the file's timestamp, if any. */
  t?: number
}

export interface ProfilePoint {
  /** Distance from the start, m: multiples of the spacing, then the exact route end. */
  distM: number
  /** Smoothed elevation, m. */
  ele: number
  /** Grade at this point, % (100 × rise / run), after clamping and rate limiting. */
  gradePct: number
  lat: number
  lon: number
  /** Smoothed recorded speed, m/s, when the source had timestamps. Used by Steady mode. */
  recordedMps?: number
}

export interface RouteBounds {
  minLat: number
  minLon: number
  maxLat: number
  maxLon: number
  /** Range of the smoothed profile elevation, m. */
  minEle: number
  maxEle: number
}

export interface RouteSummary {
  distanceM: number
  elevationGainM: number
  elevationLossM: number
  maxGradePct: number
  minGradePct: number
  minEle: number
  maxEle: number
}

export interface Route {
  id: string
  name: string
  source: RouteSource
  /** Raw points as parsed. */
  points: RoutePoint[]
  /** Resampled and smoothed profile. */
  profile: ProfilePoint[]
  distanceM: number
  elevationGainM: number
  elevationLossM: number
  maxGradePct: number
  minGradePct: number
  /** The source had timestamps, so the profile carries `recordedMps`. */
  hasTimes: boolean
  bounds: RouteBounds
}
