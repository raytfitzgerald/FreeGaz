// Wahoo proprietary trainer control: characteristic
// a026e005-0a7d-4ab3-97fa-f1500f9feb8b inside the Cycling Power service. Wahoo
// never published it. Op codes and scalings are community knowledge,
// cross-checked against incyclist/devices (MIT) and
// kinetic-fit/sensors-swift-trainers (MIT). A fallback only: FTMS comes first.

import { ByteReader, ByteWriter } from './bytes'

export const WahooOp = {
  Unlock: 0x20,
  SetResistanceMode: 0x40,
  SetStandardMode: 0x41,
  SetErgMode: 0x42,
  InitSimMode: 0x43,
  SetSimCrr: 0x44,
  SetSimWindResistance: 0x45,
  SetSimGrade: 0x46,
  SetSimWindSpeed: 0x47,
  SetWheelCircumference: 0x48,
} as const

export type WahooCommand =
  | { op: 'unlock' }
  /** Brake level, 0 (none) to 1 (full). */
  | { op: 'resistance'; fraction: number }
  /** One of the trainer's preset levels. */
  | { op: 'standard'; level: number }
  | { op: 'erg'; watts: number }
  /** Enters SIM mode: rider + bike weight, rolling resistance, wind resistance (0.5·ρ·CdA). */
  | { op: 'simInit'; weightKg: number; crr: number; cwKgPerM: number }
  | { op: 'simCrr'; crr: number }
  | { op: 'simCw'; cwKgPerM: number }
  | { op: 'grade'; gradePct: number }
  /** Headwind positive, m/s. */
  | { op: 'wind'; mps: number }
  | { op: 'wheelCircumference'; mm: number }

const UNLOCK_CODE = [0xee, 0xfc] as const
/** 14-bit brake scale of SetResistanceMode, inverted: 0 is full brake. */
const RESISTANCE_SCALE = 16383
/** Grade and wind are offset so 0 % and 0 m/s sit mid-scale (0x8000). */
const GRADE_SCALE = 32768
const WIND_OFFSET_MPS = 32.768
/**
 * Crr scaling differs between implementations: incyclist (MIT) and
 * GoldenCheetah send crr × 10000 (0.004 → 40), while Kinetic's
 * SwiftySensorsTrainers (MIT) sends crr × 1000 (0.004 → 4). We follow the
 * ×10000 majority; ×1000 would also leave only about six counts across the
 * realistic 0.002-0.008 range. Cw is × 1000 in all three.
 */
const CRR_SCALE = 10000
const CW_SCALE = 1000

/**
 * Encodes a command. Values are rounded and clamped to each uint16 field:
 *   resistance  (1 − fraction) × 16383
 *   grade       (grade / 100 + 1) × 32768, so 0 % → 0x8000 and ±100 % saturates
 *   wind        (mps + 32.768) × 1000, so 0 m/s → 0x8000
 *   simInit     weight × 100, crr × 10000, cw × 1000
 *   wheel       mm × 10
 */
