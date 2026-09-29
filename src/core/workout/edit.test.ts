import { describe, expect, it } from 'vitest'
import { compileWorkout } from './compile'
import {
  duplicateSegment,
  insertSegment,
  moveSegment,
  newSegment,
  newWorkout,
  removeSegment,
  replaceSegment,
  segmentDurationS,
  snapDuration,
  snapPower,
  workoutDurationS,
  type PaletteItem,
} from './edit'
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
