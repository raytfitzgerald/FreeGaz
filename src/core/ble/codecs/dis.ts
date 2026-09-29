// Device Information (0x180A) strings and Battery Level (0x2A19).

import { ByteReader, CodecError } from './bytes'

/**
 * Decodes a Device Information string (manufacturer, model, firmware...).
 * Some devices pad to a fixed length with NULs, sometimes followed by stale
 * bytes, so decoding stops at the first NUL. Invalid UTF-8 becomes U+FFFD.
 */
export function decodeUtf8String(dv: DataView): string {
  const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)
  const nul = bytes.indexOf(0)
  return new TextDecoder('utf-8').decode(nul === -1 ? bytes : bytes.subarray(0, nul))
}

export function encodeUtf8String(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/** Battery Level, 0-100 %. Values 101-255 are reserved (some devices send 0xFF for "unknown"), so they throw. */
export function parseBatteryLevel(dv: DataView): number {
  const level = new ByteReader(dv, 'Battery Level').uint8('battery level')
  if (level > 100) throw new CodecError(`Battery Level: ${level} is outside 0-100 (reserved value)`)
  return level
}

export function encodeBatteryLevel(pct: number): Uint8Array {
  if (!Number.isFinite(pct)) throw new CodecError(`Battery Level: cannot encode ${pct}`)
  return Uint8Array.of(Math.min(100, Math.max(0, Math.round(pct))))
}
