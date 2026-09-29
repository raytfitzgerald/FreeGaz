// Pure editing operations for the workout builder. Every function returns a
// new Workout (inputs are never mutated), so undo/redo is just a stack.
import type { PowerTarget, Segment, Workout } from './model'

export type PaletteItem = 'z1' | 'z2' | 'z3' | 'z4' | 'z5' | 'z6' | 'warmup' | 'cooldown' | 'ramp' | 'intervals' | 'freeride' | 'maxeffort'

const ftp = (value: number): PowerTarget => ({ unit: 'ftp', value })

/** Steady-block defaults per Coggan zone (power at the zone's middle, a sensible length). */
export const ZONE_BLOCKS: readonly { power: number; durationS: number }[] = [
  { power: 0.5, durationS: 600 },
  { power: 0.66, durationS: 600 },
  { power: 0.83, durationS: 600 },
  { power: 0.98, durationS: 480 },
  { power: 1.13, durationS: 180 },
  { power: 1.35, durationS: 60 },
]

export function newSegment(item: PaletteItem): Segment {
  switch (item) {
    case 'warmup':
      return { kind: 'ramp', role: 'warmup', durationS: 600, from: ftp(0.45), to: ftp(0.75) }
    case 'cooldown':
      return { kind: 'ramp', role: 'cooldown', durationS: 600, from: ftp(0.7), to: ftp(0.45) }
    case 'ramp':
      return { kind: 'ramp', role: 'ramp', durationS: 300, from: ftp(0.6), to: ftp(0.9) }
    case 'intervals':
      return { kind: 'intervals', repeat: 4, on: { durationS: 180, power: ftp(1.1) }, off: { durationS: 180, power: ftp(0.5) } }
    case 'freeride':
      return { kind: 'freeride', durationS: 600, flatRoad: true }
    case 'maxeffort':
      return { kind: 'maxeffort', durationS: 30 }
    default: {
      const z = ZONE_BLOCKS[Number(item.slice(1)) - 1]!
      return { kind: 'steady', durationS: z.durationS, power: ftp(z.power) }
    }
  }
}

export function newWorkout(id: string): Workout {
  return { id, name: 'New workout', tags: [], sportType: 'bike', segments: [], source: 'user' }
}

const withSegments = (w: Workout, segments: Segment[]): Workout => ({ ...w, segments })

/** Inserts at `index` (clamped); index = segments.length appends. */
export function insertSegment(w: Workout, index: number, seg: Segment): Workout {
  const i = clampIndex(index, w.segments.length)
  return withSegments(w, [...w.segments.slice(0, i), seg, ...w.segments.slice(i)])
}

export function removeSegment(w: Workout, index: number): Workout {
  if (index < 0 || index >= w.segments.length) return w
  return withSegments(w, w.segments.filter((_, i) => i !== index))
}

export function duplicateSegment(w: Workout, index: number): Workout {
  const seg = w.segments[index]
  return seg ? insertSegment(w, index + 1, structuredClone(seg)) : w
}

/** Moves the segment at `from` so it ends up at index `to`. */
export function moveSegment(w: Workout, from: number, to: number): Workout {
  const seg = w.segments[from]
  if (!seg) return w
  const rest = w.segments.filter((_, i) => i !== from)
  const t = clampIndex(to, rest.length)
  if (t === from) return w
  return withSegments(w, [...rest.slice(0, t), seg, ...rest.slice(t)])
}

export function replaceSegment(w: Workout, index: number, seg: Segment): Workout {
  if (index < 0 || index >= w.segments.length) return w
  return withSegments(w, w.segments.map((s, i) => (i === index ? seg : s)))
}

/** Total length of a segment (intervals count every rep). */
export function segmentDurationS(seg: Segment): number {
  return seg.kind === 'intervals' ? seg.repeat * (seg.on.durationS + seg.off.durationS) : seg.durationS
}

export function workoutDurationS(w: Workout): number {
  return w.segments.reduce((a, s) => a + segmentDurationS(s), 0)
}

/** Power snapped to whole percent of FTP (or whole watts), never below 0. */
export function snapPower(p: PowerTarget, value: number): PowerTarget {
  const v = p.unit === 'ftp' ? Math.round(Math.max(0, value) * 100) / 100 : Math.round(Math.max(0, value))
  return { unit: p.unit, value: v }
}

/** Durations snap to `step` seconds and never go below `min`. */
export function snapDuration(s: number, step = 5, min = 5): number {
  return Math.max(min, Math.round(s / step) * step)
}

function clampIndex(i: number, len: number): number {
  return Math.max(0, Math.min(len, Math.round(i)))
}
