import { describe, expect, it } from 'vitest'
import { CodecError, fromHex, toDataView, toHex } from './bytes'
import {
  decodeHeadwindCommand,
  encodeHeadwindEvent,
  encodeHeadwindSetMode,
  encodeHeadwindSetSpeed,
  HEADWIND_MODES,
  parseHeadwindEvent,
} from './headwind'

// Byte sequences marked "captured" come from the session log recorded on a
// real fan in amasolov/wahoo-headwind-ble docs/PROTOCOL.md (MIT).
const event = (hex: string) => parseHeadwindEvent(fromHex(hex))

describe('Headwind commands', () => {
  it('set speed: [0x02, 0-100]', () => {
    expect(toHex(encodeHeadwindSetSpeed(30))).toBe('02 1e') // captured: 30 %
    expect(toHex(encodeHeadwindSetSpeed(0))).toBe('02 00')
    expect(toHex(encodeHeadwindSetSpeed(100))).toBe('02 64')
    expect(toHex(encodeHeadwindSetSpeed(42.6))).toBe('02 2b') // rounds to 43
    expect(toHex(encodeHeadwindSetSpeed(150))).toBe('02 64') // clamps to 100
    expect(toHex(encodeHeadwindSetSpeed(-5))).toBe('02 00')
    expect(() => encodeHeadwindSetSpeed(Number.NaN)).toThrow(CodecError)
  })

  it('set mode: [0x04, code], codes 1-9 in HEADWIND_MODES order', () => {
    expect(toHex(encodeHeadwindSetMode('manual'))).toBe('04 04') // captured
    expect(toHex(encodeHeadwindSetMode('off'))).toBe('04 01') // captured
    expect(toHex(encodeHeadwindSetMode('hr'))).toBe('04 02') // captured
    expect(HEADWIND_MODES).toEqual(['off', 'hr', 'speed', 'manual', 'standby', 'coreTemp', 'runSpeed', 'power', 'hybrid'])
    HEADWIND_MODES.forEach((mode, i) => expect(Array.from(encodeHeadwindSetMode(mode))).toEqual([0x04, i + 1]))
  })
})

describe('parseHeadwindEvent', () => {
  it('parses state events [0xFD, 0x01, speed, mode]', () => {
    expect(event('fd 01 19 04')).toEqual({ speedPct: 25, mode: 'manual' }) // captured: manual resumes at 25 %
    expect(event('fd 01 1e 04')).toEqual({ speedPct: 30, mode: 'manual' }) // captured
    expect(event('fd 01 00 01')).toEqual({ speedPct: 0, mode: 'off' }) // captured
    expect(event('fd 01 00 02')).toEqual({ speedPct: 0, mode: 'hr' }) // captured
    expect(event('fd 01 64 09')).toEqual({ speedPct: 100, mode: 'hybrid' })
  })

  it('maps mode 0 (the app\'s "error") and unknown codes to "unknown"', () => {
    expect(event('fd 01 32 00')).toEqual({ speedPct: 50, mode: 'unknown' })
    expect(event('fd 01 32 0a')).toEqual({ speedPct: 50, mode: 'unknown' })
  })

  it('returns null for other notifications', () => {
    expect(event('fd 02 01 01 00 02 ff 04 ff 08 00 10')).toBeNull() // captured: paired sensors
    expect(event('fe 04 01 04')).toBeNull() // captured: set-mode acknowledgement
    expect(event('fe 02 01 1e')).toBeNull() // captured: set-speed acknowledgement
  })

  it('throws when a state event is truncated', () => {
    expect(() => event('fd 01 19')).toThrow(CodecError)
    expect(() => event('fd')).toThrow(CodecError)
    expect(() => event('')).toThrow(CodecError)
  })

  it('round-trips encodeHeadwindEvent', () => {
    expect(toHex(encodeHeadwindEvent({ speedPct: 25, mode: 'manual' }))).toBe('fd 01 19 04')
    for (const mode of HEADWIND_MODES) {
      expect(parseHeadwindEvent(toDataView(encodeHeadwindEvent({ speedPct: 55, mode })))).toEqual({ speedPct: 55, mode })
    }
  })
})

describe('decodeHeadwindCommand (simulated fan)', () => {
  it('decodes set speed and set mode', () => {
    expect(decodeHeadwindCommand(fromHex('02 1e'))).toEqual({ op: 'setSpeed', pct: 30 })
    expect(decodeHeadwindCommand(fromHex('04 04'))).toEqual({ op: 'setMode', mode: 'manual' })
    expect(decodeHeadwindCommand(fromHex('04 00'))).toEqual({ op: 'setMode', mode: 'unknown' })
  })

  it('returns null for other op codes and throws when truncated', () => {
    expect(decodeHeadwindCommand(fromHex('01'))).toBeNull() // get speed
    expect(decodeHeadwindCommand(fromHex('03'))).toBeNull() // get mode
    expect(() => decodeHeadwindCommand(fromHex('04'))).toThrow(CodecError)
    expect(() => decodeHeadwindCommand(fromHex('02'))).toThrow(CodecError)
    expect(() => decodeHeadwindCommand(fromHex(''))).toThrow(CodecError)
  })
})
