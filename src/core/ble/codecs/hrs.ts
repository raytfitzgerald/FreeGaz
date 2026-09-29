// Heart Rate Service (0x180D): Heart Rate Measurement (0x2A37) and Body
// Sensor Location (0x2A38). GSS 2026-09-09 §3.126 and §3.38.

import { ByteReader, ByteWriter, roundTo } from './bytes'

export interface HeartRateMeasurement {
  bpm: number
  /** Flags bit 2: the strap reports skin contact. */
  contactSupported: boolean
  /** Flags bit 1, present only when contactSupported. */
  contactDetected?: boolean
  /** Energy expended since the last reset, kJ (HRS v1.0 unit; GSS lists joule without a scale). */
  energyExpendedKj?: number
  /** Beat-to-beat intervals, oldest first, ms rounded to 0.1 (wire unit is 1/1024 s). */
  rrMs: number[]
}

const HR_UINT16 = 1 << 0
const CONTACT_DETECTED = 1 << 1
const CONTACT_SUPPORTED = 1 << 2
const ENERGY = 1 << 3
const RR = 1 << 4

export function parseHeartRateMeasurement(dv: DataView): HeartRateMeasurement {
  const r = new ByteReader(dv, 'Heart Rate Measurement')
  const flags = r.uint8('flags')
  const bpm = flags & HR_UINT16 ? r.uint16('heart rate (uint16)') : r.uint8('heart rate (uint8)')
  const m: HeartRateMeasurement = { bpm, contactSupported: (flags & CONTACT_SUPPORTED) !== 0, rrMs: [] }
  if (m.contactSupported) m.contactDetected = (flags & CONTACT_DETECTED) !== 0
  if (flags & ENERGY) m.energyExpendedKj = r.uint16('energy expended')
  if (flags & RR) {
    if (r.remaining % 2 !== 0) throw r.invalid(`truncated, ${r.remaining} bytes left is not a whole number of RR-intervals`)
    while (r.remaining > 0) m.rrMs.push(rrToMs(r.uint16('RR-interval')))
  }
  return m
}

/** 1/1024 s → ms with one decimal. */
function rrToMs(raw: number): number {
  return roundTo((raw * 1000) / 1024, 1)
}

/**
 * Encodes a measurement. The heart rate goes out as uint8 when it fits unless
 * `opts.uint16` forces the 16-bit form. RR intervals are converted from ms
 * back to 1/1024 s; the RR flag is set only when there is at least one.
 */
export function encodeHeartRateMeasurement(m: HeartRateMeasurement, opts: { uint16?: boolean } = {}): Uint8Array {
  const wide = opts.uint16 === true || m.bpm > 0xff
  const flags =
    (wide ? HR_UINT16 : 0) |
    (m.contactSupported ? CONTACT_SUPPORTED : 0) |
    (m.contactSupported && m.contactDetected ? CONTACT_DETECTED : 0) |
    (m.energyExpendedKj !== undefined ? ENERGY : 0) |
    (m.rrMs.length > 0 ? RR : 0)
  const w = new ByteWriter().uint8(flags)
  if (wide) w.uint16(m.bpm, 'bpm')
  else w.uint8(m.bpm, 'bpm')
  if (m.energyExpendedKj !== undefined) w.uint16(m.energyExpendedKj, 'energyExpendedKj')
  for (const ms of m.rrMs) w.uint16((ms * 1024) / 1000, 'rrMs')
  return w.toBytes()
}

/** Body Sensor Location values 0x00-0x06; the index is the code. */
export const BODY_SENSOR_LOCATIONS = ['other', 'chest', 'wrist', 'finger', 'hand', 'earLobe', 'foot'] as const

/** A known location, or 'unknown' for the reserved codes 0x07-0xFF. */
export type BodySensorLocation = (typeof BODY_SENSOR_LOCATIONS)[number] | 'unknown'

export function parseBodySensorLocation(dv: DataView): BodySensorLocation {
  const code = new ByteReader(dv, 'Body Sensor Location').uint8('body sensor location')
  return BODY_SENSOR_LOCATIONS[code] ?? 'unknown'
}

export function encodeBodySensorLocation(location: Exclude<BodySensorLocation, 'unknown'>): Uint8Array {
  return Uint8Array.of(BODY_SENSOR_LOCATIONS.indexOf(location))
}
