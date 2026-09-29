import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CodecError, fromHex, toDataView, toHex } from './bytes'
import {
  encodeFtmsStatus,
  encodeTrainingStatus,
  parseFtmsStatus,
  parseTrainingStatus,
  TRAINING_STATUS_LABELS,
  type FtmsStatus,
} from './ftms-status'

const FC = { seed: 20260929, numRuns: 500 }
const status = (hex: string) => parseFtmsStatus(fromHex(hex))

describe('parseFtmsStatus golden vectors', () => {
  it('parameterless events', () => {
    expect(status('01')).toEqual({ kind: 'reset' })
    expect(status('03')).toEqual({ kind: 'stoppedBySafetyKey' })
    expect(status('04')).toEqual({ kind: 'startedByUser' })
    expect(status('ff')).toEqual({ kind: 'controlPermissionLost' })
  })

  it('stopped or paused by the user (0x02 + control information)', () => {
    expect(status('02 01')).toEqual({ kind: 'stoppedByUser' })
    expect(status('02 02')).toEqual({ kind: 'pausedByUser' })
    expect(status('02 07')).toEqual({ kind: 'other', op: 0x02, params: Uint8Array.of(7) })
  })

  it('target changes', () => {
    expect(status('05 c4 09')).toEqual({ kind: 'targetSpeedChanged', kmh: 25 }) // 0x09C4 = 2500 × 0.01
    expect(status('06 e7 ff')).toEqual({ kind: 'targetInclinationChanged', pct: -2.5 }) // 0xFFE7 = -25 × 0.1
    expect(status('08 c8 00')).toEqual({ kind: 'targetPowerChanged', watts: 200 })
    expect(status('08 38 ff')).toEqual({ kind: 'targetPowerChanged', watts: -200 }) // sint16
    expect(status('09 96')).toEqual({ kind: 'targetHeartRateChanged', bpm: 150 })
    expect(status('13 3a 52')).toEqual({ kind: 'wheelCircumferenceChanged', mm: 2105 }) // 0x523A = 21050 × 0.1
    expect(status('15 b4 00')).toEqual({ kind: 'targetCadenceChanged', rpm: 90 }) // 180 × 0.5
  })

  it('target resistance: uint8 per spec, sint16 accepted when 2 parameter bytes arrive', () => {
    expect(status('07 7b')).toEqual({ kind: 'targetResistanceChanged', level: 12.3, encoding: 'uint8' }) // 123 × 0.1
    expect(status('07 7b 00')).toEqual({ kind: 'targetResistanceChanged', level: 12.3, encoding: 'sint16' })
    expect(status('07 38 ff')).toEqual({ kind: 'targetResistanceChanged', level: -20, encoding: 'sint16' }) // -200 × 0.1
  })

  it('simulation parameters use the control point encoding', () => {
    // 12 | 00 00 wind 0 | 0d 02 grade 525 → 5.25 % | 28 crr 40 → 0.004 | 33 cw 51 → 0.51 kg/m
    expect(status('12 00 00 0d 02 28 33')).toEqual({ kind: 'simulationChanged', windMps: 0, gradePct: 5.25, crr: 0.004, cwKgPerM: 0.51 })
  })

  it('spin down status 1-4', () => {
    expect(status('14 01')).toEqual({ kind: 'spinDown', status: 'requested' })
    expect(status('14 02')).toEqual({ kind: 'spinDown', status: 'success' })
    expect(status('14 03')).toEqual({ kind: 'spinDown', status: 'error' })
    expect(status('14 04')).toEqual({ kind: 'spinDown', status: 'stopPedaling' })
    expect(status('14 00')).toEqual({ kind: 'other', op: 0x14, params: Uint8Array.of(0) })
    expect(status('14 05')).toEqual({ kind: 'other', op: 0x14, params: Uint8Array.of(5) })
  })

  it('everything else is "other" with its raw parameters', () => {
    expect(status('0a 64 00')).toEqual({ kind: 'other', op: 0x0a, params: Uint8Array.of(0x64, 0x00) }) // targeted energy
    expect(status('00')).toEqual({ kind: 'other', op: 0x00, params: new Uint8Array() })
    expect(status('fe 01')).toEqual({ kind: 'other', op: 0xfe, params: Uint8Array.of(1) })
  })

  it('throws when a parameter is missing or short', () => {
    for (const hex of ['', '02', '05 c4', '06', '07', '08 c8', '09', '12 00 00 0d 02 28', '13 3a', '14', '15 b4']) {
      expect(() => status(hex)).toThrow(CodecError)
    }
  })
})

