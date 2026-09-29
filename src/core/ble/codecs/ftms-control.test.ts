import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CodecError, fromHex, toDataView, toHex } from './bytes'
import {
  decodeFtmsCommand,
  encodeFtmsCommand,
  encodeFtmsResponse,
  FtmsOp,
  FtmsResult,
  parseFtmsResponse,
  type FtmsCommand,
} from './ftms-control'

const FC = { seed: 20260929, numRuns: 500 }
const enc = (cmd: FtmsCommand) => toHex(encodeFtmsCommand(cmd))
const dec = (hex: string) => decodeFtmsCommand(fromHex(hex))

describe('encodeFtmsCommand golden vectors', () => {
  it('commands without parameters', () => {
    expect(enc({ op: 'requestControl' })).toBe('00')
    expect(enc({ op: 'reset' })).toBe('01')
    expect(enc({ op: 'start' })).toBe('07')
  })

  it('stop and pause share op 0x08 with control information 1 / 2', () => {
    expect(enc({ op: 'stop' })).toBe('08 01')
    expect(enc({ op: 'pause' })).toBe('08 02')
  })

  it('target power: sint16 W, rounded and clamped', () => {
    expect(enc({ op: 'targetPower', watts: 250 })).toBe('05 fa 00') // 0x00FA
    expect(enc({ op: 'targetPower', watts: 199.6 })).toBe('05 c8 00') // rounds to 200
    expect(enc({ op: 'targetPower', watts: 40000 })).toBe('05 ff 7f') // clamps to 32767
    expect(enc({ op: 'targetPower', watts: -40000 })).toBe('05 00 80') // clamps to -32768
  })

  it('target resistance: level × 10, sint16 by default or uint8', () => {
    expect(enc({ op: 'targetResistance', level: 12.3 })).toBe('04 7b 00') // 123 = 0x007B
    expect(enc({ op: 'targetResistance', level: 12.3, encoding: 'sint16' })).toBe('04 7b 00')
    expect(enc({ op: 'targetResistance', level: 12.3, encoding: 'uint8' })).toBe('04 7b')
    expect(enc({ op: 'targetResistance', level: 30, encoding: 'uint8' })).toBe('04 ff') // 300 clamps to 255
    expect(enc({ op: 'targetResistance', level: -2 })).toBe('04 ec ff') // -20 = 0xFFEC
  })

  it('indoor bike simulation, grade 5.25 %', () => {
    expect(enc({ op: 'simulation', windMps: 0, gradePct: 5.25, crr: 0.004, cwKgPerM: 0.51 })).toBe(
      '11 ' + //    op 0x11
        '00 00 ' + // wind 0 m/s × 1000 = 0
        '0d 02 ' + // grade 5.25 % × 100 = 525 = 0x020D
        '28 ' + //    crr 0.004 × 10000 = 40 = 0x28
        '33', //      cw 0.51 kg/m × 100 = 51 = 0x33
    )
  })

  it('indoor bike simulation with negative wind and grade', () => {
    // wind -2.5 × 1000 = -2500 = 0xF63C | grade -3.5 × 100 = -350 = 0xFEA2 | crr 33 = 0x21 | cw 60 = 0x3C
    expect(enc({ op: 'simulation', windMps: -2.5, gradePct: -3.5, crr: 0.0033, cwKgPerM: 0.6 })).toBe('11 3c f6 a2 fe 21 3c')
  })

  it('indoor bike simulation clamps every field to its type', () => {
    expect(enc({ op: 'simulation', windMps: 50, gradePct: 400, crr: 0.03, cwKgPerM: 3 })).toBe('11 ff 7f ff 7f ff ff')
    expect(enc({ op: 'simulation', windMps: -40, gradePct: -400, crr: -1, cwKgPerM: -1 })).toBe('11 00 80 00 80 00 00')
  })

  it('wheel circumference: uint16, 0.1 mm', () => {
    expect(enc({ op: 'wheelCircumference', mm: 2105 })).toBe('12 3a 52') // 21050 = 0x523A
    expect(enc({ op: 'wheelCircumference', mm: 2096.4 })).toBe('12 e4 51') // 20964 = 0x51E4
  })

  it('spin down control: 1 = start, 2 = ignore', () => {
    expect(enc({ op: 'spinDown', start: true })).toBe('13 01')
    expect(enc({ op: 'spinDown', start: false })).toBe('13 02')
  })

  it('targeted cadence: uint16, 0.5 rpm', () => {
    expect(enc({ op: 'targetCadence', rpm: 90 })).toBe('14 b4 00') // 180 = 0xB4
    expect(enc({ op: 'targetCadence', rpm: 92.3 })).toBe('14 b9 00') // 184.6 → 185 = 0xB9
  })

  it('refuses non-finite parameters', () => {
    expect(() => encodeFtmsCommand({ op: 'targetPower', watts: Number.NaN })).toThrow(CodecError)
    expect(() => encodeFtmsCommand({ op: 'simulation', windMps: 0, gradePct: Infinity, crr: 0.004, cwKgPerM: 0.5 })).toThrow(
      CodecError,
    )
  })
})

