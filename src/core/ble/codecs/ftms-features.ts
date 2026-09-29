// FTMS Fitness Machine Feature (0x2ACC, FTMS v1.0 §4.3) and the Supported
// Power / Resistance Level Range characteristics (0x2AD8, 0x2AD6).

import { type Range } from '../../devices/types'
import { ByteReader, ByteWriter, CodecError } from './bytes'

/** Fitness Machine Features field, one flag per bit in bit order (bits 17-31 are RFU). */
const MACHINE_BITS = [
  'avgSpeed',
  'cadence',
  'totalDistance',
  'inclination',
  'elevationGain',
  'pace',
  'stepCount',
  'resistanceLevel',
  'strideCount',
  'expendedEnergy',
  'heartRate',
  'metabolicEquivalent',
  'elapsedTime',
  'remainingTime',
  'power',
  'forceOnBelt',
  'userDataRetention',
] as const

/** Target Setting Features field, one flag per bit in bit order (bits 17-31 are RFU). */
const TARGET_BITS = [
  'speed',
  'inclination',
  'resistance',
  'power',
  'heartRate',
  'targetedEnergy',
  'targetedSteps',
  'targetedStrides',
  'targetedDistance',
  'targetedTime',
  'targetedHrZones2',
  'targetedHrZones3',
  'targetedHrZones5',
  'simulation',
  'wheelCircumference',
  'spinDown',
  'cadence',
] as const

/** What the machine can measure and report. */
export type FtmsMachineFeatures = Record<(typeof MACHINE_BITS)[number], boolean>
/** What the machine accepts as a target via the control point. */
export type FtmsTargetFeatures = Record<(typeof TARGET_BITS)[number], boolean>

export interface FtmsFeatures {
  /** Both uint32 fields as read, including RFU bits. */
  raw: { machine: number; target: number }
  machine: FtmsMachineFeatures
  target: FtmsTargetFeatures
}

/** Input for encodeFtmsFeatures. Named flags override the matching raw bits. */
export interface FtmsFeaturesInit {
  raw?: { machine?: number; target?: number }
  machine?: Partial<FtmsMachineFeatures>
  target?: Partial<FtmsTargetFeatures>
}

export function parseFtmsFeatures(dv: DataView): FtmsFeatures {
  const r = new ByteReader(dv, 'Fitness Machine Feature')
  const machine = r.uint32('fitness machine features')
  const target = r.uint32('target setting features')
  return { raw: { machine, target }, machine: bitsToFlags(machine, MACHINE_BITS), target: bitsToFlags(target, TARGET_BITS) }
}

export function encodeFtmsFeatures(f: FtmsFeaturesInit): Uint8Array {
  const machine = flagsToBits(f.raw?.machine ?? 0, f.machine ?? {}, MACHINE_BITS)
  const target = flagsToBits(f.raw?.target ?? 0, f.target ?? {}, TARGET_BITS)
  return new ByteWriter().uint32(machine, 'machine').uint32(target, 'target').toBytes()
}

function bitsToFlags<K extends string>(bits: number, names: readonly K[]): Record<K, boolean> {
  const out = {} as Record<K, boolean>
  names.forEach((name, i) => {
    out[name] = ((bits >>> i) & 1) === 1
  })
  return out
}

function flagsToBits<K extends string>(raw: number, flags: Partial<Record<K, boolean>>, names: readonly K[]): number {
  let bits = raw >>> 0
  names.forEach((name, i) => {
    const on = flags[name]
    if (on === true) bits = (bits | (1 << i)) >>> 0
    else if (on === false) bits = (bits & ~(1 << i)) >>> 0
  })
  return bits
}

/** Supported Power Range: sint16 min, sint16 max, uint16 minimum increment, all in W. */
export function parseSupportedPowerRange(dv: DataView): Range {
  const r = new ByteReader(dv, 'Supported Power Range')
  return { min: r.sint16('minimum power'), max: r.sint16('maximum power'), step: r.uint16('minimum increment') }
}

export function encodeSupportedPowerRange(range: Range): Uint8Array {
  return new ByteWriter()
    .sint16(range.min, 'min')
    .sint16(range.max, 'max')
    .uint16(range.step, 'step')
    .toBytes()
}

/** Wire form of a resistance level: FTMS v1.0 sint16 or the one-byte uint8 form. */
export type ResistanceEncoding = 'uint8' | 'sint16'

/** A resistance range in device units, plus the wire form the trainer used. */
export interface ResistanceRange extends Range {
  encoding: ResistanceEncoding
}

/**
 * Supported Resistance Level Range, in either layout:
 *   6 bytes (FTMS v1.0): sint16 min, sint16 max, uint16 increment;
 *   3 bytes (GSS 2026-09-09): uint8 min, uint8 max, uint8 increment.
 * Both are read with resolution 0.1. That is FTMS v1.0's resolution and
 * matches the control point's Set Target Resistance Level (uint8, 0.1). The
 * GSS text for the 3-byte form is self-contradictory ("M = 1, d = 1" means
 * ×10, while "Unit is 1" means ×1); we keep 0.1 so both layouts and the
 * control point share one scale. Payloads longer than 6 bytes are read as the
 * 6-byte layout; 4 or 5 bytes (a truncated 6-byte form) and fewer than 3 throw.
 */
export function parseSupportedResistanceRange(dv: DataView): ResistanceRange {
  const r = new ByteReader(dv, 'Supported Resistance Level Range')
  if (dv.byteLength === 3) {
    return {
      min: r.uint8('minimum resistance level') / 10,
      max: r.uint8('maximum resistance level') / 10,
      step: r.uint8('minimum increment') / 10,
      encoding: 'uint8',
    }
  }
  if (dv.byteLength > 3 && dv.byteLength < 6) {
    throw new CodecError(
      `Supported Resistance Level Range: truncated, ${dv.byteLength} bytes is neither the 3-byte nor the 6-byte layout`,
    )
  }
  return {
    min: r.sint16('minimum resistance level') / 10,
    max: r.sint16('maximum resistance level') / 10,
    step: r.uint16('minimum increment') / 10,
    encoding: 'sint16',
  }
}

/** Encodes a range in device units (resolution 0.1). The layout defaults to the 6-byte sint16 form. */
export function encodeSupportedResistanceRange(range: Range & { encoding?: ResistanceEncoding }): Uint8Array {
  const w = new ByteWriter()
  if (range.encoding === 'uint8') {
    return w.uint8(range.min * 10, 'min').uint8(range.max * 10, 'max').uint8(range.step * 10, 'step').toBytes()
  }
  return w.sint16(range.min * 10, 'min').sint16(range.max * 10, 'max').uint16(range.step * 10, 'step').toBytes()
}
