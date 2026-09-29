// Wahoo KICKR Headwind fan, control point a026e038-0a7d-4ab3-97fa-f1500f9feb8b
// (write without response + notify). Unpublished protocol; the byte layouts
// follow the notes in amasolov/wahoo-headwind-ble (MIT, docs/PROTOCOL.md),
// which were verified on a real fan.
//
//   write  [0x02, speed 0-100]   set speed (only acted on in manual mode)
//   write  [0x04, mode]          set mode
//   notify [0xFD, 0x01, speed, mode]  state event, also repeated about once a second
// Other notifications ([0xFD, 0x02, ...] paired sensors, [0xFE, op, status, ...]
// command responses) are not state events.

import { ByteReader, ByteWriter } from './bytes'

/** Fan modes; the wire code is the index + 1 (0 is the app's "error" state). */
export const HEADWIND_MODES = ['off', 'hr', 'speed', 'manual', 'standby', 'coreTemp', 'runSpeed', 'power', 'hybrid'] as const

export type HeadwindMode = (typeof HEADWIND_MODES)[number]

const SET_SPEED = 0x02
const SET_MODE = 0x04
const EVENT = 0xfd
const EVENT_STATE = 0x01

function modeCode(mode: HeadwindMode): number {
  return HEADWIND_MODES.indexOf(mode) + 1
}

function modeName(code: number): HeadwindMode | 'unknown' {
  return HEADWIND_MODES[code - 1] ?? 'unknown'
}

/** Fan speed in % (rounded, clamped to 0-100). The fan only follows it in 'manual' mode. */
export function encodeHeadwindSetSpeed(pct: number): Uint8Array {
  return new ByteWriter().uint8(SET_SPEED).uint8(Math.min(100, pct), 'pct').toBytes()
}

export function encodeHeadwindSetMode(mode: HeadwindMode): Uint8Array {
  return Uint8Array.of(SET_MODE, modeCode(mode))
}

export interface HeadwindEvent {
  speedPct: number
  mode: HeadwindMode | 'unknown'
}

/** Parses a state event; returns null for any other notification. */
export function parseHeadwindEvent(dv: DataView): HeadwindEvent | null {
  const r = new ByteReader(dv, 'Headwind notification')
  if (r.uint8('packet type') !== EVENT) return null
  if (r.uint8('event type') !== EVENT_STATE) return null
  return { speedPct: r.uint8('speed'), mode: modeName(r.uint8('mode')) }
}

/** Encodes a state event (for the simulated fan). */
export function encodeHeadwindEvent(e: { speedPct: number; mode: HeadwindMode }): Uint8Array {
  return new ByteWriter().uint8(EVENT).uint8(EVENT_STATE).uint8(e.speedPct, 'speedPct').uint8(modeCode(e.mode)).toBytes()
}

export type HeadwindCommand = { op: 'setSpeed'; pct: number } | { op: 'setMode'; mode: HeadwindMode | 'unknown' }

/** Decodes what a client wrote, for the simulated fan. Null for other op codes. */
export function decodeHeadwindCommand(dv: DataView): HeadwindCommand | null {
  const r = new ByteReader(dv, 'Headwind control point')
  const op = r.uint8('op code')
  if (op === SET_SPEED) return { op: 'setSpeed', pct: r.uint8('speed') }
  if (op === SET_MODE) return { op: 'setMode', mode: modeName(r.uint8('mode')) }
  return null
}
