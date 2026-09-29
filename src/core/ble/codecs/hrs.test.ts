import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CodecError, fromHex, toDataView, toHex } from './bytes'
import {
  BODY_SENSOR_LOCATIONS,
  encodeBodySensorLocation,
  encodeHeartRateMeasurement,
  parseBodySensorLocation,
  parseHeartRateMeasurement,
  type HeartRateMeasurement,
} from './hrs'

const FC = { seed: 20260929, numRuns: 500 }
const hr = (hex: string) => parseHeartRateMeasurement(fromHex(hex))

describe('parseHeartRateMeasurement golden vectors', () => {
  it('uint8 heart rate, no contact support', () => {
    // 00 flags: uint8 HR, contact not supported | 48 = 72 bpm
    expect(hr('00 48')).toEqual({ bpm: 72, contactSupported: false, rrMs: [] })
  })

  it('uint16 heart rate', () => {
    // 01 flags bit 0: uint16 HR | 48 00 = 72 bpm
    expect(hr('01 48 00')).toEqual({ bpm: 72, contactSupported: false, rrMs: [] })
    // 01 00 01 = 0x0100 = 256 bpm, only representable in the 16-bit form
    expect(hr('01 00 01').bpm).toBe(256)
  })

  it('contact detected, energy expended and three RR intervals', () => {
    const hex =
      '1e ' + //    flags 0x1E: bit 1 contact detected, bit 2 contact supported, bit 3 energy, bit 4 RR; bit 0 = 0 → uint8 HR
      '41 ' + //    heart rate 65 bpm
      'd2 04 ' + // energy expended 0x04D2 = 1234 kJ
      '00 04 ' + // RR 0x0400 = 1024/1024 s = 1000.0 ms
      '20 03 ' + // RR 0x0320 = 800/1024 s = 781.25 ms → 781.3
      '84 03' //    RR 0x0384 = 900/1024 s = 878.90625 ms → 878.9
    const expected = { bpm: 65, contactSupported: true, contactDetected: true, energyExpendedKj: 1234, rrMs: [1000, 781.3, 878.9] }
    expect(hr(hex)).toEqual(expected)
    expect(toHex(encodeHeartRateMeasurement(expected))).toBe(hex)
  })

  it('contact supported but not detected', () => {
    expect(hr('04 50')).toEqual({ bpm: 80, contactSupported: true, contactDetected: false, rrMs: [] })
  })

  it('ignores the contact-detected bit when contact is not supported', () => {
    expect(hr('02 50')).toEqual({ bpm: 80, contactSupported: false, rrMs: [] })
  })

  it('uint16 heart rate with energy, no RR', () => {
    // 09 flags: bit 0 uint16, bit 3 energy | 48 00 = 72 bpm | 10 27 = 0x2710 = 10000 kJ
    expect(hr('09 48 00 10 27')).toEqual({ bpm: 72, contactSupported: false, energyExpendedKj: 10000, rrMs: [] })
  })

  it('RR intervals after a uint16 heart rate', () => {
    // 11 flags: bit 0 uint16, bit 4 RR | 48 00 | 00 04 = 1000 ms
    expect(hr('11 48 00 00 04').rrMs).toEqual([1000])
  })

  it('tolerates the RR flag with no intervals', () => {
    expect(hr('10 48').rrMs).toEqual([])
  })

  it('throws on a partial RR interval and on truncated fields', () => {
    expect(() => hr('10 48 00 04 01')).toThrow(CodecError) // 3 RR bytes
    expect(() => hr('1e 41 d2 04 00 04 20 03 84')).toThrow(CodecError) // one byte short
    expect(() => hr('09 48 00 10')).toThrow(CodecError) // energy cut
    expect(() => hr('01 48')).toThrow(CodecError) // uint16 HR cut
    expect(() => hr('00')).toThrow(CodecError)
    expect(() => hr('')).toThrow(CodecError)
  })
})

