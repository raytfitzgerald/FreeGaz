import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CodecError, fromHex, toDataView, toHex } from './bytes'
import { encodeCoreTemp, parseCoreTemp, type CoreDataQuality, type CoreHrState, type CoreTempMeasurement } from './core-temp'

const FC = { seed: 20260929, numRuns: 500 }
const core = (hex: string) => parseCoreTemp(fromHex(hex))

describe('parseCoreTemp golden vectors', () => {
  it('the worked example from CORE\'s implementation notes (Table 5)', () => {
    // The notes print this payload three ways that disagree: an 11-byte hex
    // string with an extra byte, a table claiming skin 35.22 °C = 0x0D5C, and a
    // Python rendering b"7\x19\x0f\xa4\r/\x00\x11\x00'". Only the last is a
    // well-formed 10-byte payload for flags 0x37, so it is the one used here.
    const hex =
      '37 ' + //    flags 0x37: bit 0 skin, bit 1 core reserved, bit 2 quality & state, bit 4 HR, bit 5 HSI; bit 3 = 0 → °C
      '19 0f ' + // core 0x0F19 = 3865 → 38.65 °C
      'a4 0d ' + // skin 0x0DA4 = 3492 → 34.92 °C
      '2f 00 ' + // core reserved 0x002F = 47
      '11 ' + //    quality & state 0x11: bits 0-2 = 001 poor; bits 4-5 = 01 HR supported, not receiving
      '00 ' + //    heart rate 0 = no signal → omitted
      '27' //       heat strain index 0x27 = 39 × 0.1 = 3.9
    expect(core(hex)).toEqual({
      units: 'C',
      coreTempC: 38.65,
      skinTempC: 34.92,
      coreReserved: 47,
      quality: 'poor',
      hrState: 'notReceiving',
      heatStrainIndex: 3.9,
    })
  })

  it('core temperature only, and "no reading" (0x7FFF)', () => {
    expect(core('00 a8 0e')).toEqual({ units: 'C', coreTempC: 37.52 }) // 0x0EA8 = 3752
    expect(core('00 ff 7f')).toEqual({ units: 'C' })
  })

  it('returns °F readings in °F, as flagged by units', () => {
    // 08 flags bit 3 °F | 84 26 core 0x2684 = 9860 → 98.60 °F
    expect(core('08 84 26')).toEqual({ units: 'F', coreTempC: 98.6 })
    // 09 °F + skin | b4 23 skin 0x23B4 = 9140 → 91.40 °F
    expect(core('09 84 26 b4 23')).toEqual({ units: 'F', coreTempC: 98.6, skinTempC: 91.4 })
  })

  it('heart rate received from a paired strap', () => {
    // 14 flags: quality & state, HR | a8 0e 37.52 °C | 23: quality 011 good, state 10 receiving | 8c 140 bpm
    expect(core('14 a8 0e 23 8c')).toEqual({ units: 'C', coreTempC: 37.52, quality: 'good', hrState: 'receiving', heartRateBpm: 140 })
  })

  it('quality and state codes, including "not available" and reserved ones', () => {
    expect(core('04 a8 0e 37')).toMatchObject({ quality: 'notAvailable', hrState: 'notAvailable' }) // 111, 11
    expect(core('04 a8 0e 05')).toMatchObject({ quality: 'reserved', hrState: 'notSupported' }) // 101, 00
    expect(core('04 a8 0e 04')).toMatchObject({ quality: 'excellent' })
    expect(core('04 a8 0e 00')).toMatchObject({ quality: 'invalid' })
  })

  it('omits a skin temperature of 0x7FFF and a heat strain index of 0xFF', () => {
    expect(core('01 a8 0e ff 7f')).toEqual({ units: 'C', coreTempC: 37.52 })
    expect(core('20 a8 0e ff')).toEqual({ units: 'C', coreTempC: 37.52 })
    expect(core('20 a8 0e fe')).toEqual({ units: 'C', coreTempC: 37.52, heatStrainIndex: 25.4 })
  })

  it('reads negative temperatures (sint16)', () => {
    expect(core('01 a8 0e 6a ff')).toEqual({ units: 'C', coreTempC: 37.52, skinTempC: -1.5 }) // 0xFF6A = -150
  })

  it('ignores the reserved flag bits 6-7', () => {
    expect(core('c0 a8 0e')).toEqual({ units: 'C', coreTempC: 37.52 })
  })

  it('throws when truncated', () => {
    expect(() => core('37 19 0f a4 0d 2f 00 11 00')).toThrow(CodecError) // heat strain index missing
    expect(() => core('14 a8 0e 23')).toThrow(CodecError)
    expect(() => core('00 a8')).toThrow(CodecError)
    expect(() => core('')).toThrow(CodecError)
  })
})

describe('encodeCoreTemp', () => {
  it('encodes the fields present', () => {
    expect(toHex(encodeCoreTemp({ units: 'C', coreTempC: 37.52, quality: 'good', hrState: 'receiving', heartRateBpm: 140 }))).toBe(
      '14 a8 0e 23 8c',
    )
    expect(toHex(encodeCoreTemp({ units: 'F', coreTempC: 98.6 }))).toBe('08 84 26')
  })

  it('sends 0x7FFF without a core reading and keeps real values below it', () => {
    expect(toHex(encodeCoreTemp({ units: 'C' }))).toBe('00 ff 7f')
    expect(toHex(encodeCoreTemp({ units: 'C', coreTempC: 400 }))).toBe('00 fe 7f') // 40000 clamps to 32766
  })

  it('fills a missing half of Quality and State with "not available"', () => {
    expect(toHex(encodeCoreTemp({ units: 'C', coreTempC: 37.52, quality: 'good' }))).toBe('04 a8 0e 33') // state 11
    expect(toHex(encodeCoreTemp({ units: 'C', coreTempC: 37.52, hrState: 'receiving' }))).toBe('04 a8 0e 27') // quality 111
  })

  it('caps the heat strain index at 25.4', () => {
    expect(toHex(encodeCoreTemp({ units: 'C', coreTempC: 37.52, heatStrainIndex: 30 }))).toBe('20 a8 0e fe')
  })

  it('parse(encode(m)) is the identity for any valid measurement', () => {
    const temp = fc.integer({ min: -0x8000, max: 0x7ffe }).map((v) => v / 100)
    const qualities: CoreDataQuality[] = ['invalid', 'poor', 'fair', 'good', 'excellent', 'notAvailable', 'reserved']
    const states: CoreHrState[] = ['notSupported', 'notReceiving', 'receiving', 'notAvailable']
    const arb: fc.Arbitrary<CoreTempMeasurement> = fc
      .record({
        units: fc.constantFrom<'C' | 'F'>('C', 'F'),
        coreTempC: fc.option(temp, { nil: undefined }),
        skinTempC: fc.option(temp, { nil: undefined }),
        coreReserved: fc.option(fc.integer({ min: -0x8000, max: 0x7fff }), { nil: undefined }),
        qs: fc.option(fc.tuple(fc.constantFrom(...qualities), fc.constantFrom(...states)), { nil: undefined }),
        heartRateBpm: fc.option(fc.integer({ min: 1, max: 255 }), { nil: undefined }),
        heatStrainIndex: fc.option(fc.integer({ min: 0, max: 254 }).map((v) => v / 10), { nil: undefined }),
      })
      .map(({ qs, ...m }) => ({ ...m, quality: qs?.[0], hrState: qs?.[1] }))
    fc.assert(
      fc.property(arb, (m) => {
        expect(parseCoreTemp(toDataView(encodeCoreTemp(m)))).toEqual(m)
      }),
      FC,
    )
  })
})
