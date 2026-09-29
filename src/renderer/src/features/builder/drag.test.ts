import { describe, expect, it } from 'vitest'
import { insertSegment, newSegment, newWorkout, type PaletteItem } from '@core/workout/edit'
import type { Segment, Workout } from '@core/workout/model'
import { dragTo, MAX_DRAG_FRAC, type DragOrigin } from './drag'
import { xAt, yAt, type Frame } from './layout'

const build = (...items: (PaletteItem | Segment)[]): Workout =>
  items.reduce<Workout>((w, it) => insertSegment(w, w.segments.length, typeof it === 'string' ? newSegment(it) : it), newWorkout('user:t'))

// 0.5 px per second, 250 px per 100 % FTP.
const FRAME: Frame = { width: 46 + 900 + 14, height: 18 + 400 + 24, scale: { spanS: 1800, topFrac: 1.6 } }

const origin = (base: Workout, index: number, grab: DragOrigin['grab'], segmentStartS = 0, grabDx = 0, grabDy = 0): DragOrigin => ({ index, grab, base, segmentStartS, frame: FRAME, grabDx, grabDy })
const seg = (w: Workout, i = 0) => w.segments[i] as Segment

describe('builder drags', () => {
  it('drags a right edge to a duration snapped to 5 s, or 1 s with Alt', () => {
    const base = build('z2', 'z4')
    const o = origin(base, 1, { kind: 'duration' }, 600)
    const px = xAt(FRAME, 600 + 333)
    expect(seg(dragTo(o, px, 0, false, 200), 1)).toMatchObject({ durationS: 335 })
    expect(seg(dragTo(o, px, 0, true, 200), 1)).toMatchObject({ durationS: 333 })
    // The first block is untouched, and never shrinks below one snap step.
    expect(seg(dragTo(o, px, 0, false, 200), 0)).toBe(seg(base, 0))
    expect(seg(dragTo(o, xAt(FRAME, 0), 0, false, 200), 1)).toMatchObject({ durationS: 5 })
  })

  it('returns the base workout itself when the snapped value is unchanged', () => {
    const base = build('z2')
    expect(dragTo(origin(base, 0, { kind: 'duration' }), xAt(FRAME, 601), 0, false, 200)).toBe(base)
    expect(dragTo(origin(base, 0, { kind: 'power', field: 'power' }), 0, yAt(FRAME, 0.662), false, 200)).toBe(base)
  })

  it('drags a top edge to power snapped to 1 % FTP, capped at 400 %', () => {
    const base = build('z2')
    expect(seg(dragTo(origin(base, 0, { kind: 'power', field: 'power' }), 0, yAt(FRAME, 0.873), false, 200))).toMatchObject({ power: { unit: 'ftp', value: 0.87 } })
    expect(seg(dragTo(origin(base, 0, { kind: 'power', field: 'power' }), 0, -5000, false, 200))).toMatchObject({ power: { value: MAX_DRAG_FRAC } })
    expect(seg(dragTo(origin(base, 0, { kind: 'power', field: 'power' }), 0, FRAME.height + 100, false, 200))).toMatchObject({ power: { value: 0 } })
  })

  it('keeps absolute-watt targets in whole watts', () => {
    const base = build({ kind: 'steady', durationS: 300, power: { unit: 'watts', value: 200 } })
    expect(seg(dragTo(origin(base, 0, { kind: 'power', field: 'power' }), 0, yAt(FRAME, 0.9), false, 250))).toMatchObject({ power: { unit: 'watts', value: 225 } })
  })

  it('drags a ramp start and end separately', () => {
    const base = build('warmup')
    expect(seg(dragTo(origin(base, 0, { kind: 'power', field: 'from' }), 0, yAt(FRAME, 0.5), false, 200))).toMatchObject({ from: { value: 0.5 }, to: { value: 0.75 } })
    expect(seg(dragTo(origin(base, 0, { kind: 'power', field: 'to' }), 0, yAt(FRAME, 0.9), false, 200))).toMatchObject({ from: { value: 0.45 }, to: { value: 0.9 } })
  })

  it('drags interval halves for every rep, keeping the grabbed edge under the pointer', () => {
    const base = build('intervals') // 4 × (3:00 on / 3:00 off)
    // Rep 1's on edge sits at 1 × (on + off) + on: dropping it at 580 s makes on = 200 s.
    const on = seg(dragTo(origin(base, 0, { kind: 'part', part: 'on', rep: 1 }), xAt(FRAME, 580), 0, false, 200))
    expect(on).toMatchObject({ on: { durationS: 200 }, off: { durationS: 180 }, repeat: 4 })
    // Rep 0's off edge sits at on + off: dropping it at 330 s makes off = 150 s.
    const off = seg(dragTo(origin(base, 0, { kind: 'part', part: 'off', rep: 0 }), xAt(FRAME, 330), 0, false, 200))
    expect(off).toMatchObject({ on: { durationS: 180 }, off: { durationS: 150 } })
    // Power handles move every rep's half at once.
    expect(seg(dragTo(origin(base, 0, { kind: 'power', field: 'on' }), 0, yAt(FRAME, 1.2), false, 200))).toMatchObject({ on: { power: { value: 1.2 } }, off: { power: { value: 0.5 } } })
  })

  it('moves a handle by the pointer travel, not onto the pointer, when grabbed a little off it', () => {
    const base = build('z2')
    // Grabbed 4 px right of the edge (600 s) and dragged 50 px (100 s) further right: 700 s, not 708 s.
    const d = dragTo(origin(base, 0, { kind: 'duration' }, 0, 4, 0), xAt(FRAME, 600) + 4 + 50, 0, false, 200)
    expect(seg(d)).toMatchObject({ durationS: 700 })
    // Grabbed 3 px below the top (66 %), dragged 25 px (10 %) up: 76 %.
    const p = dragTo(origin(base, 0, { kind: 'power', field: 'power' }, 0, 0, 3), 0, yAt(FRAME, 0.66) + 3 - 25, false, 200)
    expect(seg(p)).toMatchObject({ power: { value: 0.76 } })
  })

  it('ignores handles that do not fit the segment', () => {
    const base = build('freeride')
    expect(dragTo(origin(base, 0, { kind: 'power', field: 'power' }), 0, yAt(FRAME, 1), false, 200)).toBe(base)
    expect(dragTo(origin(base, 0, { kind: 'part', part: 'on', rep: 0 }), xAt(FRAME, 100), 0, false, 200)).toBe(base)
    expect(dragTo(origin(base, 3, { kind: 'duration' }), xAt(FRAME, 100), 0, false, 200)).toBe(base)
  })
})
