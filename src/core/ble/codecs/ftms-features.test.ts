import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CodecError, fromHex, toDataView, toHex } from './bytes'
import {
  encodeFtmsFeatures,
  encodeSupportedPowerRange,
  encodeSupportedResistanceRange,
  parseFtmsFeatures,
  parseSupportedPowerRange,
  parseSupportedResistanceRange,
} from './ftms-features'

const FC = { seed: 20260929, numRuns: 300 }

// FTMS v1.0 §4.3.1.1 / §4.3.1.2 bit order, restated independently of the implementation.
const MACHINE_ORDER = [
  'avgSpeed', 'cadence', 'totalDistance', 'inclination', 'elevationGain', 'pace', 'stepCount', 'resistanceLevel',
  'strideCount', 'expendedEnergy', 'heartRate', 'metabolicEquivalent', 'elapsedTime', 'remainingTime', 'power',
  'forceOnBelt', 'userDataRetention',
]
const TARGET_ORDER = [
  'speed', 'inclination', 'resistance', 'power', 'heartRate', 'targetedEnergy', 'targetedSteps', 'targetedStrides',
  'targetedDistance', 'targetedTime', 'targetedHrZones2', 'targetedHrZones3', 'targetedHrZones5', 'simulation',
  'wheelCircumference', 'spinDown', 'cadence',
]

const trueKeys = (flags: Record<string, boolean>) => Object.keys(flags).filter((k) => flags[k])

describe('Fitness Machine Feature', () => {
  it('parses a KICKR-like trainer', () => {
    const f = parseFtmsFeatures(
      fromHex(
        '82 44 00 00 ' + // machine 0x00004482: bit 1 cadence, bit 7 resistance level, bit 10 heart rate, bit 14 power
          '0c e0 00 00', //  target 0x0000E00C: bit 2 resistance, bit 3 power, bit 13 simulation, bit 14 wheel, bit 15 spin down
      ),
    )
    expect(f.raw).toEqual({ machine: 0x4482, target: 0xe00c })
    expect(trueKeys(f.machine)).toEqual(['cadence', 'resistanceLevel', 'heartRate', 'power'])
    expect(trueKeys(f.target)).toEqual(['resistance', 'power', 'simulation', 'wheelCircumference', 'spinDown'])
    expect(f.target.cadence).toBe(false)
  })

  it('maps every defined bit to its spec name', () => {
    MACHINE_ORDER.forEach((name, bit) => {
      const f = parseFtmsFeatures(toDataView(encodeFtmsFeatures({ raw: { machine: 2 ** bit } })))
      expect(trueKeys(f.machine)).toEqual([name])
      expect(trueKeys(f.target)).toEqual([])
    })
    TARGET_ORDER.forEach((name, bit) => {
      const f = parseFtmsFeatures(toDataView(encodeFtmsFeatures({ raw: { target: 2 ** bit } })))
      expect(trueKeys(f.target)).toEqual([name])
    })
  })

  it('keeps reserved bits in raw without inventing flags', () => {
    // Bit 31 of both fields set: uint32, so 0x80000000 stays positive.
    const f = parseFtmsFeatures(fromHex('00 00 00 80 00 00 00 80'))
    expect(f.raw).toEqual({ machine: 0x80000000, target: 0x80000000 })
    expect(trueKeys(f.machine)).toEqual([])
  })

  it('encodes named flags', () => {
    const bytes = encodeFtmsFeatures({ machine: { cadence: true, power: true }, target: { power: true, simulation: true } })
    // machine: bit 1 + bit 14 = 0x00004002; target: bit 3 + bit 13 = 0x00002008
    expect(toHex(bytes)).toBe('02 40 00 00 08 20 00 00')
  })

  it('lets named flags override raw bits', () => {
    const bytes = encodeFtmsFeatures({ raw: { machine: 0xffffffff }, machine: { power: false } })
    expect(toHex(bytes)).toBe('ff bf ff ff 00 00 00 00') // bit 14 cleared
  })

  it('encode(parse(x)) reproduces any 8-byte value', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 8, maxLength: 8 }), (bytes) => {
        expect(Array.from(encodeFtmsFeatures(parseFtmsFeatures(toDataView(bytes))))).toEqual(Array.from(bytes))
      }),
      FC,
    )
  })

  it('throws when truncated', () => {
    expect(() => parseFtmsFeatures(fromHex('82 44 00 00 0c e0 00'))).toThrow(CodecError)
    expect(() => parseFtmsFeatures(fromHex('82 44 00'))).toThrow(CodecError)
  })
})