describe('decodeFtmsCommand', () => {
  it('decodes every command the app sends', () => {
    expect(dec('00')).toEqual({ op: 'requestControl' })
    expect(dec('01')).toEqual({ op: 'reset' })
    expect(dec('07')).toEqual({ op: 'start' })
    expect(dec('08 01')).toEqual({ op: 'stop' })
    expect(dec('08 02')).toEqual({ op: 'pause' })
    expect(dec('05 fa 00')).toEqual({ op: 'targetPower', watts: 250 })
    expect(dec('05 38 ff')).toEqual({ op: 'targetPower', watts: -200 })
    expect(dec('11 00 00 0d 02 28 33')).toEqual({ op: 'simulation', windMps: 0, gradePct: 5.25, crr: 0.004, cwKgPerM: 0.51 })
    expect(dec('11 3c f6 a2 fe 21 3c')).toEqual({ op: 'simulation', windMps: -2.5, gradePct: -3.5, crr: 0.0033, cwKgPerM: 0.6 })
    expect(dec('12 3a 52')).toEqual({ op: 'wheelCircumference', mm: 2105 })
    expect(dec('13 01')).toEqual({ op: 'spinDown', start: true })
    expect(dec('13 02')).toEqual({ op: 'spinDown', start: false })
    expect(dec('14 b4 00')).toEqual({ op: 'targetCadence', rpm: 90 })
  })

  it('picks the resistance encoding from the parameter length', () => {
    expect(dec('04 7b')).toEqual({ op: 'targetResistance', level: 12.3, encoding: 'uint8' })
    expect(dec('04 7b 00')).toEqual({ op: 'targetResistance', level: 12.3, encoding: 'sint16' })
    expect(dec('04 ec ff')).toEqual({ op: 'targetResistance', level: -2, encoding: 'sint16' })
  })

  it('returns null for op codes the app never sends and for reserved parameters', () => {
    expect(dec('02 e8 03')).toBeNull() // Set Target Speed
    expect(dec('03 32 00')).toBeNull() // Set Target Inclination
    expect(dec('06 8c')).toBeNull() // Set Target Heart Rate
    expect(dec('80 05 01')).toBeNull() // a response, not a command
    expect(dec('08 03')).toBeNull() // Stop/Pause with a reserved control value
    expect(dec('13 00')).toBeNull() // Spin Down with a reserved control value
  })

  it('throws when a known op code is missing parameter bytes', () => {
    for (const hex of ['', '05 fa', '04', '08', '11 00 00 0d 02 28', '12 3a', '13', '14 b4']) {
      expect(() => dec(hex)).toThrow(CodecError)
    }
  })
})

// Generators build values from raw wire integers, so the round trip is exact.
const i16 = (scale: number) => fc.integer({ min: -0x8000, max: 0x7fff }).map((v) => v / scale)
const u16 = (scale: number) => fc.integer({ min: 0, max: 0xffff }).map((v) => v / scale)
const u8 = (scale: number) => fc.integer({ min: 0, max: 0xff }).map((v) => v / scale)

const command: fc.Arbitrary<FtmsCommand> = fc.oneof(
  fc.constantFrom<FtmsCommand>({ op: 'requestControl' }, { op: 'reset' }, { op: 'start' }, { op: 'stop' }, { op: 'pause' }),
  i16(1).map((watts) => ({ op: 'targetPower' as const, watts })),
  i16(10).map((level) => ({ op: 'targetResistance' as const, level, encoding: 'sint16' as const })),
  u8(10).map((level) => ({ op: 'targetResistance' as const, level, encoding: 'uint8' as const })),
  fc
    .record({ windMps: i16(1000), gradePct: i16(100), crr: u8(10000), cwKgPerM: u8(100) })
    .map((p) => ({ op: 'simulation' as const, ...p })),
  u16(10).map((mm) => ({ op: 'wheelCircumference' as const, mm })),
  fc.boolean().map((start) => ({ op: 'spinDown' as const, start })),
  u16(2).map((rpm) => ({ op: 'targetCadence' as const, rpm })),
)

