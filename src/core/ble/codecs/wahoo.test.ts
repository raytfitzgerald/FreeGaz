import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CodecError, fromHex, toDataView, toHex } from './bytes'
import {
  decodeWahooCommand,
  encodeWahooCommand,
  encodeWahooResponse,
  parseWahooResponse,
  WahooOp,
  type WahooCommand,
} from './wahoo'

const FC = { seed: 20260929, numRuns: 500 }
const enc = (cmd: WahooCommand) => toHex(encodeWahooCommand(cmd))
const dec = (hex: string) => decodeWahooCommand(fromHex(hex))

describe('encodeWahooCommand golden vectors', () => {
  it('unlock', () => {
    expect(enc({ op: 'unlock' })).toBe('20 ee fc')
  })

  it('resistance mode: (1 − fraction) × 16383', () => {
    expect(enc({ op: 'resistance', fraction: 0 })).toBe('40 ff 3f') // 16383 = 0x3FFF
    expect(enc({ op: 'resistance', fraction: 0.25 })).toBe('40 ff 2f') // 12287.25 → 12287 = 0x2FFF
    expect(enc({ op: 'resistance', fraction: 0.5 })).toBe('40 00 20') // 8191.5 → 8192 = 0x2000
    expect(enc({ op: 'resistance', fraction: 1 })).toBe('40 00 00')
    expect(enc({ op: 'resistance', fraction: 1.5 })).toBe('40 00 00') // clamped to 1
    expect(enc({ op: 'resistance', fraction: -0.5 })).toBe('40 ff 3f') // clamped to 0
  })

  it('standard mode level and ERG watts', () => {
    expect(enc({ op: 'standard', level: 3 })).toBe('41 03')
    expect(enc({ op: 'erg', watts: 200 })).toBe('42 c8 00')
    expect(enc({ op: 'erg', watts: 1234.4 })).toBe('42 d2 04') // 1234 = 0x04D2
    expect(enc({ op: 'erg', watts: -5 })).toBe('42 00 00')
  })

  it('SIM init: weight × 100, crr × 10000, cw × 1000', () => {
    expect(enc({ op: 'simInit', weightKg: 85, crr: 0.004, cwKgPerM: 0.51 })).toBe(
      '43 ' + //    op 0x43
        '34 21 ' + // weight 85 kg × 100 = 8500 = 0x2134
        '28 00 ' + // crr 0.004 × 10000 = 40 = 0x0028 (×10000, not ×1000: see CRR_SCALE)
        'fe 01', //   cw 0.51 kg/m × 1000 = 510 = 0x01FE
    )
    expect(enc({ op: 'simCrr', crr: 0.0045 })).toBe('44 2d 00') // 45
    expect(enc({ op: 'simCw', cwKgPerM: 0.6 })).toBe('45 58 02') // 600 = 0x0258
  })

  it('grade: (grade / 100 + 1) × 32768', () => {
    expect(enc({ op: 'grade', gradePct: 0 })).toBe('46 00 80') // 32768 = 0x8000
    expect(enc({ op: 'grade', gradePct: -10 })).toBe('46 33 73') // 0.9 × 32768 = 29491.2 → 29491 = 0x7333
    expect(enc({ op: 'grade', gradePct: 10 })).toBe('46 cd 8c') // 1.1 × 32768 = 36044.8 → 36045 = 0x8CCD
    expect(enc({ op: 'grade', gradePct: 5.25 })).toBe('46 b8 86') // 1.0525 × 32768 = 34488.32 → 34488 = 0x86B8
    expect(enc({ op: 'grade', gradePct: 100 })).toBe('46 ff ff') // 65536 saturates at 65535
    expect(enc({ op: 'grade', gradePct: -100 })).toBe('46 00 00')
    expect(enc({ op: 'grade', gradePct: -150 })).toBe('46 00 00')
  })

  it('wind: (mps + 32.768) × 1000', () => {
    expect(enc({ op: 'wind', mps: 0 })).toBe('47 00 80') // 32768 = 0x8000
    expect(enc({ op: 'wind', mps: 5 })).toBe('47 88 93') // 37768 = 0x9388
    expect(enc({ op: 'wind', mps: -3.5 })).toBe('47 54 72') // 29268 = 0x7254
    expect(enc({ op: 'wind', mps: -40 })).toBe('47 00 00')
    expect(enc({ op: 'wind', mps: 40 })).toBe('47 ff ff')
  })

  it('wheel circumference: mm × 10', () => {
    expect(enc({ op: 'wheelCircumference', mm: 2096 })).toBe('48 e0 51') // 20960 = 0x51E0
  })

  it('refuses non-finite values', () => {
    expect(() => encodeWahooCommand({ op: 'grade', gradePct: Number.NaN })).toThrow(CodecError)
    expect(() => encodeWahooCommand({ op: 'resistance', fraction: Number.NaN })).toThrow(CodecError)
  })
})