describe('Supported Power Range', () => {
  it('parses sint16 min, sint16 max, uint16 increment', () => {
    // 19 00 min 25 W | c4 09 max 0x09C4 = 2500 W | 05 00 increment 5 W
    expect(parseSupportedPowerRange(fromHex('19 00 c4 09 05 00'))).toEqual({ min: 25, max: 2500, step: 5 })
    // f6 ff min 0xFFF6 = -10 W (signed)
    expect(parseSupportedPowerRange(fromHex('f6 ff e8 03 01 00'))).toEqual({ min: -10, max: 1000, step: 1 })
  })

  it('encodes', () => {
    expect(toHex(encodeSupportedPowerRange({ min: 25, max: 2500, step: 5 }))).toBe('19 00 c4 09 05 00')
  })

  it('throws one byte short', () => {
    expect(() => parseSupportedPowerRange(fromHex('19 00 c4 09 05'))).toThrow(CodecError)
  })
})

describe('Supported Resistance Level Range', () => {
  it('parses the 6-byte FTMS v1.0 layout (sint16, sint16, uint16; 0.1)', () => {
    // 00 00 min 0 | e8 03 max 1000 × 0.1 = 100.0 | 0a 00 increment 10 × 0.1 = 1.0
    expect(parseSupportedResistanceRange(fromHex('00 00 e8 03 0a 00'))).toEqual({ min: 0, max: 100, step: 1, encoding: 'sint16' })
    // f6 ff min -10 × 0.1 = -1.0 | 64 00 max 10.0 | 01 00 increment 0.1
    expect(parseSupportedResistanceRange(fromHex('f6 ff 64 00 01 00'))).toEqual({ min: -1, max: 10, step: 0.1, encoding: 'sint16' })
  })

  it('parses the 3-byte GSS layout (uint8 ×3; 0.1)', () => {
    // 00 min 0 | c8 max 200 × 0.1 = 20.0 | 05 increment 0.5
    expect(parseSupportedResistanceRange(fromHex('00 c8 05'))).toEqual({ min: 0, max: 20, step: 0.5, encoding: 'uint8' })
  })

  it('reads anything longer than 6 bytes as the 6-byte layout', () => {
    expect(parseSupportedResistanceRange(fromHex('00 00 e8 03 0a 00 ff')).encoding).toBe('sint16')
  })

  it('throws for 4-5 bytes (a truncated 6-byte layout) and for fewer than 3', () => {
    for (const hex of ['00 00 e8 03 0a', '00 00 e8 03', '00 c8', '00', '']) {
      expect(() => parseSupportedResistanceRange(fromHex(hex))).toThrow(CodecError)
    }
  })

  it('encodes either layout, defaulting to sint16', () => {
    expect(toHex(encodeSupportedResistanceRange({ min: 0, max: 100, step: 1 }))).toBe('00 00 e8 03 0a 00')
    expect(toHex(encodeSupportedResistanceRange({ min: 0, max: 20, step: 0.5, encoding: 'uint8' }))).toBe('00 c8 05')
    // uint8 saturates at 25.5
    expect(toHex(encodeSupportedResistanceRange({ min: 0, max: 30, step: 1, encoding: 'uint8' }))).toBe('00 ff 0a')
  })

  it('round-trips both layouts', () => {
    const s16 = fc.integer({ min: -0x8000, max: 0x7fff }).map((v) => v / 10)
    const u16 = fc.integer({ min: 0, max: 0xffff }).map((v) => v / 10)
    const u8 = fc.integer({ min: 0, max: 0xff }).map((v) => v / 10)
    fc.assert(
      fc.property(
        fc.oneof(
          fc.record({ min: s16, max: s16, step: u16, encoding: fc.constant('sint16' as const) }),
          fc.record({ min: u8, max: u8, step: u8, encoding: fc.constant('uint8' as const) }),
        ),
        (range) => {
          expect(parseSupportedResistanceRange(toDataView(encodeSupportedResistanceRange(range)))).toEqual(range)
        },
      ),
      FC,
    )
  })
})