describe('FTMS command properties', () => {
  it('decode(encode(cmd)) is the identity for any valid command', () => {
    fc.assert(
      fc.property(command, (cmd) => {
        expect(decodeFtmsCommand(toDataView(encodeFtmsCommand(cmd)))).toEqual(cmd)
      }),
      FC,
    )
  })

  it('defaults the resistance encoding to sint16', () => {
    fc.assert(
      fc.property(i16(10), (level) => {
        expect(decodeFtmsCommand(toDataView(encodeFtmsCommand({ op: 'targetResistance', level })))).toEqual({
          op: 'targetResistance',
          level,
          encoding: 'sint16',
        })
      }),
      FC,
    )
  })

  it('simulation parameters survive within half a resolution step', () => {
    const dbl = (min: number, max: number) => fc.double({ min, max, noNaN: true })
    fc.assert(
      fc.property(dbl(-32, 32), dbl(-300, 300), dbl(0, 0.025), dbl(0, 2.5), (windMps, gradePct, crr, cwKgPerM) => {
        const back = decodeFtmsCommand(toDataView(encodeFtmsCommand({ op: 'simulation', windMps, gradePct, crr, cwKgPerM })))
        if (back?.op !== 'simulation') throw new Error('expected a simulation command')
        expect(Math.abs(back.windMps - windMps)).toBeLessThanOrEqual(0.0005 + 1e-9)
        expect(Math.abs(back.gradePct - gradePct)).toBeLessThanOrEqual(0.005 + 1e-9)
        expect(Math.abs(back.crr - crr)).toBeLessThanOrEqual(0.00005 + 1e-9)
        expect(Math.abs(back.cwKgPerM - cwKgPerM)).toBeLessThanOrEqual(0.005 + 1e-9)
      }),
      FC,
    )
  })
})

describe('control point response', () => {
  it('parses [0x80, request op, result]', () => {
    expect(parseFtmsResponse(fromHex('80 05 01'))).toEqual({ requestOp: FtmsOp.SetTargetPower, result: FtmsResult.Success, params: new Uint8Array() })
    expect(parseFtmsResponse(fromHex('80 11 05'))).toEqual({
      requestOp: FtmsOp.SetIndoorBikeSimulation,
      result: FtmsResult.ControlNotPermitted,
      params: new Uint8Array(),
    })
  })

  it('returns response parameters, e.g. the spin down target speeds', () => {
    // 80 | 13 Spin Down Control | 01 success | e8 03 target speed low 1000 → 10.00 km/h | d0 07 high 2000 → 20.00 km/h
    const res = parseFtmsResponse(fromHex('80 13 01 e8 03 d0 07'))
    expect(res?.requestOp).toBe(FtmsOp.SpinDownControl)
    expect(Array.from(res?.params ?? [])).toEqual([0xe8, 0x03, 0xd0, 0x07])
    const params = toDataView(res?.params ?? new Uint8Array())
    expect([params.getUint16(0, true) / 100, params.getUint16(2, true) / 100]).toEqual([10, 20])
  })

  it('returns null for anything that is not a response', () => {
    expect(parseFtmsResponse(fromHex('05 fa 00'))).toBeNull()
    expect(parseFtmsResponse(fromHex('00'))).toBeNull()
  })

  it('throws when a response is truncated', () => {
    expect(() => parseFtmsResponse(fromHex('80 05'))).toThrow(CodecError)
    expect(() => parseFtmsResponse(fromHex('80'))).toThrow(CodecError)
    expect(() => parseFtmsResponse(fromHex(''))).toThrow(CodecError)
  })

  it('encodes responses for the simulator', () => {
    expect(toHex(encodeFtmsResponse(FtmsOp.SetTargetPower, FtmsResult.Success))).toBe('80 05 01')
    expect(toHex(encodeFtmsResponse(FtmsOp.SpinDownControl, FtmsResult.Success, [0xe8, 0x03, 0xd0, 0x07]))).toBe(
      '80 13 01 e8 03 d0 07',
    )
    expect(toHex(encodeFtmsResponse(FtmsOp.RequestControl, FtmsResult.ControlNotPermitted))).toBe('80 00 05')
  })

  it('exposes the spec op and result codes', () => {
    expect(FtmsOp).toMatchObject({ SetIndoorBikeSimulation: 0x11, SetTargetCadence: 0x14, Response: 0x80 })
    expect(Object.values(FtmsResult)).toEqual([1, 2, 3, 4, 5])
  })
})
