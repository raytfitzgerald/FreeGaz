// FTMS Fitness Machine Status (0x2ADA, FTMS v1.0 §4.17) and Training Status
// (0x2AD3, §4.10).

import { ByteReader, ByteWriter, CodecError } from './bytes'
import { type ResistanceEncoding } from './ftms-features'
import { readSimulation, writeSimulation } from './ftms-simulation'

export type SpinDownStatus = 'requested' | 'success' | 'error' | 'stopPedaling'

export type FtmsStatus =
  | { kind: 'reset' }
  | { kind: 'stoppedByUser' }
  | { kind: 'pausedByUser' }
  | { kind: 'stoppedBySafetyKey' }
  | { kind: 'startedByUser' }
  | { kind: 'targetSpeedChanged'; kmh: number }
  | { kind: 'targetInclinationChanged'; pct: number }
  /** `level` has resolution 0.1. `encoding` is the wire form (spec: uint8). */
  | { kind: 'targetResistanceChanged'; level: number; encoding?: ResistanceEncoding }
  | { kind: 'targetPowerChanged'; watts: number }
  | { kind: 'targetHeartRateChanged'; bpm: number }
  | { kind: 'simulationChanged'; windMps: number; gradePct: number; crr: number; cwKgPerM: number }
  | { kind: 'wheelCircumferenceChanged'; mm: number }
  | { kind: 'spinDown'; status: SpinDownStatus }
  | { kind: 'targetCadenceChanged'; rpm: number }
  | { kind: 'controlPermissionLost' }
  /** Any other op code (targeted energy/steps/distance/time, RFU) or a reserved parameter value. */
  | { kind: 'other'; op: number; params?: Uint8Array }

const Op = {
  Reset: 0x01,
  StoppedOrPausedByUser: 0x02,
  StoppedBySafetyKey: 0x03,
  StartedByUser: 0x04,
  TargetSpeedChanged: 0x05,
  TargetInclineChanged: 0x06,
  TargetResistanceChanged: 0x07,
  TargetPowerChanged: 0x08,
  TargetHeartRateChanged: 0x09,
  SimulationChanged: 0x12,
  WheelCircumferenceChanged: 0x13,
  SpinDownStatus: 0x14,
  TargetCadenceChanged: 0x15,
  ControlPermissionLost: 0xff,
} as const

/** Spin Down Status values 0x01-0x04 (FTMS v1.0 Table 4.27). */
const SPIN_DOWN: readonly SpinDownStatus[] = ['requested', 'success', 'error', 'stopPedaling']

/**
 * Parses one status notification. Target Resistance Level Changed is uint8
 * (0.1) per the spec; a 2-byte parameter is accepted as sint16 (0.1), which
 * trainers that use sint16 on the control point may echo back.
 */
export function parseFtmsStatus(dv: DataView): FtmsStatus {
  const r = new ByteReader(dv, 'Fitness Machine Status')
  const op = r.uint8('op code')
  switch (op) {
    case Op.Reset:
      return { kind: 'reset' }
    case Op.StoppedOrPausedByUser: {
      const info = r.uint8('control information')
      if (info === 0x01) return { kind: 'stoppedByUser' }
      if (info === 0x02) return { kind: 'pausedByUser' }
      return { kind: 'other', op, params: Uint8Array.of(info, ...r.rest()) }
    }
    case Op.StoppedBySafetyKey:
      return { kind: 'stoppedBySafetyKey' }
    case Op.StartedByUser:
      return { kind: 'startedByUser' }
    case Op.TargetSpeedChanged:
      return { kind: 'targetSpeedChanged', kmh: r.uint16('target speed') / 100 }
    case Op.TargetInclineChanged:
      return { kind: 'targetInclinationChanged', pct: r.sint16('target inclination') / 10 }
    case Op.TargetResistanceChanged:
      if (r.remaining === 1) {
        return { kind: 'targetResistanceChanged', level: r.uint8('target resistance level') / 10, encoding: 'uint8' }
      }
      return { kind: 'targetResistanceChanged', level: r.sint16('target resistance level') / 10, encoding: 'sint16' }
    case Op.TargetPowerChanged:
      return { kind: 'targetPowerChanged', watts: r.sint16('target power') }
    case Op.TargetHeartRateChanged:
      return { kind: 'targetHeartRateChanged', bpm: r.uint8('target heart rate') }
    case Op.SimulationChanged:
      return { kind: 'simulationChanged', ...readSimulation(r) }
    case Op.WheelCircumferenceChanged:
      return { kind: 'wheelCircumferenceChanged', mm: r.uint16('wheel circumference') / 10 }
    case Op.SpinDownStatus: {
      const value = r.uint8('spin down status')
      const status = SPIN_DOWN[value - 1]
      return status ? { kind: 'spinDown', status } : { kind: 'other', op, params: Uint8Array.of(value, ...r.rest()) }
    }
    case Op.TargetCadenceChanged:
      return { kind: 'targetCadenceChanged', rpm: r.uint16('targeted cadence') / 2 }
    case Op.ControlPermissionLost:
      return { kind: 'controlPermissionLost' }
    default:
      return { kind: 'other', op, params: r.rest() }
  }
}

