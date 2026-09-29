// Spherical-Earth geometry for routes. A sphere is plenty here: versus the
// WGS84 ellipsoid the error is a fraction of a percent and systematic along a
// course, so a 6 % grade stays 6 % to the second decimal.

/**
 * Mean Earth radius R1 = (2a + b) / 3 of the GRS80 / WGS84 ellipsoid, m
 * (Moritz 2000, "Geodetic Reference System 1980", Journal of Geodesy 74:128-133).
 */
export const EARTH_RADIUS_M = 6371008.8

const RAD = Math.PI / 180

/** Great-circle distance between two points by the haversine formula (Sinnott 1984, Sky & Telescope 68:159), m. */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const sinDLat = Math.sin(((lat2 - lat1) * RAD) / 2)
  const sinDLon = Math.sin(((lon2 - lon1) * RAD) / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * sinDLon * sinDLon
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The point reached from (lat, lon) after `distM` along the initial bearing (degrees from north). */
export function destination(lat: number, lon: number, bearingDeg: number, distM: number): { lat: number; lon: number } {
  const delta = distM / EARTH_RADIUS_M
  const theta = bearingDeg * RAD
  const phi1 = lat * RAD
  const sinPhi2 = Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)))
  const dLambda = Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi1), Math.cos(delta) - Math.sin(phi1) * sinPhi2)
  return { lat: phi2 / RAD, lon: normalizeLon(lon + dLambda / RAD) }
}

/** Wraps a longitude into [-180, 180] (values already in range are returned unchanged). */
export function normalizeLon(lon: number): number {
  return lon >= -180 && lon <= 180 ? lon : ((((lon + 180) % 360) + 360) % 360) - 180
}

/** Linear interpolation of longitude the short way round, so tracks crossing ±180° stay intact. */
export function lerpLon(a: number, b: number, f: number): number {
  let d = b - a
  if (d > 180) d -= 360
  else if (d < -180) d += 360
  return normalizeLon(a + d * f)
}
