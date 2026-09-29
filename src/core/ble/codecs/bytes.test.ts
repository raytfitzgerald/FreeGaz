import { describe, expect, it } from 'vitest'
import { ByteReader, ByteWriter, clampInt, CodecError, fromHex, roundTo, toDataView, toHex, wrapInt } from './bytes'

describe('ByteReader', () => {
  it('reads little-endian integers of every width', () => {
    const r = new ByteReader(fromHex('ff fe ff 34 12 56 34 12 78 56 34 12 80 ff ff ff ff'), 'test')
    expect(r.uint8('a')).toBe(0xff)
    expect(r.sint16('b')).toBe(-2) // 0xFFFE
    expect(r.uint16('c')).toBe(0x1234)
    expect(r.uint24('d')).toBe(0x123456)
    expect(r.uint32('e')).toBe(0x12345678)
    expect(r.sint8('f')).toBe(-128) // 0x80
    expect(r.uint32('g')).toBe(0xffffffff) // unsigned, never negative
    expect(r.remaining).toBe(0)
  })

  it('throws a CodecError naming the characteristic, field and offset when truncated', () => {
    const r = new ByteReader(fromHex('01 02 03'), 'Widget Data')
    r.uint16('first')
    expect(() => r.uint16('second')).toThrow(CodecError)
    expect(() => r.uint16('second')).toThrow(
      'Widget Data: truncated, second needs 2 bytes at offset 2 but the payload is 3 bytes',
    )
    // A failed read does not advance, so the last byte is still readable.
    expect(r.uint8('third')).toBe(3)
  })

  it('copies bytes out, so later changes to the source do not leak', () => {
    const src = Uint8Array.of(1, 2, 3, 4)
    const r = new ByteReader(toDataView(src), 'test')
    r.uint8('skip')
    const rest = r.rest()
    src[2] = 99
    expect(Array.from(rest)).toEqual([2, 3, 4])
    expect(r.rest()).toHaveLength(0)
  })
})

describe('ByteWriter', () => {
  it('writes little-endian integers of every width', () => {
    const bytes = new ByteWriter().uint8(0xab).sint8(-1).uint16(0x1234).sint16(-2).uint24(0x123456).uint32(0xfffffffe).toBytes()
    expect(toHex(bytes)).toBe('ab ff 34 12 fe ff 56 34 12 fe ff ff ff')
  })

  it('rounds to the nearest integer and clamps to the field range', () => {
    const w = new ByteWriter()
    w.uint8(2.5).uint8(2.4999).uint8(300).uint8(-5).sint16(40000).sint16(-40000).uint16(-1).uint24(2 ** 25)
    expect(toHex(w.toBytes())).toBe('03 02 ff 00 ff 7f 00 80 00 00 ff ff ff')
  })

  it('wraps rolling counters instead of clamping them', () => {
    const w = new ByteWriter().counter(65536 + 5, 2).counter(-1, 2).counter(2 ** 32 + 7, 4)
    expect(toHex(w.toBytes())).toBe('05 00 ff ff 07 00 00 00')
  })

  it('refuses NaN and infinities with the field name', () => {
    expect(() => new ByteWriter().uint16(Number.NaN, 'speedKmh')).toThrow('speedKmh: cannot encode NaN')
    expect(() => new ByteWriter().sint16(Infinity, 'powerW')).toThrow(CodecError)
    expect(() => new ByteWriter().counter(-Infinity, 2, 'revs')).toThrow(CodecError)
  })
})

describe('helpers', () => {
  it('clampInt normalises -0 so decoded values compare equal to 0', () => {
    expect(Object.is(clampInt(-0.4, -10, 10, 'x'), 0)).toBe(true)
    expect(Object.is(wrapInt(-0.2, 16, 'x'), 0)).toBe(true)
    expect(Object.is(roundTo(-0.00001, 2), 0)).toBe(true)
    expect(roundTo(36.99999999, 4)).toBe(37)
  })

  it('toDataView honours the byteOffset of a subarray (e.g. a pooled Node Buffer)', () => {
    const pool = Uint8Array.of(9, 9, 0x34, 0x12, 9)
    const dv = toDataView(pool.subarray(2, 4))
    expect(dv.byteLength).toBe(2)
    expect(dv.getUint16(0, true)).toBe(0x1234)
    expect(toDataView([1, 2, 3]).byteLength).toBe(3)
    expect(toDataView(new ArrayBuffer(4)).byteLength).toBe(4)
  })

  it('fromHex accepts common separators and rejects malformed input', () => {
    expect(toHex(fromHex('44:00-F6,09 0xb5'))).toBe('44 00 f6 09 b5')
    expect(fromHex('').byteLength).toBe(0)
    expect(() => fromHex('123')).toThrow(CodecError)
    expect(() => fromHex('zz')).toThrow(CodecError)
  })

  it('toHex formats DataViews and Uint8Arrays alike', () => {
    expect(toHex(fromHex('0a ff'))).toBe('0a ff')
    expect(toHex(Uint8Array.of(0, 16))).toBe('00 10')
  })
})
