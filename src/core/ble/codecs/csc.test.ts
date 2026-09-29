import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CodecError, fromHex, toDataView, toHex } from './bytes'
import { encodeCscFeature, encodeCscMeasurement, parseCscFeature, parseCscMeasurement, type CscMeasurement } from './csc'

const FC = { seed: 20260929, numRuns: 500 }
const csc = (hex: string) => parseCscMeasurement(fromHex(hex))

describe('parseCscMeasurement golden vectors', () => {
  it('wheel + crank revolution data', () => {
    const hex =
      '03 ' + //          flags: bit 0 wheel data, bit 1 crank data
      '45 23 01 00 ' + // cumulative wheel revolutions 0x00012345 = 74565
      '34 12 ' + //       last wheel event time 0x1234 = 4660 (1/1024 s)
      '03 02 ' + //       cumulative crank revolutions 0x0203 = 515
      'ff ff' //          last crank event time 0xFFFF = 65535
    const expected = { wheelRevs: 74565, wheelEventTime: 4660, crankRevs: 515, crankEventTime: 65535 }
    expect(csc(hex)).toEqual(expected)
    expect(toHex(encodeCscMeasurement(expected))).toBe(hex)
  })

  it('wheel only, crank only, neither', () => {
    expect(csc('01 45 23 01 00 34 12')).toEqual({ wheelRevs: 74565, wheelEventTime: 4660 })
    expect(csc('02 03 02 ff ff')).toEqual({ crankRevs: 515, crankEventTime: 65535 })
    expect(csc('00')).toEqual({})
    expect(csc('fc')).toEqual({}) // reserved bits 2-7
  })

  it('reads the wheel counter as unsigned 32-bit', () => {
    expect(csc('01 ff ff ff ff 00 00').wheelRevs).toBe(0xffffffff)
  })

  it('throws when truncated', () => {
    expect(() => csc('03 45 23 01 00 34 12 03 02 ff')).toThrow(CodecError)
    expect(() => csc('01 45 23 01 00 34')).toThrow(CodecError)
    expect(() => csc('02 03 02 ff')).toThrow(CodecError)
    expect(() => csc('')).toThrow(CodecError)
  })
})

describe('encodeCscMeasurement', () => {
  it('requires revolutions and event time together', () => {
    expect(() => encodeCscMeasurement({ wheelRevs: 1 })).toThrow(CodecError)
    expect(() => encodeCscMeasurement({ crankEventTime: 1 })).toThrow(CodecError)
  })

  it('wraps the rolling counters', () => {
    // wheel 2^32 + 1 → 1; wheel time 65536 + 2 → 2; crank 65536 → 0; crank time -1 → 65535
    expect(toHex(encodeCscMeasurement({ wheelRevs: 2 ** 32 + 1, wheelEventTime: 65538, crankRevs: 65536, crankEventTime: -1 }))).toBe(
      '03 01 00 00 00 02 00 00 00 ff ff',
    )
  })

  it('encode → parse is the identity', () => {
    const u16 = fc.integer({ min: 0, max: 0xffff })
    const u32 = fc.tuple(u16, u16).map(([hi, lo]) => hi * 0x10000 + lo)
    const arb: fc.Arbitrary<CscMeasurement> = fc
      .record({ wheel: fc.option(fc.tuple(u32, u16), { nil: undefined }), crank: fc.option(fc.tuple(u16, u16), { nil: undefined }) })
      .map(({ wheel, crank }) => ({
        wheelRevs: wheel?.[0],
        wheelEventTime: wheel?.[1],
        crankRevs: crank?.[0],
        crankEventTime: crank?.[1],
      }))
    fc.assert(
      fc.property(arb, (m) => {
        expect(parseCscMeasurement(toDataView(encodeCscMeasurement(m)))).toEqual(m)
      }),
      FC,
    )
  })
})

describe('CSC Feature', () => {
  it('parses the three defined bits and keeps raw', () => {
    expect(parseCscFeature(fromHex('07 00'))).toEqual({
      raw: 7,
      wheelRevolutionData: true,
      crankRevolutionData: true,
      multipleSensorLocations: true,
    })
    expect(parseCscFeature(fromHex('02 00'))).toMatchObject({ wheelRevolutionData: false, crankRevolutionData: true })
    expect(parseCscFeature(fromHex('08 80'))).toEqual({
      raw: 0x8008, // reserved bits only
      wheelRevolutionData: false,
      crankRevolutionData: false,
      multipleSensorLocations: false,
    })
  })

  it('encodes', () => {
    expect(toHex(encodeCscFeature({ wheelRevolutionData: true, crankRevolutionData: true }))).toBe('03 00')
  })

  it('throws when truncated', () => {
    expect(() => parseCscFeature(fromHex('07'))).toThrow(CodecError)
  })
})
