// Cycling Power Service (0x1818): Cycling Power Measurement (0x2A63) and
// Cycling Power Feature (0x2A65). GSS 2026-09-09 §3.75 and §3.74.

import { ByteReader, ByteWriter, CodecError, clampInt } from './bytes'

export interface CyclingPowerMeasurement {
  /** Instantaneous power, W (always present). */
  powerW: number
  /** Pedal power balance, % (resolution 0.5). */
  pedalBalancePct?: number
  /** Flags bit 1, present only with pedalBalancePct: true = the % is the left pedal's, false = unknown side. */
  pedalBalanceRefLeft?: boolean
  /** Accumulated torque, N·m (resolution 1/32; a rolling uint16 on the wire). */
  accumulatedTorqueNm?: number
  /** Flags bit 3, present only with accumulatedTorqueNm: true = crank based, false = wheel based. */
  torqueSourceCrank?: boolean
  /** Cumulative wheel revolutions (uint32). */
  wheelRevs?: number
  /** Last wheel event time, raw units of 1/2048 s (rolls over every 32 s). */
  wheelEventTime?: number
  /** Cumulative crank revolutions (uint16). */
  crankRevs?: number
  /** Last crank event time, raw units of 1/1024 s (rolls over every 64 s). */
  crankEventTime?: number
  maxForceN?: number
  minForceN?: number
  /** Extreme torque magnitudes, N·m (resolution 1/32). */
  maxTorqueNm?: number
  minTorqueNm?: number
  /** Crank angle at maximum / minimum force or torque, degrees (12-bit each). */
  maxAngleDeg?: number
  minAngleDeg?: number
  topDeadSpotDeg?: number
  bottomDeadSpotDeg?: number
  /** Accumulated energy, kJ. */
  accumulatedEnergyKj?: number
  /** Flags bit 12, present only when set: the sensor asks for an offset compensation. */
  offsetCompensation?: boolean
}

const BALANCE = 1 << 0
const BALANCE_REF_LEFT = 1 << 1
const TORQUE = 1 << 2
const TORQUE_SOURCE_CRANK = 1 << 3
const WHEEL = 1 << 4
const CRANK = 1 << 5
const EXTREME_FORCE = 1 << 6
const EXTREME_TORQUE = 1 << 7
const EXTREME_ANGLES = 1 << 8
const TOP_DEAD_SPOT = 1 << 9
const BOTTOM_DEAD_SPOT = 1 << 10
const ENERGY = 1 << 11
const OFFSET_COMPENSATION = 1 << 12

/** Fields after the always-present sint16 power follow the flag bit order. */
export function parseCyclingPowerMeasurement(dv: DataView): CyclingPowerMeasurement {
  const r = new ByteReader(dv, 'Cycling Power Measurement')
  const flags = r.uint16('flags')
  const m: CyclingPowerMeasurement = { powerW: r.sint16('instantaneous power') }
  if (flags & BALANCE) {
    m.pedalBalancePct = r.uint8('pedal power balance') / 2
    m.pedalBalanceRefLeft = (flags & BALANCE_REF_LEFT) !== 0
  }
  if (flags & TORQUE) {
    m.accumulatedTorqueNm = r.uint16('accumulated torque') / 32
    m.torqueSourceCrank = (flags & TORQUE_SOURCE_CRANK) !== 0
  }
  if (flags & WHEEL) {
    m.wheelRevs = r.uint32('cumulative wheel revolutions')
    m.wheelEventTime = r.uint16('last wheel event time')
  }
  if (flags & CRANK) {
    m.crankRevs = r.uint16('cumulative crank revolutions')
    m.crankEventTime = r.uint16('last crank event time')
  }
  if (flags & EXTREME_FORCE) {
    m.maxForceN = r.sint16('maximum force magnitude')
    m.minForceN = r.sint16('minimum force magnitude')
  }
  if (flags & EXTREME_TORQUE) {
    m.maxTorqueNm = r.sint16('maximum torque magnitude') / 32
    m.minTorqueNm = r.sint16('minimum torque magnitude') / 32
  }
  if (flags & EXTREME_ANGLES) {
    // Two uint12 packed into a uint24: maximum in the low 12 bits, minimum in
    // the high 12 (GSS: max 0xABC, min 0x123 → 0x123ABC).
    const packed = r.uint24('extreme angles')
    m.maxAngleDeg = packed & 0xfff
    m.minAngleDeg = packed >>> 12
  }
  if (flags & TOP_DEAD_SPOT) m.topDeadSpotDeg = r.uint16('top dead spot angle')
  if (flags & BOTTOM_DEAD_SPOT) m.bottomDeadSpotDeg = r.uint16('bottom dead spot angle')
  if (flags & ENERGY) m.accumulatedEnergyKj = r.uint16('accumulated energy')
  if (flags & OFFSET_COMPENSATION) m.offsetCompensation = true
  return m
}