export function encodeWahooCommand(cmd: WahooCommand): Uint8Array {
  const w = new ByteWriter()
  switch (cmd.op) {
    case 'unlock':
      return w.uint8(WahooOp.Unlock).raw(UNLOCK_CODE).toBytes()
    case 'resistance': {
      const fraction = Math.min(1, Math.max(0, cmd.fraction))
      return w.uint8(WahooOp.SetResistanceMode).uint16((1 - fraction) * RESISTANCE_SCALE, 'fraction').toBytes()
    }
    case 'standard':
      return w.uint8(WahooOp.SetStandardMode).uint8(cmd.level, 'level').toBytes()
    case 'erg':
      return w.uint8(WahooOp.SetErgMode).uint16(cmd.watts, 'watts').toBytes()
    case 'simInit':
      return w
        .uint8(WahooOp.InitSimMode)
        .uint16(cmd.weightKg * 100, 'weightKg')
        .uint16(cmd.crr * CRR_SCALE, 'crr')
        .uint16(cmd.cwKgPerM * CW_SCALE, 'cwKgPerM')
        .toBytes()
    case 'simCrr':
      return w.uint8(WahooOp.SetSimCrr).uint16(cmd.crr * CRR_SCALE, 'crr').toBytes()
    case 'simCw':
      return w.uint8(WahooOp.SetSimWindResistance).uint16(cmd.cwKgPerM * CW_SCALE, 'cwKgPerM').toBytes()
    case 'grade':
      return w.uint8(WahooOp.SetSimGrade).uint16((cmd.gradePct / 100 + 1) * GRADE_SCALE, 'gradePct').toBytes()
    case 'wind':
      return w.uint8(WahooOp.SetSimWindSpeed).uint16((cmd.mps + WIND_OFFSET_MPS) * 1000, 'mps').toBytes()
    case 'wheelCircumference':
      return w.uint8(WahooOp.SetWheelCircumference).uint16(cmd.mm * 10, 'mm').toBytes()
  }
}

/** Decodes what a client wrote, for the simulated trainer. Null for unknown op codes or a wrong unlock code. */
export function decodeWahooCommand(dv: DataView): WahooCommand | null {
  const r = new ByteReader(dv, 'Wahoo trainer control')
  const op = r.uint8('op code')
  switch (op) {
    case WahooOp.Unlock: {
      const a = r.uint8('unlock code')
      const b = r.uint8('unlock code')
      return a === UNLOCK_CODE[0] && b === UNLOCK_CODE[1] ? { op: 'unlock' } : null
    }
    case WahooOp.SetResistanceMode:
      return { op: 'resistance', fraction: Math.max(0, 1 - r.uint16('resistance') / RESISTANCE_SCALE) }
    case WahooOp.SetStandardMode:
      return { op: 'standard', level: r.uint8('level') }
    case WahooOp.SetErgMode:
      return { op: 'erg', watts: r.uint16('watts') }
    case WahooOp.InitSimMode:
      return {
        op: 'simInit',
        weightKg: r.uint16('weight') / 100,
        crr: r.uint16('crr') / CRR_SCALE,
        cwKgPerM: r.uint16('wind resistance') / CW_SCALE,
      }
    case WahooOp.SetSimCrr:
      return { op: 'simCrr', crr: r.uint16('crr') / CRR_SCALE }
    case WahooOp.SetSimWindResistance:
      return { op: 'simCw', cwKgPerM: r.uint16('wind resistance') / CW_SCALE }
    case WahooOp.SetSimGrade:
      return { op: 'grade', gradePct: (r.uint16('grade') / GRADE_SCALE - 1) * 100 }
    case WahooOp.SetSimWindSpeed:
      return { op: 'wind', mps: r.uint16('wind speed') / 1000 - WIND_OFFSET_MPS }
    case WahooOp.SetWheelCircumference:
      return { op: 'wheelCircumference', mm: r.uint16('wheel circumference') / 10 }
    default:
      return null
  }
}

export interface WahooResponse {
  ok: boolean
  /** The op code being answered. */
  op: number
}

const KNOWN_OPS: ReadonlySet<number> = new Set(Object.values(WahooOp))
const STATUS_OK = 0x01
/** The failure status is undocumented; any status other than 0x01 is treated as failure, and the simulator sends 0x02. */
const STATUS_FAILED = 0x02

/** A response notification: [status, echoed op code, ...]. Null when byte 1 is not a known op code. */
export function parseWahooResponse(dv: DataView): WahooResponse | null {
  const r = new ByteReader(dv, 'Wahoo trainer response')
  const status = r.uint8('status')
  const op = r.uint8('op code')
  return KNOWN_OPS.has(op) ? { ok: status === STATUS_OK, op } : null
}

export function encodeWahooResponse(op: number, ok = true): Uint8Array {
  return new ByteWriter().uint8(ok ? STATUS_OK : STATUS_FAILED).uint8(op, 'op').toBytes()
}