describe('decodeWahooCommand', () => {
  it('decodes the golden vectors back', () => {
    expect(dec('20 ee fc')).toEqual({ op: 'unlock' })
    expect(dec('41 03')).toEqual({ op: 'standard', level: 3 })
    expect(dec('42 c8 00')).toEqual({ op: 'erg', watts: 200 })
    expect(dec('43 34 21 28 00 fe 01')).toEqual({ op: 'simInit', weightKg: 85, crr: 0.004, cwKgPerM: 0.51 })
    expect(dec('44 2d 00')).toEqual({ op: 'simCrr', crr: 0.0045 })
    expect(dec('45 58 02')).toEqual({ op: 'simCw', cwKgPerM: 0.6 })
    expect(dec('46 00 80')).toEqual({ op: 'grade', gradePct: 0 })
    expect(dec('47 00 80')).toEqual({ op: 'wind', mps: 0 })
    expect(dec('48 e0 51')).toEqual({ op: 'wheelCircumference', mm: 2096 })
  })

  it('decodes scaled values to within their resolution', () => {
    const grade = dec('46 33 73')
    expect(grade?.op === 'grade' && grade.gradePct).toBeCloseTo(-10, 2)
    const wind = dec('47 88 93')
    expect(wind?.op === 'wind' && wind.mps).toBeCloseTo(5, 6)
    const res = dec('40 ff 2f')
    expect(res?.op === 'resistance' && res.fraction).toBeCloseTo(0.25, 4)
    // A raw value above 16383 would be a negative fraction: clamped to 0.
    expect(dec('40 ff ff')).toEqual({ op: 'resistance', fraction: 0 })
  })

  it('returns null for unknown op codes and a wrong unlock code', () => {
    expect(dec('49 00 00')).toBeNull()
    expect(dec('01 42')).toBeNull()
    expect(dec('20 00 00')).toBeNull()
  })

  it('throws when parameters are missing', () => {
    for (const hex of ['', '20 ee', '40 ff', '41', '42 c8', '43 34 21 28 00 fe', '44 2d', '45 58', '46 00', '47 00', '48 e0']) {
      expect(() => dec(hex)).toThrow(CodecError)
    }
  })

  it('exposes the op codes', () => {
    expect(Object.values(WahooOp)).toEqual([0x20, 0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48])
  })
})

const dbl = (min: number, max: number) => fc.double({ min, max, noNaN: true })
const wahooCommand: fc.Arbitrary<WahooCommand> = fc.oneof(
  fc.constant<WahooCommand>({ op: 'unlock' }),
  dbl(0, 1).map((fraction) => ({ op: 'resistance' as const, fraction })),
  fc.integer({ min: 0, max: 0xff }).map((level) => ({ op: 'standard' as const, level })),
  fc.integer({ min: 0, max: 0xffff }).map((watts) => ({ op: 'erg' as const, watts })),
  fc
    .record({ weightKg: dbl(0, 655.35), crr: dbl(0, 6.5535), cwKgPerM: dbl(0, 65.535) })
    .map((p) => ({ op: 'simInit' as const, ...p })),
  dbl(0, 6.5535).map((crr) => ({ op: 'simCrr' as const, crr })),
  dbl(0, 65.535).map((cwKgPerM) => ({ op: 'simCw' as const, cwKgPerM })),
  dbl(-100, 99.99).map((gradePct) => ({ op: 'grade' as const, gradePct })),
  dbl(-32.768, 32.767).map((mps) => ({ op: 'wind' as const, mps })),
  dbl(0, 6553.5).map((mm) => ({ op: 'wheelCircumference' as const, mm })),
)

/** Half of each field's resolution: the most rounding may move a value. */
const TOLERANCE: Record<string, number> = {
  fraction: 0.5 / 16383,
  weightKg: 0.005,
  crr: 0.00005,
  cwKgPerM: 0.0005,
  gradePct: 50 / 32768,
  mps: 0.0005,
  mm: 0.05,
}

describe('Wahoo command properties', () => {
  it('decode(encode(cmd)) matches within half a resolution step', () => {
    fc.assert(
      fc.property(wahooCommand, (cmd) => {
        const back = decodeWahooCommand(toDataView(encodeWahooCommand(cmd)))
        expect(back?.op).toBe(cmd.op)
        for (const [key, value] of Object.entries(cmd)) {
          if (key === 'op') continue
          const got = (back as Record<string, unknown> | null)?.[key]
          expect(typeof got).toBe('number')
          expect(Math.abs((got as number) - (value as number))).toBeLessThanOrEqual((TOLERANCE[key] ?? 0) + 1e-9)
        }
      }),
      FC,
    )
  })
})

describe('Wahoo responses', () => {
  it('parses [status, echoed op code]', () => {
    expect(parseWahooResponse(fromHex('01 42'))).toEqual({ ok: true, op: 0x42 })
    // The ERG answer carries extra bytes after the op code; they are ignored.
    expect(parseWahooResponse(fromHex('01 42 01 00 c8 00'))).toEqual({ ok: true, op: 0x42 })
    expect(parseWahooResponse(fromHex('01 20'))).toEqual({ ok: true, op: 0x20 })
    expect(parseWahooResponse(fromHex('02 46'))).toEqual({ ok: false, op: 0x46 })
    expect(parseWahooResponse(fromHex('00 43'))).toEqual({ ok: false, op: 0x43 })
  })

  it('returns null when byte 1 is not a Wahoo op code', () => {
    expect(parseWahooResponse(fromHex('01 99'))).toBeNull()
    expect(parseWahooResponse(fromHex('01 00'))).toBeNull()
  })

  it('throws when shorter than two bytes', () => {
    expect(() => parseWahooResponse(fromHex('01'))).toThrow(CodecError)
    expect(() => parseWahooResponse(fromHex(''))).toThrow(CodecError)
  })

  it('encodes responses for the simulator', () => {
    expect(toHex(encodeWahooResponse(WahooOp.SetErgMode))).toBe('01 42')
    expect(toHex(encodeWahooResponse(WahooOp.SetSimGrade, false))).toBe('02 46')
    expect(parseWahooResponse(toDataView(encodeWahooResponse(WahooOp.Unlock)))).toEqual({ ok: true, op: WahooOp.Unlock })
  })
})