/** Encodes a status notification (for the simulated trainer). Resistance defaults to the spec's uint8. */
export function encodeFtmsStatus(s: FtmsStatus): Uint8Array {
  const w = new ByteWriter()
  switch (s.kind) {
    case 'reset':
      return w.uint8(Op.Reset).toBytes()
    case 'stoppedByUser':
      return w.uint8(Op.StoppedOrPausedByUser).uint8(0x01).toBytes()
    case 'pausedByUser':
      return w.uint8(Op.StoppedOrPausedByUser).uint8(0x02).toBytes()
    case 'stoppedBySafetyKey':
      return w.uint8(Op.StoppedBySafetyKey).toBytes()
    case 'startedByUser':
      return w.uint8(Op.StartedByUser).toBytes()
    case 'targetSpeedChanged':
      return w.uint8(Op.TargetSpeedChanged).uint16(s.kmh * 100, 'kmh').toBytes()
    case 'targetInclinationChanged':
      return w.uint8(Op.TargetInclineChanged).sint16(s.pct * 10, 'pct').toBytes()
    case 'targetResistanceChanged':
      w.uint8(Op.TargetResistanceChanged)
      if (s.encoding === 'sint16') return w.sint16(s.level * 10, 'level').toBytes()
      return w.uint8(s.level * 10, 'level').toBytes()
    case 'targetPowerChanged':
      return w.uint8(Op.TargetPowerChanged).sint16(s.watts, 'watts').toBytes()
    case 'targetHeartRateChanged':
      return w.uint8(Op.TargetHeartRateChanged).uint8(s.bpm, 'bpm').toBytes()
    case 'simulationChanged':
      return writeSimulation(w.uint8(Op.SimulationChanged), s).toBytes()
    case 'wheelCircumferenceChanged':
      return w.uint8(Op.WheelCircumferenceChanged).uint16(s.mm * 10, 'mm').toBytes()
    case 'spinDown':
      return w.uint8(Op.SpinDownStatus).uint8(SPIN_DOWN.indexOf(s.status) + 1).toBytes()
    case 'targetCadenceChanged':
      return w.uint8(Op.TargetCadenceChanged).uint16(s.rpm * 2, 'rpm').toBytes()
    case 'controlPermissionLost':
      return w.uint8(Op.ControlPermissionLost).toBytes()
    case 'other':
      return w.uint8(s.op, 'op').raw(s.params ?? []).toBytes()
  }
}

/** Training Status values 0x00-0x0F (FTMS v1.0 Table 4.13); the index is the code. */
export const TRAINING_STATUS_LABELS = [
  'other',
  'idle',
  'warmUp',
  'lowIntensityInterval',
  'highIntensityInterval',
  'recoveryInterval',
  'isometric',
  'heartRateControl',
  'fitnessTest',
  'speedOutsideControlLow',
  'speedOutsideControlHigh',
  'coolDown',
  'wattControl',
  'manualMode',
  'preWorkout',
  'postWorkout',
] as const

/** A known label, or 'unknown' for the reserved codes 0x10-0xFF. */
export type TrainingStatusLabel = (typeof TRAINING_STATUS_LABELS)[number] | 'unknown'

export interface TrainingStatus {
  status: number
  label: TrainingStatusLabel
  /** Training Status String, when flags bit 0 is set. */
  text?: string
}

const STRING_PRESENT = 1 << 0

/**
 * Flags uint8, status uint8, then an optional UTF-8 string (flags bit 0).
 * Flags bit 1 (Extended String) means the string continues past this
 * notification and must be fetched with a long read; the part received is
 * returned as is.
 */
export function parseTrainingStatus(dv: DataView): TrainingStatus {
  const r = new ByteReader(dv, 'Training Status')
  const flags = r.uint8('flags')
  const status = r.uint8('training status')
  const out: TrainingStatus = { status, label: TRAINING_STATUS_LABELS[status] ?? 'unknown' }
  if (flags & STRING_PRESENT) out.text = new TextDecoder('utf-8').decode(r.rest())
  return out
}

export function encodeTrainingStatus(s: { status: number; text?: string }): Uint8Array {
  if (!Number.isInteger(s.status) || s.status < 0 || s.status > 0xff) {
    throw new CodecError(`Training Status: status ${s.status} is not a uint8`)
  }
  const w = new ByteWriter().uint8(s.text === undefined ? 0 : STRING_PRESENT).uint8(s.status)
  if (s.text !== undefined) w.raw(new TextEncoder().encode(s.text))
  return w.toBytes()
}
