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

// --- builder helpers: selection, reordering, targeted power/duration edits ---

/** Start time (s) of every segment, in order. */
export function segmentStartsS(w: Workout): number[] {
  const out: number[] = []
  let t = 0
  for (const seg of w.segments) {
    out.push(t)
    t += segmentDurationS(seg)
  }
  return out
}

/** Where a new block goes: right after the selected segment, or at the end. */
export function insertionIndex(w: Workout, selected: number | null): number {
  return selected === null || selected < 0 || selected >= w.segments.length ? w.segments.length : selected + 1
}

/**
 * Moves the segment at `from` into the gap before `gap` (0..length, as a drop
 * indicator shows it). Returns the segment's new index; dropping it next to
 * itself is a no-op that returns the same workout.
 */
export function moveSegmentToGap(w: Workout, from: number, gap: number): { workout: Workout; index: number } {
  if (from < 0 || from >= w.segments.length) return { workout: w, index: from }
  const g = clampIndex(gap, w.segments.length)
  const to = g > from ? g - 1 : g
  return to === from ? { workout: w, index: from } : { workout: moveSegment(w, from, to), index: to }
}

/**
 * A power target with a new value, keeping its unit. A low/high range moves
 * with the value (same width, never below 0): an imported "95-105%" block
 * (value 100 %) set to 103 % becomes "98-108%".
 */
export function retarget(p: PowerTarget, value: number): PowerTarget {
  const v = Math.max(0, value)
  const out: PowerTarget = { unit: p.unit, value: v }
  if (p.low !== undefined && p.high !== undefined && Number.isFinite(p.low) && Number.isFinite(p.high)) {
    const d = v - p.value
    out.low = round4(Math.max(0, p.low + d))
    out.high = round4(Math.max(0, p.high + d))
  }
  return out
}

/** A power target inside a segment: steady `power`, ramp `from`/`to`, interval `on`/`off`. */
export type PowerField = 'power' | 'from' | 'to' | 'on' | 'off'

/** The target a field names, or null when the segment has none there (free ride, max effort, wrong kind). */
export function powerAt(seg: Segment, field: PowerField): PowerTarget | null {
  switch (seg.kind) {
    case 'steady':
      return field === 'power' ? seg.power : null
    case 'ramp':
      return field === 'from' ? seg.from : field === 'to' ? seg.to : null
    case 'intervals':
      return field === 'on' ? seg.on.power : field === 'off' ? seg.off.power : null
    case 'freeride':
    case 'maxeffort':
      return null
  }
}

/** Sets one power target's value (see retarget); segments without that target come back unchanged. */
export function withPower(seg: Segment, field: PowerField, value: number): Segment {
  const p = powerAt(seg, field)
  if (!p) return seg
  const next = retarget(p, value)
  switch (seg.kind) {
    case 'steady':
      return { ...seg, power: next }
    case 'ramp':
      return field === 'from' ? { ...seg, from: next } : { ...seg, to: next }
    case 'intervals':
      return field === 'on' ? { ...seg, on: { ...seg.on, power: next } } : { ...seg, off: { ...seg.off, power: next } }
    default:
      return seg
  }
}

/** A duration inside a segment: the whole segment, or one half of every interval rep. */
export type DurationField = 'duration' | 'on' | 'off'

export function durationAt(seg: Segment, field: DurationField): number | null {
  if (seg.kind === 'intervals') return field === 'on' ? seg.on.durationS : field === 'off' ? seg.off.durationS : null
  return field === 'duration' ? seg.durationS : null
}

/** Sets a duration (seconds, taken as given); fields the segment lacks leave it unchanged. */
export function withDuration(seg: Segment, field: DurationField, durationS: number): Segment {
  if (seg.kind === 'intervals') {
    if (field === 'on') return { ...seg, on: { ...seg.on, durationS } }
    if (field === 'off') return { ...seg, off: { ...seg.off, durationS } }
    return seg
  }
  return field === 'duration' ? { ...seg, durationS } : seg
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4
}
