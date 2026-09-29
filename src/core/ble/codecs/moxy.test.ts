import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CodecError, fromHex, toDataView, toHex } from './bytes'
import { encodeMoxy, parseMoxy } from './moxy'

const FC = { seed: 20260929, numRuns: 500 }

describe('Moxy SmO2 (unofficial layout)', () => {
  it('parses four uint16 fields', () => {
    const hex =
      '2a 00 ' + // count 42
      '8d 02 ' + // SmO2 0x028D = 653 × 0.1 = 65.3 %
      '89 02 ' + // previous SmO2 0x0289 = 649 × 0.1 = 64.9 %
      'd2 04' //    tHb 0x04D2 = 1234 × 0.01 = 12.34 g/dL
    const expected = { count: 42, smo2Pct: 65.3, prevSmo2Pct: 64.9, thbGdl: 12.34 }
    expect(parseMoxy(fromHex(hex))).toEqual(expected)
    expect(toHex(encodeMoxy(expected))).toBe(hex)
  })

  it('ignores trailing bytes', () => {
    expect(parseMoxy(fromHex('2a 00 8d 02 89 02 d2 04 ff ff')).thbGdl).toBe(12.34)
  })

  it('throws when truncated', () => {
    expect(() => parseMoxy(fromHex('2a 00 8d 02 89 02 d2'))).toThrow(CodecError)
    expect(() => parseMoxy(fromHex(''))).toThrow(CodecError)
  })

  it('wraps the counter and clamps the readings when encoding', () => {
    expect(toHex(encodeMoxy({ count: 65537, smo2Pct: -1, prevSmo2Pct: 7000, thbGdl: 1 }))).toBe('01 00 00 00 ff ff 64 00')
  })

  it('encode → parse is the identity', () => {
    const u16 = (scale: number) => fc.integer({ min: 0, max: 0xffff }).map((v) => v / scale)
    fc.assert(
      fc.property(fc.record({ count: u16(1), smo2Pct: u16(10), prevSmo2Pct: u16(10), thbGdl: u16(100) }), (m) => {
        expect(parseMoxy(toDataView(encodeMoxy(m)))).toEqual(m)
      }),
      FC,
    )
  })
})
