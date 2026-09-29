// Sensor Location (0x2A5D), shared by Cycling Power and Cycling Speed and
// Cadence. GSS 2026-09-09 §3.218. A left-crank power meter, for example,
// measures one leg only.

import { ByteReader } from './bytes'

/** Sensor Location values 0-16; the index is the code. */
export const SENSOR_LOCATIONS = [
  'other',
  'topOfShoe',
  'inShoe',
  'hip',
  'frontWheel',
  'leftCrank',
  'rightCrank',
  'leftPedal',
  'rightPedal',
  'frontHub',
  'rearDropout',
  'chainstay',
  'rearWheel',
  'rearHub',
  'chest',
  'spider',
  'chainRing',
] as const

/** A known location, or 'unknown' for the reserved codes 17-255. */
export type SensorLocation = (typeof SENSOR_LOCATIONS)[number] | 'unknown'

export function parseSensorLocation(dv: DataView): SensorLocation {
  const code = new ByteReader(dv, 'Sensor Location').uint8('sensor location')
  return SENSOR_LOCATIONS[code] ?? 'unknown'
}

export function encodeSensorLocation(location: Exclude<SensorLocation, 'unknown'>): Uint8Array {
  return Uint8Array.of(SENSOR_LOCATIONS.indexOf(location))
}
