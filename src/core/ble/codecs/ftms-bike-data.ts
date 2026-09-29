// FTMS Indoor Bike Data (0x2AD2): FTMS v1.0 §4.9, GATT Specification
// Supplement (GSS, 2026-09-09) §3.139. A uint16 flags field, then every
// present field in bit order.

import { ByteReader, ByteWriter, CodecError } from './bytes'

/** One Indoor Bike Data notification, or a whole record once assembled. */
export interface IndoorBikeData {
  /**
   * Flags bit 0 (inverted: 0 means Instantaneous Speed is present). true means
   * this notification is one part of a record split over several and more
   * parts follow. Only the final part (false) carries Instantaneous Speed.
   * See IndoorBikeDataAssembler.
   */
  moreData: boolean
  /** Instantaneous speed, km/h (resolution 0.01). */
  speedKmh?: number
  /** Average speed since the session started, km/h (0.01). */
  avgSpeedKmh?: number
  /** Instantaneous cadence, rpm (0.5). */
  cadenceRpm?: number
  /** Average cadence since the session started, rpm (0.5). */
  avgCadenceRpm?: number
  /** Distance since the session started, m. */
  totalDistanceM?: number
  /** Current resistance level on the trainer's own unitless scale, unscaled (see readResistanceLevel). */
  resistanceLevel?: number
  /** Instantaneous power, W. */
  powerW?: number
  /** Average power since the session started, W. */
  avgPowerW?: number
  /** Energy since the session started, kcal. Omitted when the trainer sends 0xFFFF ("not available"). */
  totalEnergyKcal?: number
  /** Average energy rate, kcal per hour. Omitted on 0xFFFF. */
  energyPerHourKcal?: number
  /** Average energy rate, kcal per minute. Omitted on 0xFF. */
  energyPerMinuteKcal?: number
  /** Heart rate as seen by the trainer, bpm. Passed through as sent (0 is not dropped here). */
  heartRateBpm?: number
  /** Metabolic equivalent (0.1). */
  metabolicEquivalent?: number
  /** Time since the session started, s. */
  elapsedTimeS?: number
  /** Time left in the selected session, s. */
  remainingTimeS?: number
}

const MORE_DATA = 1 << 0
const AVG_SPEED = 1 << 1
const CADENCE = 1 << 2
const AVG_CADENCE = 1 << 3
const DISTANCE = 1 << 4
const RESISTANCE = 1 << 5
const POWER = 1 << 6
const AVG_POWER = 1 << 7
const ENERGY = 1 << 8
const HEART_RATE = 1 << 9
const MET = 1 << 10
const ELAPSED = 1 << 11
const REMAINING = 1 << 12

/** "Data Not Available" values of the Expended Energy fields (FTMS v1.0 §4.9.1.10-12). */
const NA_U16 = 0xffff
const NA_U8 = 0xff

export function parseIndoorBikeData(dv: DataView): IndoorBikeData {
  const r = new ByteReader(dv, 'Indoor Bike Data')
  const flags = r.uint16('flags')
  const d: IndoorBikeData = { moreData: (flags & MORE_DATA) !== 0 }
  if (!d.moreData) d.speedKmh = r.uint16('instantaneous speed') / 100
  if (flags & AVG_SPEED) d.avgSpeedKmh = r.uint16('average speed') / 100
  if (flags & CADENCE) d.cadenceRpm = r.uint16('instantaneous cadence') / 2
  if (flags & AVG_CADENCE) d.avgCadenceRpm = r.uint16('average cadence') / 2
  if (flags & DISTANCE) d.totalDistanceM = r.uint24('total distance')
  if (flags & RESISTANCE) d.resistanceLevel = readResistanceLevel(r, flags)
  if (flags & POWER) d.powerW = r.sint16('instantaneous power')
  if (flags & AVG_POWER) d.avgPowerW = r.sint16('average power')
  if (flags & ENERGY) {
    const total = r.uint16('total energy')
    const perHour = r.uint16('energy per hour')
    const perMinute = r.uint8('energy per minute')
    if (total !== NA_U16) d.totalEnergyKcal = total
    if (perHour !== NA_U16) d.energyPerHourKcal = perHour
    if (perMinute !== NA_U8) d.energyPerMinuteKcal = perMinute
  }
  if (flags & HEART_RATE) d.heartRateBpm = r.uint8('heart rate')
  if (flags & MET) d.metabolicEquivalent = r.uint8('metabolic equivalent') / 10
  if (flags & ELAPSED) d.elapsedTimeS = r.uint16('elapsed time')
  if (flags & REMAINING) d.remainingTimeS = r.uint16('remaining time')
  return d
}

