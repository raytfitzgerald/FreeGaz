import { describe, expect, it } from 'vitest'
import { insertSegment, newSegment, newWorkout, type PaletteItem } from '@core/workout/edit'
import type { Segment, Workout } from '@core/workout/model'
import {
  autoScale,
  dragScale,
  dropGap,
  FREE_FRAC,
  gapTimeS,
  hitTest,
  layoutSegments,
  MAX_FRAC,
  MIN_SPAN_S,
  MIN_TOP_FRAC,
  powerTicks,
  timeTicks,
  xAt,
  yAt,
  type Frame,
} from './layout'

const build = (...items: (PaletteItem | Segment)[]): Workout =>
  items.reduce<Workout>((w, it) => insertSegment(w, w.segments.length, typeof it === 'string' ? newSegment(it) : it), newWorkout('user:t'))

// 900 px × 400 px plot: 0.5 px per second over 30 min, 250 px per 100 % FTP.
const FRAME: Frame = { width: 46 + 900 + 14, height: 18 + 400 + 24, scale: { spanS: 1800, topFrac: 1.6 } }

describe('builder canvas layout', () => {
  it('lays segments out end to end, interval reps one by one', () => {
    const boxes = layoutSegments(build('z2', 'warmup', 'intervals'), 200)
    expect(boxes.map((b) => [b.startS, b.endS])).toEqual([
      [0, 600],
      [600, 1200],
      [1200, 2640],
    ])
    const reps = boxes[2]!.pieces
    expect(reps).toHaveLength(8)
    expect(reps.map((p) => `${p.kind}${p.rep}`)).toEqual(['on0', 'off0', 'on1', 'off1', 'on2', 'off2', 'on3', 'off3'])
    expect(reps[2]).toMatchObject({ startS: 1560, endS: 1740, from: 1.1, to: 1.1 })
    expect(boxes[1]!.pieces[0]).toMatchObject({ kind: 'ramp', from: 0.45, to: 0.75 })
    expect(boxes[2]!.top).toBe(1.1)
  })

  it('draws watt targets through the FTP, and ERG-off blocks at their assumed power', () => {
    const boxes = layoutSegments(build({ kind: 'steady', durationS: 60, power: { unit: 'watts', value: 220 } }, 'freeride', 'maxeffort'), 200)
    expect(boxes.map((b) => b.top)).toEqual([1.1, FREE_FRAC, MAX_FRAC])
  })

  it('skips pieces without a positive duration', () => {
    const boxes = layoutSegments(build({ kind: 'steady', durationS: 0, power: { unit: 'ftp', value: 1 } }, 'z1'), 200)
    expect(boxes[0]).toMatchObject({ startS: 0, endS: 0, pieces: [] })
    expect(boxes[1]).toMatchObject({ startS: 0, endS: 600 })
  })

  it('scales to the workout with headroom, but never below the minimum span and height', () => {
    expect(autoScale(layoutSegments(build('z2'), 200))).toEqual({ spanS: MIN_SPAN_S, topFrac: MIN_TOP_FRAC })
    const long = autoScale(layoutSegments(build('z2', 'warmup', 'intervals', { kind: 'steady', durationS: 60, power: { unit: 'ftp', value: 2 } }), 200))
    expect(long.spanS).toBeCloseTo(2700 * 1.1)
    expect(long.topFrac).toBeCloseTo(2 * 1.15)
    // While dragging, the frozen scale only grows to keep the preview in view.
    expect(dragScale({ spanS: 1800, topFrac: 1.6 }, layoutSegments(build('z2'), 200))).toEqual({ spanS: 1800, topFrac: 1.6 })
    const grown = dragScale({ spanS: 1800, topFrac: 1.6 }, layoutSegments(build('z2', 'z2', 'z2', 'z2'), 200))
    expect(grown.spanS).toBe(2400)
  })

  describe('hit testing', () => {
    const boxes = layoutSegments(build('z2', 'z4'), 200)
    const hit = (s: number, frac: number) => hitTest(FRAME, boxes, xAt(FRAME, s), yAt(FRAME, frac))

    it('finds bodies, including the empty column above a low block', () => {
      expect(hit(300, 0.3)).toMatchObject({ index: 0, grab: { kind: 'body' } })
      expect(hit(300, 1.4)).toMatchObject({ index: 0, grab: { kind: 'body' } })
      expect(hit(900, 0.2)).toMatchObject({ index: 1, grab: { kind: 'body' } })
    })

    it('grabs the top edge for power and the right edge for duration', () => {
      expect(hit(300, 0.66)).toMatchObject({ index: 0, grab: { kind: 'power', field: 'power' } })
      // 5 px from the edge is within reach, from either side; the edge beats the neighbour's body.
      expect(hitTest(FRAME, boxes, xAt(FRAME, 600) - 5, yAt(FRAME, 0.3))).toMatchObject({ index: 0, grab: { kind: 'duration' } })
      expect(hitTest(FRAME, boxes, xAt(FRAME, 600) + 5, yAt(FRAME, 0.3))).toMatchObject({ index: 0, grab: { kind: 'duration' } })
      // Above the block's top, the edge isn't there: the neighbour's column is.
      expect(hitTest(FRAME, boxes, xAt(FRAME, 600) + 5, yAt(FRAME, 0.9))).toMatchObject({ index: 1, grab: { kind: 'body' } })
      // The last block's edge can be grabbed from the headroom after it.
      expect(hitTest(FRAME, boxes, xAt(FRAME, 1080) + 4, yAt(FRAME, 0.5))).toMatchObject({ index: 1, grab: { kind: 'duration' } })
    })

    it('misses outside the blocks', () => {
      expect(hit(1500, 0.5)).toBeNull()
      expect(hitTest(FRAME, boxes, 200, FRAME.height - 2)).toBeNull()
    })

    it('gives ramps a start and an end handle', () => {
      const ramp = layoutSegments(build('warmup'), 200)
      const at = (s: number) => hitTest(FRAME, ramp, xAt(FRAME, s), yAt(FRAME, 0.45 + 0.3 * (s / 600)))
      expect(at(100)).toMatchObject({ grab: { kind: 'power', field: 'from' } })
      expect(at(500)).toMatchObject({ grab: { kind: 'power', field: 'to' } })
    })

    it('gives every interval half its power and duration handles', () => {
      const iv = layoutSegments(build('intervals'), 200)
      const at = (s: number, frac: number) => hitTest(FRAME, iv, xAt(FRAME, s), yAt(FRAME, frac))
      expect(at(90, 1.1)).toMatchObject({ grab: { kind: 'power', field: 'on' } })
      expect(at(900 + 90, 0.5)).toMatchObject({ grab: { kind: 'power', field: 'off' } })
      expect(at(540, 0.2)).toMatchObject({ grab: { kind: 'part', part: 'on', rep: 1 } })
      expect(at(1440, 0.2)).toMatchObject({ grab: { kind: 'part', part: 'off', rep: 3 } })
      expect(at(1000, 0.2)).toMatchObject({ grab: { kind: 'body' }, piece: { kind: 'off', rep: 2 } })
    })

    it('keeps narrow blocks grabbable: edge zones reach a third into each side', () => {
      // A 10 s sprint is 5 px wide here, between two wide blocks.
      const narrow = layoutSegments(build('z2', { kind: 'steady', durationS: 10, power: { unit: 'ftp', value: 1.3 } }, 'z2'), 200)
      const at = (s: number, frac: number) => hitTest(FRAME, narrow, xAt(FRAME, s), yAt(FRAME, frac))
      expect(at(605, 0.5)).toMatchObject({ index: 1, grab: { kind: 'body' } })
      expect(at(610, 0.3)).toMatchObject({ index: 1, grab: { kind: 'duration' } })
      expect(at(600, 0.3)).toMatchObject({ index: 0, grab: { kind: 'duration' } })
      // The wide neighbour's own side of that edge keeps the full reach.
      expect(hitTest(FRAME, narrow, xAt(FRAME, 600) - 5, yAt(FRAME, 0.3))).toMatchObject({ index: 0, grab: { kind: 'duration' } })
    })
  })

  it('finds the drop gap from block midpoints', () => {
    const boxes = layoutSegments(build('z2', 'z4'), 200)
    expect([100, 500, 900, 2000].map((s) => dropGap(boxes, s))).toEqual([0, 1, 2, 2])
    expect([0, 1, 2].map((g) => gapTimeS(boxes, g))).toEqual([0, 600, 1080])
  })

  it('ticks the axes', () => {
    expect(timeTicks(1800)).toEqual([0, 300, 600, 900, 1200, 1500, 1800])
    expect(timeTicks(0)).toEqual([])
    expect(powerTicks(1.6)).toEqual([0.5, 1, 1.5])
    expect(powerTicks(2.3)).toEqual([0.5, 1, 1.5, 2])
  })
})
