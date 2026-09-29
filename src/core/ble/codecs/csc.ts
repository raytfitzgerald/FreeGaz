// Cycling Speed and Cadence Service (0x1816): CSC Measurement (0x2A5B) and
// CSC Feature (0x2A5C). GSS 2026-09-09 §3.71 and §3.70. Unlike Cycling Power,
// both event times here tick at 1024 Hz.

import { ByteReader, ByteWriter, CodecError } from './bytes'

export interface CscMeasurement {
  /** Cumulative wheel revolutions (uint32). */
  wheelRevs?: number
  /** Last wheel event time, raw units of 1/1024 s (rolls over every 64 s). */
  wheelEventTime?: number
  /** Cumulative crank revolutions (uint16). */
  crankRevs?: number
  /** Last crank event time, raw units of 1/1024 s. */
  crankEventTime?: number
}

const WHEEL = 1 << 0
const CRANK = 1 << 1

export function parseCscMeasurement(dv: DataView): CscMeasurement {
  const r = new ByteReader(dv, 'CSC Measurement')
  const flags = r.uint8('flags')
  const m: CscMeasurement = {}
  if (flags & WHEEL) {
    m.wheelRevs = r.uint32('cumulative wheel revolutions')
    m.wheelEventTime = r.uint16('last wheel event time')
  }
  if (flags & CRANK) {
    m.crankRevs = r.uint16('cumulative crank revolutions')
    m.crankEventTime = r.uint16('last crank event time')
  }
  return m
}

/** Revolution counts and event times wrap like the rolling counters they are. */
export function encodeCscMeasurement(m: CscMeasurement): Uint8Array {
  const wheel = m.wheelRevs !== undefined || m.wheelEventTime !== undefined
  const crank = m.crankRevs !== undefined || m.crankEventTime !== undefined
  if (wheel && (m.wheelRevs === undefined || m.wheelEventTime === undefined)) {
    throw new CodecError('CSC Measurement: wheelRevs and wheelEventTime must be given together')
  }
  if (crank && (m.crankRevs === undefined || m.crankEventTime === undefined)) {
    throw new CodecError('CSC Measurement: crankRevs and crankEventTime must be given together')
  }
  const w = new ByteWriter().uint8((wheel ? WHEEL : 0) | (crank ? CRANK : 0))
  if (wheel) w.counter(m.wheelRevs ?? 0, 4, 'wheelRevs').counter(m.wheelEventTime ?? 0, 2, 'wheelEventTime')
  if (crank) w.counter(m.crankRevs ?? 0, 2, 'crankRevs').counter(m.crankEventTime ?? 0, 2, 'crankEventTime')
  return w.toBytes()
}

export interface CscFeature {
  /** The uint16 as read, including RFU bits. */
  raw: number
  wheelRevolutionData: boolean
  crankRevolutionData: boolean
  multipleSensorLocations: boolean
}

export function parseCscFeature(dv: DataView): CscFeature {
  const raw = new ByteReader(dv, 'CSC Feature').uint16('csc feature')
  return {
    raw,
    wheelRevolutionData: (raw & 1) !== 0,
    crankRevolutionData: (raw & 2) !== 0,
    multipleSensorLocations: (raw & 4) !== 0,
  }
}

export function encodeCscFeature(f: Partial<Omit<CscFeature, 'raw'>>): Uint8Array {
  const bits = (f.wheelRevolutionData ? 1 : 0) | (f.crankRevolutionData ? 2 : 0) | (f.multipleSensorLocations ? 4 : 0)
  return new ByteWriter().uint16(bits).toBytes()
}