/**
 * Encodes a measurement, deriving flags from the fields present. Paired
 * fields (wheel revs + time, crank revs + time, max + min force/torque/angle)
 * must be given together. Revolution counts, event times and accumulated
 * torque wrap like the rolling counters they are; everything else rounds and
 * clamps to its field.
 */
export function encodeCyclingPowerMeasurement(m: CyclingPowerMeasurement): Uint8Array {
  const wheel = pair(m.wheelRevs, m.wheelEventTime, 'wheelRevs', 'wheelEventTime')
  const crank = pair(m.crankRevs, m.crankEventTime, 'crankRevs', 'crankEventTime')
  const force = pair(m.maxForceN, m.minForceN, 'maxForceN', 'minForceN')
  const torque = pair(m.maxTorqueNm, m.minTorqueNm, 'maxTorqueNm', 'minTorqueNm')
  const angles = pair(m.maxAngleDeg, m.minAngleDeg, 'maxAngleDeg', 'minAngleDeg')
  const hasBalance = m.pedalBalancePct !== undefined
  const hasTorque = m.accumulatedTorqueNm !== undefined
  const flags =
    (hasBalance ? BALANCE : 0) |
    (hasBalance && m.pedalBalanceRefLeft ? BALANCE_REF_LEFT : 0) |
    (hasTorque ? TORQUE : 0) |
    (hasTorque && m.torqueSourceCrank ? TORQUE_SOURCE_CRANK : 0) |
    (wheel ? WHEEL : 0) |
    (crank ? CRANK : 0) |
    (force ? EXTREME_FORCE : 0) |
    (torque ? EXTREME_TORQUE : 0) |
    (angles ? EXTREME_ANGLES : 0) |
    (m.topDeadSpotDeg !== undefined ? TOP_DEAD_SPOT : 0) |
    (m.bottomDeadSpotDeg !== undefined ? BOTTOM_DEAD_SPOT : 0) |
    (m.accumulatedEnergyKj !== undefined ? ENERGY : 0) |
    (m.offsetCompensation ? OFFSET_COMPENSATION : 0)

  const w = new ByteWriter().uint16(flags).sint16(m.powerW, 'powerW')
  if (m.pedalBalancePct !== undefined) w.uint8(m.pedalBalancePct * 2, 'pedalBalancePct')
  if (m.accumulatedTorqueNm !== undefined) w.counter(m.accumulatedTorqueNm * 32, 2, 'accumulatedTorqueNm')
  if (wheel) w.counter(wheel[0], 4, 'wheelRevs').counter(wheel[1], 2, 'wheelEventTime')
  if (crank) w.counter(crank[0], 2, 'crankRevs').counter(crank[1], 2, 'crankEventTime')
  if (force) w.sint16(force[0], 'maxForceN').sint16(force[1], 'minForceN')
  if (torque) w.sint16(torque[0] * 32, 'maxTorqueNm').sint16(torque[1] * 32, 'minTorqueNm')
  if (angles) {
    const max = clampInt(angles[0], 0, 0xfff, 'maxAngleDeg')
    const min = clampInt(angles[1], 0, 0xfff, 'minAngleDeg')
    w.uint24(max | (min << 12), 'extremeAngles')
  }
  if (m.topDeadSpotDeg !== undefined) w.uint16(m.topDeadSpotDeg, 'topDeadSpotDeg')
  if (m.bottomDeadSpotDeg !== undefined) w.uint16(m.bottomDeadSpotDeg, 'bottomDeadSpotDeg')
  if (m.accumulatedEnergyKj !== undefined) w.uint16(m.accumulatedEnergyKj, 'accumulatedEnergyKj')
  return w.toBytes()
}

