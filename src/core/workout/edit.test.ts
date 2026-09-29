import { describe, expect, it } from 'vitest'
import { compileWorkout } from './compile'
import {
  durationAt,
  duplicateSegment,
  insertionIndex,
  insertSegment,
  moveSegment,
  moveSegmentToGap,
  newSegment,
  newWorkout,
  powerAt,
  removeSegment,
  replaceSegment,
  retarget,
  segmentDurationS,
  segmentStartsS,
  snapDuration,
  snapPower,
  withDuration,
  withPower,
  workoutDurationS,
  type PaletteItem,
} from './edit'
import type { Segment } from './model'
import { toZwo, parseZwo } from './io/zwo'
import { diffTimelines } from './compile'

const ITEMS: PaletteItem[] = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'warmup', 'cooldown', 'ramp', 'intervals', 'freeride', 'maxeffort']

describe('builder edits', () => {
  it('every palette block compiles and survives a ZWO round trip', () => {
    let w = newWorkout('user:test')
    for (const item of ITEMS) w = insertSegment(w, w.segments.length, newSegment(item))
    const tl = compileWorkout(w)
    expect(tl.durationS).toBe(workoutDurationS(w))
    expect(diffTimelines(compileWorkout(parseZwo(toZwo(w))), tl)).toBeNull()
    expect(newSegment('cooldown')).toMatchObject({ role: 'cooldown', from: { value: 0.7 }, to: { value: 0.45 } })
  })

  it('inserts, moves, duplicates and removes without mutating the input', () => {
    const a = insertSegment(insertSegment(newWorkout('x'), 0, newSegment('z2')), 1, newSegment('z4'))
    const frozen = structuredClone(a)
    const b = insertSegment(a, 1, newSegment('intervals'))
    expect(b.segments.map((s) => s.kind)).toEqual(['steady', 'intervals', 'steady'])
    expect(moveSegment(b, 0, 2).segments.map((s) => s.kind)).toEqual(['intervals', 'steady', 'steady'])
    expect(moveSegment(b, 2, 0).segments[0]).toBe(b.segments[2])
    const d = duplicateSegment(b, 1)
    expect(d.segments).toHaveLength(4)
    expect(d.segments[2]).toEqual(d.segments[1])
    expect(d.segments[2]).not.toBe(d.segments[1])
    expect(removeSegment(b, 1).segments.map((s) => s.kind)).toEqual(['steady', 'steady'])
    expect(replaceSegment(b, 0, newSegment('maxeffort')).segments[0]!.kind).toBe('maxeffort')
    expect(a).toEqual(frozen)
    // Out-of-range operations are no-ops.
    expect(removeSegment(a, 9)).toBe(a)
    expect(moveSegment(a, 5, 0)).toBe(a)
  })

  it('counts every interval rep in durations', () => {
    expect(segmentDurationS(newSegment('intervals'))).toBe(4 * 360)
  })

  it('snaps power to whole percent and durations to 5 s', () => {
    expect(snapPower({ unit: 'ftp', value: 1 }, 1.0349)).toEqual({ unit: 'ftp', value: 1.03 })
    expect(snapPower({ unit: 'watts', value: 200 }, 212.6)).toEqual({ unit: 'watts', value: 213 })
    expect(snapPower({ unit: 'ftp', value: 1 }, -0.2).value).toBe(0)
    expect(snapDuration(92)).toBe(90)
    expect(snapDuration(1)).toBe(5)
    expect(snapDuration(61, 1)).toBe(61)
  })
})