/** Size of the fields that follow Resistance Level, all fixed-size once the flags are known. */
function bytesAfterResistance(flags: number): number {
  return (
    (flags & POWER ? 2 : 0) +
    (flags & AVG_POWER ? 2 : 0) +
    (flags & ENERGY ? 5 : 0) +
    (flags & HEART_RATE ? 1 : 0) +
    (flags & MET ? 1 : 0) +
    (flags & ELAPSED ? 2 : 0) +
    (flags & REMAINING ? 2 : 0)
  )
}

/**
 * Resistance Level changed type between specs. FTMS v1.0 makes it sint16,
 * and that is what shipping trainers (e.g. KICKR) send and incyclist parses;
 * GSS 2026-09-09 makes it uint8. The flags don't say which, but every field
 * after it has a fixed size, so the bytes left for it are known:
 *   exactly 1 byte left → uint8 (GSS layout);
 *   2 or more → sint16 (2 is the FTMS v1.0 layout; more would fit either
 *     reading plus trailing junk, and we prefer sint16);
 *   fewer → truncated, and the sint16 read throws.
 * The value is returned unscaled in both cases. FTMS v1.0 gives it resolution
 * 1; the GSS text says "Unit is 1" (its "M = 1, d = 1" would mean ×10, which
 * contradicts that text). Caveat: an sint16-layout payload cut short by
 * exactly one byte looks like a valid uint8-layout payload, so it parses
 * instead of throwing.
 */
function readResistanceLevel(r: ByteReader, flags: number): number {
  const left = r.remaining - bytesAfterResistance(flags)
  return left === 1 ? r.uint8('resistance level') : r.sint16('resistance level')
}

/**
 * Encodes one notification, deriving the flags from the fields present.
 * Resistance is always written as sint16 (the FTMS v1.0 form). Values are
 * rounded to each field's resolution and clamped to its range; energy values
 * stop one below the "not available" sentinel. Throws if speed does not match
 * moreData, since the flag decides whether speed is on the wire.
 */
export function encodeIndoorBikeData(d: IndoorBikeData): Uint8Array {
  if (d.moreData && d.speedKmh !== undefined) {
    throw new CodecError('Indoor Bike Data: speedKmh is only sent in the final part (moreData false)')
  }
  if (!d.moreData && d.speedKmh === undefined) {
    throw new CodecError('Indoor Bike Data: speedKmh is required in the final part (moreData false)')
  }
  const hasEnergy =
    d.totalEnergyKcal !== undefined || d.energyPerHourKcal !== undefined || d.energyPerMinuteKcal !== undefined
  const flags =
    (d.moreData ? MORE_DATA : 0) |
    (d.avgSpeedKmh !== undefined ? AVG_SPEED : 0) |
    (d.cadenceRpm !== undefined ? CADENCE : 0) |
    (d.avgCadenceRpm !== undefined ? AVG_CADENCE : 0) |
    (d.totalDistanceM !== undefined ? DISTANCE : 0) |
    (d.resistanceLevel !== undefined ? RESISTANCE : 0) |
    (d.powerW !== undefined ? POWER : 0) |
    (d.avgPowerW !== undefined ? AVG_POWER : 0) |
    (hasEnergy ? ENERGY : 0) |
    (d.heartRateBpm !== undefined ? HEART_RATE : 0) |
    (d.metabolicEquivalent !== undefined ? MET : 0) |
    (d.elapsedTimeS !== undefined ? ELAPSED : 0) |
    (d.remainingTimeS !== undefined ? REMAINING : 0)

  const w = new ByteWriter().uint16(flags, 'flags')
  if (d.speedKmh !== undefined) w.uint16(d.speedKmh * 100, 'speedKmh')
  if (d.avgSpeedKmh !== undefined) w.uint16(d.avgSpeedKmh * 100, 'avgSpeedKmh')
  if (d.cadenceRpm !== undefined) w.uint16(d.cadenceRpm * 2, 'cadenceRpm')
  if (d.avgCadenceRpm !== undefined) w.uint16(d.avgCadenceRpm * 2, 'avgCadenceRpm')
  if (d.totalDistanceM !== undefined) w.uint24(d.totalDistanceM, 'totalDistanceM')
  if (d.resistanceLevel !== undefined) w.sint16(d.resistanceLevel, 'resistanceLevel')
  if (d.powerW !== undefined) w.sint16(d.powerW, 'powerW')
  if (d.avgPowerW !== undefined) w.sint16(d.avgPowerW, 'avgPowerW')
  if (hasEnergy) {
    w.uint16(energyOrNa(d.totalEnergyKcal, NA_U16), 'totalEnergyKcal')
    w.uint16(energyOrNa(d.energyPerHourKcal, NA_U16), 'energyPerHourKcal')
    w.uint8(energyOrNa(d.energyPerMinuteKcal, NA_U8), 'energyPerMinuteKcal')
  }
  if (d.heartRateBpm !== undefined) w.uint8(d.heartRateBpm, 'heartRateBpm')
  if (d.metabolicEquivalent !== undefined) w.uint8(d.metabolicEquivalent * 10, 'metabolicEquivalent')
  if (d.elapsedTimeS !== undefined) w.uint16(d.elapsedTimeS, 'elapsedTimeS')
  if (d.remainingTimeS !== undefined) w.uint16(d.remainingTimeS, 'remainingTimeS')
  return w.toBytes()
}

