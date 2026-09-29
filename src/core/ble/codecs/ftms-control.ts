// FTMS Fitness Machine Control Point (0x2AD9): FTMS v1.0 §4.16. The client
// writes an op code plus parameters; the machine indicates [0x80, request op
// code, result code, response parameters...].

import { ByteReader, ByteWriter } from './bytes'
import { type ResistanceEncoding } from './ftms-features'
import { readSimulation, writeSimulation } from './ftms-simulation'

export const FtmsOp = {
  RequestControl: 0x00,
  Reset: 0x01,
  SetTargetSpeed: 0x02,
  SetTargetInclination: 0x03,
  SetTargetResistance: 0x04,
  SetTargetPower: 0x05,
  SetTargetHeartRate: 0x06,
  StartResume: 0x07,
  StopPause: 0x08,
  SetIndoorBikeSimulation: 0x11,
  SetWheelCircumference: 0x12,
  SpinDownControl: 0x13,
  SetTargetCadence: 0x14,
  Response: 0x80,
} as const

export const FtmsResult = {
  Success: 1,
  NotSupported: 2,
  InvalidParameter: 3,
  OperationFailed: 4,
  ControlNotPermitted: 5,
} as const

/** Stop or Pause control information (FTMS v1.0 Table 4.16). */
const STOP = 0x01
const PAUSE = 0x02
/** Spin Down Control parameter (FTMS v1.0 Table 4.21). */
const SPIN_DOWN_START = 0x01
const SPIN_DOWN_IGNORE = 0x02

export type FtmsCommand =
  | { op: 'requestControl' }
  | { op: 'reset' }
  | { op: 'start' }
  | { op: 'stop' }
  | { op: 'pause' }
  | { op: 'targetPower'; watts: number }
  /** `level` is in device units, resolution 0.1. `encoding` defaults to sint16 (see encodeFtmsCommand). */
  | { op: 'targetResistance'; level: number; encoding?: ResistanceEncoding }
  | { op: 'simulation'; windMps: number; gradePct: number; crr: number; cwKgPerM: number }
  | { op: 'wheelCircumference'; mm: number }
  /** start true = "Start", false = "Ignore" (skip a spin down the trainer asked for). */
  | { op: 'spinDown'; start: boolean }
  | { op: 'targetCadence'; rpm: number }

/**
 * Encodes a command for the control point. Every value is rounded to its
 * field's resolution and clamped to the field's range:
 *   targetPower       sint16 W
 *   targetResistance  level × 10 as sint16 (default) or uint8. FTMS v1.0 says
 *                     uint8, but trainers such as the KICKR take sint16 and
 *                     incyclist sends sint16; uint8 caps the level at 25.5
 *   simulation        wind sint16 (0.001 m/s), grade sint16 (0.01 %),
 *                     crr uint8 (0.0001), cw uint8 (0.01 kg/m)
 *   wheelCircumference uint16 (0.1 mm)
 *   targetCadence     uint16 (0.5 rpm)
 */
export function encodeFtmsCommand(cmd: FtmsCommand): Uint8Array {
  const w = new ByteWriter()
  switch (cmd.op) {
    case 'requestControl':
      return w.uint8(FtmsOp.RequestControl).toBytes()
    case 'reset':
      return w.uint8(FtmsOp.Reset).toBytes()
    case 'start':
      return w.uint8(FtmsOp.StartResume).toBytes()
    case 'stop':
      return w.uint8(FtmsOp.StopPause).uint8(STOP).toBytes()
    case 'pause':
      return w.uint8(FtmsOp.StopPause).uint8(PAUSE).toBytes()
    case 'targetPower':
      return w.uint8(FtmsOp.SetTargetPower).sint16(cmd.watts, 'watts').toBytes()
    case 'targetResistance':
      w.uint8(FtmsOp.SetTargetResistance)
      if (cmd.encoding === 'uint8') return w.uint8(cmd.level * 10, 'level').toBytes()
      return w.sint16(cmd.level * 10, 'level').toBytes()
    case 'simulation':
      return writeSimulation(w.uint8(FtmsOp.SetIndoorBikeSimulation), cmd).toBytes()
    case 'wheelCircumference':
      return w.uint8(FtmsOp.SetWheelCircumference).uint16(cmd.mm * 10, 'mm').toBytes()
    case 'spinDown':
      return w.uint8(FtmsOp.SpinDownControl).uint8(cmd.start ? SPIN_DOWN_START : SPIN_DOWN_IGNORE).toBytes()
    case 'targetCadence':
      return w.uint8(FtmsOp.SetTargetCadence).uint16(cmd.rpm * 2, 'rpm').toBytes()
  }
}