describe('encodeFtmsStatus', () => {
  it('encodes every kind', () => {
    const cases: [FtmsStatus, string][] = [
      [{ kind: 'reset' }, '01'],
      [{ kind: 'stoppedByUser' }, '02 01'],
      [{ kind: 'pausedByUser' }, '02 02'],
      [{ kind: 'stoppedBySafetyKey' }, '03'],
      [{ kind: 'startedByUser' }, '04'],
      [{ kind: 'targetSpeedChanged', kmh: 25 }, '05 c4 09'],
      [{ kind: 'targetInclinationChanged', pct: -2.5 }, '06 e7 ff'],
      [{ kind: 'targetResistanceChanged', level: 12.3 }, '07 7b'], // spec default: uint8
      [{ kind: 'targetResistanceChanged', level: 12.3, encoding: 'sint16' }, '07 7b 00'],
      [{ kind: 'targetPowerChanged', watts: 200 }, '08 c8 00'],
      [{ kind: 'targetHeartRateChanged', bpm: 150 }, '09 96'],
      [{ kind: 'simulationChanged', windMps: 0, gradePct: 5.25, crr: 0.004, cwKgPerM: 0.51 }, '12 00 00 0d 02 28 33'],
      [{ kind: 'wheelCircumferenceChanged', mm: 2105 }, '13 3a 52'],
      [{ kind: 'spinDown', status: 'stopPedaling' }, '14 04'],
      [{ kind: 'targetCadenceChanged', rpm: 90 }, '15 b4 00'],
      [{ kind: 'controlPermissionLost' }, 'ff'],
      [{ kind: 'other', op: 0x0a, params: Uint8Array.of(0x64, 0) }, '0a 64 00'],
      [{ kind: 'other', op: 0x16 }, '16'],
    ]
    for (const [s, hex] of cases) expect(toHex(encodeFtmsStatus(s))).toBe(hex)
  })

  it('parse(encode(s)) is the identity for any valid status', () => {
    const i16 = (scale: number) => fc.integer({ min: -0x8000, max: 0x7fff }).map((v) => v / scale)
    const u16 = (scale: number) => fc.integer({ min: 0, max: 0xffff }).map((v) => v / scale)
    const u8 = (scale: number) => fc.integer({ min: 0, max: 0xff }).map((v) => v / scale)
    const arb: fc.Arbitrary<FtmsStatus> = fc.oneof(
      fc.constantFrom<FtmsStatus>(
        { kind: 'reset' },
        { kind: 'stoppedByUser' },
        { kind: 'pausedByUser' },
        { kind: 'stoppedBySafetyKey' },
        { kind: 'startedByUser' },
        { kind: 'controlPermissionLost' },
        { kind: 'spinDown', status: 'requested' },
        { kind: 'spinDown', status: 'success' },
        { kind: 'spinDown', status: 'error' },
        { kind: 'spinDown', status: 'stopPedaling' },
      ),
      u16(100).map((kmh) => ({ kind: 'targetSpeedChanged' as const, kmh })),
      i16(10).map((pct) => ({ kind: 'targetInclinationChanged' as const, pct })),
      u8(10).map((level) => ({ kind: 'targetResistanceChanged' as const, level, encoding: 'uint8' as const })),
      i16(10).map((level) => ({ kind: 'targetResistanceChanged' as const, level, encoding: 'sint16' as const })),
      i16(1).map((watts) => ({ kind: 'targetPowerChanged' as const, watts })),
      u8(1).map((bpm) => ({ kind: 'targetHeartRateChanged' as const, bpm })),
      fc
        .record({ windMps: i16(1000), gradePct: i16(100), crr: u8(10000), cwKgPerM: u8(100) })
        .map((p) => ({ kind: 'simulationChanged' as const, ...p })),
      u16(10).map((mm) => ({ kind: 'wheelCircumferenceChanged' as const, mm })),
      u16(2).map((rpm) => ({ kind: 'targetCadenceChanged' as const, rpm })),
      fc
        .record({ op: fc.integer({ min: 0x0a, max: 0x11 }), params: fc.uint8Array({ maxLength: 8 }) })
        .map((o) => ({ kind: 'other' as const, ...o })),
    )
    fc.assert(
      fc.property(arb, (s) => {
        expect(parseFtmsStatus(toDataView(encodeFtmsStatus(s)))).toEqual(s)
      }),
      FC,
    )
  })
})

describe('Training Status', () => {
  const training = (hex: string) => parseTrainingStatus(fromHex(hex))

  it('labels all 16 defined codes in spec order', () => {
    expect(TRAINING_STATUS_LABELS).toEqual([
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
    ])
  })

  it('parses flags + status without a string', () => {
    expect(training('00 01')).toEqual({ status: 1, label: 'idle' })
    expect(training('00 0c')).toEqual({ status: 12, label: 'wattControl' })
    expect(training('00 10')).toEqual({ status: 16, label: 'unknown' }) // 0x10-0xFF reserved
  })

  it('parses the optional UTF-8 string (flags bit 0)', () => {
    // 01 string present | 0d manual mode | "Quick"
    expect(training('01 0d 51 75 69 63 6b')).toEqual({ status: 13, label: 'manualMode', text: 'Quick' })
    // "étape": é is the two-byte sequence c3 a9
    expect(training('01 03 c3 a9 74 61 70 65')).toEqual({ status: 3, label: 'lowIntensityInterval', text: 'étape' })
    // bit 1 (Extended String) set too: the partial string is returned as is
    expect(training('03 0b 43 6f 6f 6c')).toEqual({ status: 11, label: 'coolDown', text: 'Cool' })
    expect(training('01 0f')).toEqual({ status: 15, label: 'postWorkout', text: '' })
  })

  it('throws when truncated', () => {
    expect(() => training('00')).toThrow(CodecError)
    expect(() => training('')).toThrow(CodecError)
  })

  it('encodes', () => {
    expect(toHex(encodeTrainingStatus({ status: 13, text: 'Quick' }))).toBe('01 0d 51 75 69 63 6b')
    expect(toHex(encodeTrainingStatus({ status: 1 }))).toBe('00 01')
    expect(() => encodeTrainingStatus({ status: 300 })).toThrow(CodecError)
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), fc.option(fc.string(), { nil: undefined }), (code, text) => {
        const back = parseTrainingStatus(toDataView(encodeTrainingStatus({ status: code, text })))
        expect(back.status).toBe(code)
        expect(back.text).toBe(text)
      }),
      FC,
    )
  })
})