/** Both halves of a paired field, or neither. */
function pair(a: number | undefined, b: number | undefined, nameA: string, nameB: string): [number, number] | null {
  if (a === undefined && b === undefined) return null
  if (a === undefined || b === undefined) {
    throw new CodecError(`Cycling Power Measurement: ${nameA} and ${nameB} must be given together`)
  }
  return [a, b]
}

/** Cycling Power Feature bits 0-19, one flag per bit in bit order. */
const FEATURE_BITS = [
  'pedalPowerBalance',
  'accumulatedTorque',
  'wheelRevolutionData',
  'crankRevolutionData',
  'extremeMagnitudes',
  'extremeAngles',
  'deadSpotAngles',
  'accumulatedEnergy',
  'offsetCompensationIndicator',
  'offsetCompensation',
  'measurementContentMasking',
  'multipleSensorLocations',
  'crankLengthAdjustment',
  'chainLengthAdjustment',
  'chainWeightAdjustment',
  'spanLengthAdjustment',
  // Bit 16, Sensor Measurement Context: 0 = force based, 1 = torque based.
  'torqueBasedContext',
  'instantaneousMeasurementDirection',
  'factoryCalibrationDate',
  'enhancedOffsetCompensation',
] as const

export type CyclingPowerFeatureFlags = Record<(typeof FEATURE_BITS)[number], boolean>

/** Bits 20-21: whether the sensor may be combined with another one (e.g. left + right pedal). */
export type DistributedSystemSupport = 'unspecified' | 'notDistributed' | 'distributed' | 'reserved'
const DISTRIBUTED: readonly DistributedSystemSupport[] = ['unspecified', 'notDistributed', 'distributed', 'reserved']
const DISTRIBUTED_SHIFT = 20

export interface CyclingPowerFeature extends CyclingPowerFeatureFlags {
  /** The uint32 as read, including RFU bits. */
  raw: number
  distributedSystem: DistributedSystemSupport
}

export function parseCyclingPowerFeature(dv: DataView): CyclingPowerFeature {
  const raw = new ByteReader(dv, 'Cycling Power Feature').uint32('cycling power feature')
  const flags = {} as CyclingPowerFeatureFlags
  FEATURE_BITS.forEach((name, i) => {
    flags[name] = ((raw >>> i) & 1) === 1
  })
  return { raw, ...flags, distributedSystem: DISTRIBUTED[(raw >>> DISTRIBUTED_SHIFT) & 0b11] ?? 'unspecified' }
}

/** Encodes the feature bits for the simulator; named flags override the matching `raw` bits. */
export function encodeCyclingPowerFeature(
  f: Partial<CyclingPowerFeatureFlags> & { raw?: number; distributedSystem?: DistributedSystemSupport },
): Uint8Array {
  let bits = (f.raw ?? 0) >>> 0
  FEATURE_BITS.forEach((name, i) => {
    const on = f[name]
    if (on === true) bits = (bits | (1 << i)) >>> 0
    else if (on === false) bits = (bits & ~(1 << i)) >>> 0
  })
  if (f.distributedSystem !== undefined) {
    const code = DISTRIBUTED.indexOf(f.distributedSystem)
    bits = ((bits & ~(0b11 << DISTRIBUTED_SHIFT)) | (code << DISTRIBUTED_SHIFT)) >>> 0
  }
  return new ByteWriter().uint32(bits).toBytes()
}