describe('builder helpers', () => {
  const three = () => ['z2', 'intervals', 'z4'].reduce((w, item) => insertSegment(w, w.segments.length, newSegment(item as PaletteItem)), newWorkout('x'))

  it('knows where each segment starts', () => {
    expect(segmentStartsS(three())).toEqual([0, 600, 600 + 4 * 360])
    expect(segmentStartsS(newWorkout('x'))).toEqual([])
  })

  it('inserts after the selection, or at the end without one', () => {
    const w = three()
    expect(insertionIndex(w, 0)).toBe(1)
    expect(insertionIndex(w, 2)).toBe(3)
    expect(insertionIndex(w, null)).toBe(3)
    expect(insertionIndex(w, 7)).toBe(3)
  })

  it('moves a segment into a gap and reports where it landed', () => {
    const w = three()
    const kinds = (x: typeof w) => x.segments.map((s) => s.kind + (s.kind === 'steady' ? s.power.value : ''))
    // Gap 3 is after the last segment: the first one moves to the end.
    const a = moveSegmentToGap(w, 0, 3)
    expect(a.index).toBe(2)
    expect(kinds(a.workout)).toEqual(['intervals', 'steady0.98', 'steady0.66'])
    // Gap 0 is before the first: the last one moves to the front.
    const b = moveSegmentToGap(w, 2, 0)
    expect(b.index).toBe(0)
    expect(kinds(b.workout)).toEqual(['steady0.98', 'steady0.66', 'intervals'])
    // The gaps on either side of a segment leave it where it is.
    expect(moveSegmentToGap(w, 1, 1)).toEqual({ workout: w, index: 1 })
    expect(moveSegmentToGap(w, 1, 2).workout).toBe(w)
    expect(moveSegmentToGap(w, 9, 0).workout).toBe(w)
  })

  it('retargets power, keeping the unit and moving a range with it', () => {
    expect(retarget({ unit: 'ftp', value: 0.9 }, 0.95)).toEqual({ unit: 'ftp', value: 0.95 })
    expect(retarget({ unit: 'watts', value: 200 }, 230)).toEqual({ unit: 'watts', value: 230 })
    expect(retarget({ unit: 'ftp', value: 1, low: 0.95, high: 1.05 }, 1.03)).toEqual({ unit: 'ftp', value: 1.03, low: 0.98, high: 1.08 })
    expect(retarget({ unit: 'ftp', value: 0.1, low: 0.05, high: 0.15 }, 0)).toEqual({ unit: 'ftp', value: 0, low: 0, high: 0.05 })
    expect(retarget({ unit: 'ftp', value: 0.5 }, -1).value).toBe(0)
  })

  it('reads and writes the power fields each kind has', () => {
    const steady = newSegment('z3')
    const ramp = newSegment('warmup')
    const intervals = newSegment('intervals')
    const free = newSegment('freeride')
    expect(powerAt(steady, 'power')?.value).toBe(0.83)
    expect(powerAt(steady, 'from')).toBeNull()
    expect(powerAt(ramp, 'to')?.value).toBe(0.75)
    expect(powerAt(intervals, 'off')?.value).toBe(0.5)
    expect(powerAt(free, 'power')).toBeNull()

    expect(withPower(steady, 'power', 0.88)).toMatchObject({ kind: 'steady', power: { unit: 'ftp', value: 0.88 } })
    expect(withPower(ramp, 'from', 0.5)).toMatchObject({ from: { value: 0.5 }, to: { value: 0.75 } })
    expect(withPower(ramp, 'to', 0.8)).toMatchObject({ from: { value: 0.45 }, to: { value: 0.8 } })
    expect(withPower(intervals, 'on', 1.2)).toMatchObject({ on: { power: { value: 1.2 } }, off: { power: { value: 0.5 } } })
    expect(withPower(intervals, 'off', 0.4)).toMatchObject({ on: { power: { value: 1.1 } }, off: { power: { value: 0.4 } } })
    // Fields a kind doesn't have leave the segment untouched (same object).
    expect(withPower(free, 'power', 1)).toBe(free)
    expect(withPower(steady, 'on', 1)).toBe(steady)
  })

  it('reads and writes durations, per interval half for intervals', () => {
    const steady = newSegment('z2')
    const intervals = newSegment('intervals') as Extract<Segment, { kind: 'intervals' }>
    expect(durationAt(steady, 'duration')).toBe(600)
    expect(durationAt(steady, 'on')).toBeNull()
    expect(durationAt(intervals, 'on')).toBe(180)
    expect(durationAt(intervals, 'duration')).toBeNull()
    expect(withDuration(steady, 'duration', 420)).toMatchObject({ durationS: 420 })
    const shorter = withDuration(intervals, 'off', 60)
    expect(shorter).toMatchObject({ on: { durationS: 180 }, off: { durationS: 60 } })
    expect(segmentDurationS(shorter)).toBe(4 * 240)
    expect(withDuration(intervals, 'duration', 5)).toBe(intervals)
    expect(withDuration(steady, 'off', 5)).toBe(steady)
    // Inputs are never mutated.
    expect(intervals.off.durationS).toBe(180)
  })
})
