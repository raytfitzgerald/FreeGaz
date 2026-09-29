import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { meanMaxPower, mergeMmp, STANDARD_DURATIONS, type MmpPoint } from './mmp'
import type { Sample } from './sample'

// O(n·d) reference: best mean over windows of exactly d samples that contain no null.
function bruteForce(xs: readonly Sample[], d: number): { watts: number; startIndex: number } | null {
  let best: { watts: number; startIndex: number } | null = null
  for (let i = 0; i + d <= xs.length; i++) {
    const win = xs.slice(i, i + d)
    if (win.some((v) => v === null)) continue
    const mean = (win as number[]).reduce((a, b) => a + b, 0) / d
    if (best === null || mean > best.watts) best = { watts: mean, startIndex: i }
  }
  return best
}

describe('meanMaxPower', () => {
  it('reports every standard duration of a long steady ride', () => {
    const ride = Array.from({ length: 10_800 }, () => 210)
    const mmp = meanMaxPower(ride)
    expect(mmp.map((p) => p.durationS)).toEqual(STANDARD_DURATIONS)
    expect(mmp.every((p) => p.watts === 210 && p.startIndex === 0)).toBe(true)
  })

  it('finds the best window and its start; ties keep the earliest', () => {
    const ride = [100, 100, 500, 500, 500, 100]
    const byD = new Map(meanMaxPower(ride, [1, 3, 4, 6]).map((p) => [p.durationS, p]))
    expect(byD.get(1)).toEqual({ durationS: 1, watts: 500, startIndex: 2 })
    expect(byD.get(3)).toEqual({ durationS: 3, watts: 500, startIndex: 2 })
    expect(byD.get(4)).toEqual({ durationS: 4, watts: 400, startIndex: 1 })
    expect(byD.get(6)?.watts).toBeCloseTo(300, 12)
  })

  it('never bridges a gap, but 0 W is a real value', () => {
    const ride: Sample[] = [300, 300, 300, null, 200, 200, 200, 0]
    const byD = new Map(meanMaxPower(ride, [3, 4, 5]).map((p) => [p.durationS, p]))
    expect(byD.get(3)).toEqual({ durationS: 3, watts: 300, startIndex: 0 })
    expect(byD.get(4)).toEqual({ durationS: 4, watts: 150, startIndex: 4 }) // 200, 200, 200, 0
    expect(byD.has(5)).toBe(false) // every 5 s window includes the gap
  })

  it('omits durations longer than the ride and ignores invalid ones; output is sorted and unique', () => {
    const mmp = meanMaxPower([200, 250, 300], [60, 2, 0, -1, 1.5, 2, 1])
    expect(mmp.map((p) => p.durationS)).toEqual([1, 2])
    expect(meanMaxPower([], STANDARD_DURATIONS)).toEqual([])
  })

  it('exact-length means are not forced to be monotonic', () => {
    const byD = new Map(meanMaxPower([10, 0, 10], [1, 2, 3]).map((p) => [p.durationS, p.watts]))
    expect(byD.get(2)).toBe(5)
    expect(byD.get(3)).toBeCloseTo(20 / 3, 12)
  })

  it('matches brute force on random rides with gaps', () => {
    const watts = fc.option(fc.integer({ min: 0, max: 1200 }), { nil: null, freq: 10 })
    fc.assert(
      fc.property(fc.array(watts, { maxLength: 200 }), fc.uniqueArray(fc.integer({ min: 1, max: 60 }), { maxLength: 8 }), (xs, ds) => {
        const got = new Map(meanMaxPower(xs, ds).map((p) => [p.durationS, p]))
        for (const d of ds) {
          const want = bruteForce(xs, d)
          const g = got.get(d)
          if (want === null) {
            expect(g).toBeUndefined()
          } else {
            expect(g?.watts).toBeCloseTo(want.watts, 9)
            expect(g?.startIndex).toBe(want.startIndex)
          }
        }
      }),
    )
  })

  it('handles a 4-hour ride quickly', () => {
    const ride = Array.from({ length: 14_400 }, (_, i) => 200 + 100 * Math.sin(i / 97))
    const mmp = meanMaxPower(ride)
    expect(mmp).toHaveLength(STANDARD_DURATIONS.filter((d) => d <= 14_400).length)
    expect(mmp[0]!.watts).toBeCloseTo(300, 0)
  })
})

describe('mergeMmp', () => {
  it('takes the element-wise best and keeps provenance', () => {
    const a: MmpPoint[] = [
      { durationS: 5, watts: 900, startIndex: 10, sourceId: 'ride-a' },
      { durationS: 60, watts: 400, startIndex: 50, sourceId: 'ride-a' },
    ]
    const b: MmpPoint[] = [
      { durationS: 1, watts: 1100, startIndex: 3, sourceId: 'ride-b' },
      { durationS: 5, watts: 950, startIndex: 7, sourceId: 'ride-b' },
      { durationS: 60, watts: 400, startIndex: 90, sourceId: 'ride-b' },
    ]
    expect(mergeMmp(a, b)).toEqual([
      { durationS: 1, watts: 1100, startIndex: 3, sourceId: 'ride-b' },
      { durationS: 5, watts: 950, startIndex: 7, sourceId: 'ride-b' },
      { durationS: 60, watts: 400, startIndex: 50, sourceId: 'ride-a' }, // tie: a wins
    ])
  })

  it('is generic over extra fields', () => {
    const merged = mergeMmp([{ durationS: 20, watts: 300, date: '2026-05-01' }], [{ durationS: 20, watts: 310, date: '2026-06-01' }])
    expect(merged).toEqual([{ durationS: 20, watts: 310, date: '2026-06-01' }])
  })
})