/**
 * Decodes what a client wrote, for the simulated trainer. Returns null for op
 * codes this app never sends (speed, inclination, heart rate, targeted
 * energy/steps/...) and for parameter values the spec reserves; throws
 * CodecError when a known op code is missing parameter bytes. A Set Target
 * Resistance Level with a 1-byte parameter decodes as uint8, 2 bytes as sint16.
 */
export function decodeFtmsCommand(dv: DataView): FtmsCommand | null {
  const r = new ByteReader(dv, 'Fitness Machine Control Point')
  const op = r.uint8('op code')
  switch (op) {
    case FtmsOp.RequestControl:
      return { op: 'requestControl' }
    case FtmsOp.Reset:
      return { op: 'reset' }
    case FtmsOp.StartResume:
      return { op: 'start' }
    case FtmsOp.StopPause: {
      const info = r.uint8('control information')
      if (info === STOP) return { op: 'stop' }
      if (info === PAUSE) return { op: 'pause' }
      return null
    }
    case FtmsOp.SetTargetPower:
      return { op: 'targetPower', watts: r.sint16('target power') }
    case FtmsOp.SetTargetResistance:
      if (r.remaining === 1) return { op: 'targetResistance', level: r.uint8('target resistance level') / 10, encoding: 'uint8' }
      return { op: 'targetResistance', level: r.sint16('target resistance level') / 10, encoding: 'sint16' }
    case FtmsOp.SetIndoorBikeSimulation:
      return { op: 'simulation', ...readSimulation(r) }
    case FtmsOp.SetWheelCircumference:
      return { op: 'wheelCircumference', mm: r.uint16('wheel circumference') / 10 }
    case FtmsOp.SpinDownControl: {
      const control = r.uint8('spin down control')
      if (control === SPIN_DOWN_START) return { op: 'spinDown', start: true }
      if (control === SPIN_DOWN_IGNORE) return { op: 'spinDown', start: false }
      return null
    }
    case FtmsOp.SetTargetCadence:
      return { op: 'targetCadence', rpm: r.uint16('targeted cadence') / 2 }
    default:
      return null
  }
}

/** A control point indication: [0x80, request op code, result code, parameters...]. */
export interface FtmsResponse {
  requestOp: number
  /** One of FtmsResult (0x06-0xFF are reserved). */
  result: number
  /** Response parameters, e.g. the spin down target speeds after a successful Spin Down Control. */
  params: Uint8Array
}

/** Returns null when the value is not a response (byte 0 is not 0x80). */
export function parseFtmsResponse(dv: DataView): FtmsResponse | null {
  const r = new ByteReader(dv, 'Fitness Machine Control Point response')
  if (r.uint8('response op code') !== FtmsOp.Response) return null
  return { requestOp: r.uint8('request op code'), result: r.uint8('result code'), params: r.rest() }
}

export function encodeFtmsResponse(requestOp: number, result: number, params: ArrayLike<number> = []): Uint8Array {
  return new ByteWriter()
    .uint8(FtmsOp.Response)
    .uint8(requestOp, 'requestOp')
    .uint8(result, 'result')
    .raw(params)
    .toBytes()
}