describe('encodeHeartRateMeasurement', () => {
  it('uses uint8 when it fits, uint16 when forced or needed', () => {
    const m = { bpm: 72, contactSupported: false, rrMs: [] }
    expect(toHex(encodeHeartRateMeasurement(m))).toBe('00 48')
    expect(toHex(encodeHeartRateMeasurement(m, { uint16: true }))).toBe('01 48 00')
    expect(toHex(encodeHeartRateMeasurement({ ...m, bpm: 300 }))).toBe('01 2c 01')
  })

  it('only sets contact detected together with contact supported', () => {
    expect(toHex(encodeHeartRateMeasurement({ bpm: 80, contactSupported: false, contactDetected: true, rrMs: [] }))).toBe('00 50')
    expect(toHex(encodeHeartRateMeasurement({ bpm: 80, contactSupported: true, contactDetected: false, rrMs: [] }))).toBe('04 50')
  })

  it('converts RR from ms to 1/1024 s', () => {
    // 1000 ms → 1024 (00 04); 500 ms → 512 (00 02)
    expect(toHex(encodeHeartRateMeasurement({ bpm: 60, contactSupported: false, rrMs: [1000, 500] }))).toBe('10 3c 00 04 00 02')
  })
})

const measurement: fc.Arbitrary<HeartRateMeasurement> = fc
  .record({
    bpm: fc.integer({ min: 0, max: 0xffff }),
    contact: fc.constantFrom('none', 'notDetected', 'detected'),
    energyExpendedKj: fc.option(fc.integer({ min: 0, max: 0xffff }), { nil: undefined }),
    rrMs: fc.array(fc.double({ min: 0, max: 63999, noNaN: true }), { maxLength: 9 }),
  })
  .map(({ contact, ...m }) => ({
    ...m,
    contactSupported: contact !== 'none',
    contactDetected: contact === 'none' ? undefined : contact === 'detected',
  }))

describe('Heart Rate Measurement properties', () => {
  it('encode → parse keeps everything, RR within half a 1/1024 s step plus the 0.1 ms rounding', () => {
    fc.assert(
      fc.property(measurement, (m) => {
        const back = parseHeartRateMeasurement(toDataView(encodeHeartRateMeasurement(m)))
        expect({ ...back, rrMs: [] }).toEqual({ ...m, rrMs: [] })
        expect(back.rrMs).toHaveLength(m.rrMs.length)
        back.rrMs.forEach((ms, i) => expect(Math.abs(ms - (m.rrMs[i] ?? NaN))).toBeLessThanOrEqual(500 / 1024 + 0.05 + 1e-9))
      }),
      FC,
    )
  })

  it('parsed RR values re-encode to the same wire value (parse → encode → parse is stable)', () => {
    fc.assert(
      fc.property(measurement, fc.boolean(), (m, wide) => {
        const once = parseHeartRateMeasurement(toDataView(encodeHeartRateMeasurement(m, { uint16: wide })))
        const twice = parseHeartRateMeasurement(toDataView(encodeHeartRateMeasurement(once, { uint16: wide })))
        expect(twice).toEqual(once)
      }),
      FC,
    )
  })
})

describe('Body Sensor Location', () => {
  it('maps codes 0-6 and treats the rest as unknown', () => {
    expect(BODY_SENSOR_LOCATIONS).toEqual(['other', 'chest', 'wrist', 'finger', 'hand', 'earLobe', 'foot'])
    expect(parseBodySensorLocation(fromHex('01'))).toBe('chest')
    expect(parseBodySensorLocation(fromHex('05'))).toBe('earLobe')
    expect(parseBodySensorLocation(fromHex('07'))).toBe('unknown')
    expect(() => parseBodySensorLocation(fromHex(''))).toThrow(CodecError)
  })

  it('encodes', () => {
    expect(Array.from(encodeBodySensorLocation('wrist'))).toEqual([2])
  })
})
