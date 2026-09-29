import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { RollingMean } from './rolling'
import type { Sample } from './sample'

// O(n·w) reference: mean of the non-null values among the last w entries.
function naiveMeans(xs: readonly Sample[], w: number): (number | null)[] {
  return xs.map((_, i) => {
    const win = xs.slice(Math.max(0, i - w + 1), i + 1).filter((v): v is number => v !== null)
    return win.length > 0 ? win.reduce((a, b) => a + b, 0) / win.length : null
  })
}

const sample = fc.option(fc.double({ min: -2000, max: 2000, noNaN: true }), { nil: null })

describe('RollingMean', () => {
  it('averages the last N pushes', () => {
    const r = new RollingMean(3)
    expect([1, 2, 3, 4, 5].map((v) => r.push(v))).toEqual([1, 1.5, 2, 3, 4])
    expect(r.pushes).toBe(5)
    expect(r.count).toBe(3)
    expect(r.value()).toBe(4)
  })

  it('leaves nulls out of the mean and the count, but they still use up a slot', () => {
    const r = new RollingMean(3)
    expect(r.push(100)).toBe(100)
    expect(r.push(null)).toBe(100) // not 50: missing is not zero
    expect(r.push(200)).toBe(150)
    expect(r.push(null)).toBe(200) // window [null, 200, null]
    expect(r.push(null)).toBe(200)
    expect(r.push(null)).toBeNull() // no valid sample left
    expect(r.count).toBe(0)
  })

  it('counts 0 as a real reading', () => {
    const r = new RollingMean(2)
    r.push(100)
    expect(r.push(0)).toBe(50)
  })

  it('treats NaN and ±Infinity as missing', () => {
    const r = new RollingMean(4)
    r.push(10)
    r.push(Number.NaN)
    r.push(Number.POSITIVE_INFINITY)
    expect(r.push(30)).toBe(20)
    expect(r.count).toBe(2)
  })

  it('reset() empties the window', () => {
    const r = new RollingMean(3)
    r.push(5)
    r.push(7)
    r.reset()
    expect(r.value()).toBeNull()
    expect(r.pushes).toBe(0)
    expect(r.push(1)).toBe(1)
  })

  it('rejects window sizes that are not positive integers', () => {
    expect(() => new RollingMean(0)).toThrow(RangeError)
    expect(() => new RollingMean(-3)).toThrow(RangeError)
    expect(() => new RollingMean(2.5)).toThrow(RangeError)
    expect(() => new RollingMean(Number.NaN)).toThrow(RangeError)
  })

  it('matches a naive implementation on random data with gaps', () => {
    fc.assert(
      fc.property(fc.array(sample, { maxLength: 300 }), fc.integer({ min: 1, max: 40 }), (xs, w) => {
        const r = new RollingMean(w)
        const got = xs.map((v) => r.push(v))
        const want = naiveMeans(xs, w)
        got.forEach((g, i) => {
          const e = want[i] ?? null
          if (e === null) expect(g).toBeNull()
          else expect(g).toBeCloseTo(e, 6)
        })
      }),
    )
  })

  it('does not drift over a long ride of fractional values', () => {
    const r = new RollingMean(30)
    const xs = Array.from({ length: 100_003 }, (_, i) => 200 + 0.1 * Math.sin(i) + 1e-7 * i)
    let last: number | null = null
    for (const x of xs) last = r.push(x)
    const tail = xs.slice(-30)
    expect(last).toBeCloseTo(tail.reduce((a, b) => a + b, 0) / 30, 10)
  })
})
