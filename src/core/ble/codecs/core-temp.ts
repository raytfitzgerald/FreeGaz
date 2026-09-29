// CORE body temperature sensor: Core Body Temperature characteristic
// 00002101-5b1e-4347-b07c-97b514dae121 (service 00002100-...). Public spec:
// "CORE SENSOR - Core Body Temperature Service Specification" V2.2 §3.1, at
// github.com/CoreBodyTemp/CoreBodyTemp.
//
// Flags uint8, then in order:
//   Core Body Temperature  sint16, 0.01 °C or °F, always present (0x7FFF = no reading)
//   Skin Temperature       sint16, 0.01 °C or °F     flags bit 0
//   Core Reserved          sint16, no defined meaning flags bit 1
//   Quality and State      uint8                      flags bit 2
//   Heart Rate             uint8, bpm (0 = no signal) flags bit 4
//   Heat Strain Index      uint8, 0.1, 0-25.4         flags bit 5
// Flags bit 3 selects °F. The spec's flag table says "value invalid/valid",
// but its structure table marks the fields "(if present)" and CORE's
// implementation notes say fields are left out when their flag is clear, so
// the flags mean presence, as in FTMS.

import { ByteReader, ByteWriter } from './bytes'

/** Data Quality, bits 0-2 of Quality and State. */
export type CoreDataQuality = 'invalid' | 'poor' | 'fair' | 'good' | 'excellent' | 'notAvailable' | 'reserved'
/** Heart-rate pairing state, bits 4-5 of Quality and State. */
export type CoreHrState = 'notSupported' | 'notReceiving' | 'receiving' | 'notAvailable'

/**
 * One Core Body Temperature notification, decoded as sent. Despite the "C" in
 * their names, coreTempC and skinTempC are in `units`: °F when the sensor
 * sends °F. Callers convert (as the CORE driver does).
 */
export interface CoreTempMeasurement {
  /** Core body temperature in `units` (0.01). Omitted when the sensor has no reading (0x7FFF). */
  coreTempC?: number
  /** Skin temperature in `units` (0.01). Omitted on 0x7FFF. */
  skinTempC?: number
  /** Raw sint16; the spec gives it no meaning. */
  coreReserved?: number
  quality?: CoreDataQuality
  hrState?: CoreHrState
  /** Heart rate the sensor receives from a paired strap. Omitted when it sends 0 (no signal). */
  heartRateBpm?: number
  /** Heat Strain Index, 0-25.4. Omitted on 0xFF, a value the spec never assigns. */
  heatStrainIndex?: number
  /** Unit of coreTempC and skinTempC: flags bit 3. */
  units: 'C' | 'F'
}

const SKIN = 1 << 0
const RESERVED = 1 << 1
const QUALITY_STATE = 1 << 2
const UNIT_F = 1 << 3
const HEART_RATE = 1 << 4
const HEAT_STRAIN = 1 << 5

/** "Data not available" temperature (0x7FFF). */
const NO_READING = 0x7fff
const NO_HSI = 0xff

/** Index = the 3-bit Data Quality code (5 and 6 are reserved, 7 means not available). */
const QUALITY: readonly CoreDataQuality[] = ['invalid', 'poor', 'fair', 'good', 'excellent', 'reserved', 'reserved', 'notAvailable']
/** Index = the 2-bit heart-rate state code. */
const HR_STATE: readonly CoreHrState[] = ['notSupported', 'notReceiving', 'receiving', 'notAvailable']

export function parseCoreTemp(dv: DataView): CoreTempMeasurement {
  const r = new ByteReader(dv, 'Core Body Temperature')
  const flags = r.uint8('flags')
  const units = flags & UNIT_F ? 'F' : 'C'
  const m: CoreTempMeasurement = { units }
  const core = r.sint16('core body temperature')
  if (core !== NO_READING) m.coreTempC = core / 100
  if (flags & SKIN) {
    const skin = r.sint16('skin temperature')
    if (skin !== NO_READING) m.skinTempC = skin / 100
  }
  if (flags & RESERVED) m.coreReserved = r.sint16('core reserved')
  if (flags & QUALITY_STATE) {
    const qs = r.uint8('quality and state')
    m.quality = QUALITY[qs & 0b111] ?? 'reserved'
    m.hrState = HR_STATE[(qs >> 4) & 0b11] ?? 'notAvailable'
  }
  if (flags & HEART_RATE) {
    const hr = r.uint8('heart rate')
    if (hr !== 0) m.heartRateBpm = hr
  }
  if (flags & HEAT_STRAIN) {
    const hsi = r.uint8('heat strain index')
    if (hsi !== NO_HSI) m.heatStrainIndex = hsi / 10
  }
  return m
}

/**
 * Encodes a measurement (for the simulated sensor). Temperatures are taken to
 * be in `units` already and are written as they are. A missing core
 * temperature is sent as 0x7FFF; a missing quality or heart-rate state is
 * sent as "not available" when the other one is given.
 */
export function encodeCoreTemp(m: CoreTempMeasurement): Uint8Array {
  const hasQualityState = m.quality !== undefined || m.hrState !== undefined
  const flags =
    (m.skinTempC !== undefined ? SKIN : 0) |
    (m.coreReserved !== undefined ? RESERVED : 0) |
    (hasQualityState ? QUALITY_STATE : 0) |
    (m.units === 'F' ? UNIT_F : 0) |
    (m.heartRateBpm !== undefined ? HEART_RATE : 0) |
    (m.heatStrainIndex !== undefined ? HEAT_STRAIN : 0)
  const w = new ByteWriter().uint8(flags).sint16(tempRaw(m.coreTempC), 'coreTempC')
  if (m.skinTempC !== undefined) w.sint16(tempRaw(m.skinTempC), 'skinTempC')
  if (m.coreReserved !== undefined) w.sint16(m.coreReserved, 'coreReserved')
  if (hasQualityState) {
    const quality = m.quality === undefined ? 7 : QUALITY.indexOf(m.quality)
    const hrState = m.hrState === undefined ? 3 : HR_STATE.indexOf(m.hrState)
    w.uint8(quality | (hrState << 4))
  }
  if (m.heartRateBpm !== undefined) w.uint8(m.heartRateBpm, 'heartRateBpm')
  if (m.heatStrainIndex !== undefined) w.uint8(Math.min(m.heatStrainIndex * 10, 254), 'heatStrainIndex')
  return w.toBytes()
}

/** Raw 0.01-degree value, kept one below the "no reading" sentinel. */
function tempRaw(degrees: number | undefined): number {
  return degrees === undefined ? NO_READING : Math.min(degrees * 100, NO_READING - 1)
}
