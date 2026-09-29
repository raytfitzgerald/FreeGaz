import { describe, expect, it } from 'vitest'
import { CodecError, fromHex, toDataView } from './bytes'
import { decodeUtf8String, encodeBatteryLevel, encodeUtf8String, parseBatteryLevel } from './dis'

describe('decodeUtf8String', () => {
  it('decodes plain and NUL-padded strings', () => {
    expect(decodeUtf8String(fromHex('4b 49 43 4b 52'))).toBe('KICKR')
    expect(decodeUtf8String(fromHex('4b 49 43 4b 52 00 00'))).toBe('KICKR')
  })

  it('stops at the first NUL, dropping stale bytes after it', () => {
    expect(decodeUtf8String(fromHex('4b 49 43 4b 52 00 ff 41'))).toBe('KICKR')
    expect(decodeUtf8String(fromHex('00 41 42'))).toBe('')
  })

  it('decodes multi-byte UTF-8 and replaces invalid bytes', () => {
    expect(decodeUtf8String(fromHex('c3 89 6c 69 74 65'))).toBe('Élite') // É = c3 89
    expect(decodeUtf8String(fromHex('41 ff 42'))).toBe('A�B')
  })

  it('handles empty values and views with an offset', () => {
    expect(decodeUtf8String(fromHex(''))).toBe('')
    const pool = Uint8Array.of(0x58, 0x4e, 0x45, 0x4f, 0x58) // "XNEOX"
    expect(decodeUtf8String(toDataView(pool.subarray(1, 4)))).toBe('NEO')
  })

  it('round-trips with encodeUtf8String', () => {
    for (const s of ['Wahoo Fitness LLC', 'Tacx Neo 2T', 'Élite Suito', '4.2.1']) {
      expect(decodeUtf8String(toDataView(encodeUtf8String(s)))).toBe(s)
    }
  })
})

describe('Battery Level', () => {
  it('parses 0-100 %', () => {
    expect(parseBatteryLevel(fromHex('55'))).toBe(85)
    expect(parseBatteryLevel(fromHex('00'))).toBe(0)
    expect(parseBatteryLevel(fromHex('64'))).toBe(100)
  })

  it('throws on reserved values and empty payloads', () => {
    expect(() => parseBatteryLevel(fromHex('65'))).toThrow(CodecError) // 101
    expect(() => parseBatteryLevel(fromHex('ff'))).toThrow(CodecError)
    expect(() => parseBatteryLevel(fromHex(''))).toThrow(CodecError)
  })

  it('encodes, rounding and clamping', () => {
    expect(Array.from(encodeBatteryLevel(85.4))).toEqual([85])
    expect(Array.from(encodeBatteryLevel(120))).toEqual([100])
    expect(Array.from(encodeBatteryLevel(-3))).toEqual([0])
    expect(() => encodeBatteryLevel(Number.NaN)).toThrow(CodecError)
  })
})