/** A real value is capped one below the sentinel so it never reads back as "not available". */
function energyOrNa(value: number | undefined, na: number): number {
  return value === undefined ? na : Math.min(value, na - 1)
}

const RECORD_FIELDS = [
  'speedKmh',
  'avgSpeedKmh',
  'cadenceRpm',
  'avgCadenceRpm',
  'totalDistanceM',
  'resistanceLevel',
  'powerW',
  'avgPowerW',
  'totalEnergyKcal',
  'energyPerHourKcal',
  'energyPerMinuteKcal',
  'heartRateBpm',
  'metabolicEquivalent',
  'elapsedTimeS',
  'remainingTimeS',
] as const satisfies readonly (keyof IndoorBikeData)[]

/**
 * Reassembles records that a trainer splits across notifications (FTMS v1.0
 * §4.19): parts with moreData true accumulate, and the part with moreData
 * false completes the record and is merged over them (later values win).
 *
 * A moreData part that repeats a field already pending means a new record
 * has started without the previous one finishing (its final part was lost,
 * or the trainer sets More Data on every notification). The pending parts are
 * then returned early as a record of their own, so data keeps flowing. Elapsed
 * Time is the exception: a draft of FTMS put it in every part of a split
 * record, so it only signals a new record when its value changes.
 */
export class IndoorBikeDataAssembler {
  private pending: IndoorBikeData | null = null

  /** Returns a finished record, or null while a split record is still incomplete. */
  push(part: IndoorBikeData): IndoorBikeData | null {
    if (!part.moreData) {
      const record = mergeParts(this.pending, part)
      this.pending = null
      return record
    }
    let flushed: IndoorBikeData | null = null
    if (this.pending && startsNewRecord(this.pending, part)) {
      flushed = { ...this.pending, moreData: false }
      this.pending = null
    }
    this.pending = mergeParts(this.pending, part)
    return flushed
  }

  /** Drops any partial record (e.g. after a reconnect, per FTMS v1.0 §4.18). */
  reset(): void {
    this.pending = null
  }
}

function mergeParts(base: IndoorBikeData | null, part: IndoorBikeData): IndoorBikeData {
  const out: IndoorBikeData = { ...base, moreData: part.moreData }
  for (const key of RECORD_FIELDS) {
    const value = part[key]
    if (value !== undefined) out[key] = value
  }
  return out
}

function startsNewRecord(pending: IndoorBikeData, part: IndoorBikeData): boolean {
  return RECORD_FIELDS.some((key) => {
    const was = pending[key]
    const now = part[key]
    if (was === undefined || now === undefined) return false
    return key !== 'elapsedTimeS' || was !== now
  })
}
