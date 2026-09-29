import { describe, expect, it } from 'vitest'
import { limitRate, runningMedian, savitzkyGolay, savitzkyGolayWeights } from './filters'
import { mulberry32 } from './fixtures/tracks'

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i)
const variance = (xs: ArrayLike<number>): number => {
  const a = Array.from(xs)
  const mean = a.reduce((s, v) => s + v, 0) / a.length
  return a.reduce((s, v) => s + (v - mean) ** 2, 0) / a.length
}

describe('savitzkyGolayWeights', () => {
  it('reproduces the textbook 5-point quadratic smoother, (-3 12 17 12 -3) / 35', () => {
    const w = savitzkyGolayWeights(2, 2)
    const expected = [-3, 12, 17, 12, -3].map((c) => c / 35)
    expected.forEach((c, i) => expect(w[i]).toBeCloseTo(c, 12))
  })

  it('matches the closed form for the 11-point quadratic used by the pipeline', () => {
    const m = 5
    const w = savitzkyGolayWeights(m, 2)
    for (let i = -m; i <= m; i++) {
      const closed = (3 * (3 * m * m + 3 * m - 1) - 15 * i * i) / ((2 * m - 1) * (2 * m + 1) * (2 * m + 3))
      expect(w[i + m]).toBeCloseTo(closed, 12)
    }
  })

  it('sums to 1 and reproduces quadratics exactly at every position in the window (edge weights)', () => {
    const m = 5
    const poly = (x: number): number => 3 - 0.7 * x + 0.05 * x * x
    for (let at = -m; at <= m; at++) {
      const w = savitzkyGolayWeights(m, 2, at)
      expect(Array.from(w).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12)
      const fitted = range(2 * m + 1).reduce((s, j) => s + w[j]! * poly(j - m), 0)
      expect(fitted).toBeCloseTo(poly(at), 10)
    }
  })

  it('degenerates sensibly: order 0 is a moving average, a full-order fit returns the sample', () => {
    expect(Array.from(savitzkyGolayWeights(3, 0)).every((v) => Math.abs(v - 1 / 7) < 1e-12)).toBe(true)
    const exact = savitzkyGolayWeights(2, 4, 1)
    expect(Array.from(exact).map((v) => Math.round(v * 1e9) / 1e9 + 0)).toEqual([0, 0, 0, 1, 0]) // + 0 turns -0 into 0
    expect(() => savitzkyGolayWeights(-1, 2)).toThrow(RangeError)
  })
})

describe('savitzkyGolay', () => {
  it('leaves a quadratic untouched, edges included', () => {
    const x = range(40).map((i) => 100 + 2 * i - 0.03 * i * i)
    const y = savitzkyGolay(x, 11, 2)
    x.forEach((v, i) => expect(y[i]).toBeCloseTo(v, 9))
  })

  it('is zero-phase: a symmetric bump stays symmetric and in place', () => {
    const x = range(81).map((i) => Math.exp(-(((i - 40) / 6) ** 2)))
    const y = savitzkyGolay(x, 11, 2)
    for (let i = 0; i <= 40; i++) expect(y[40 - i]).toBeCloseTo(y[40 + i]!, 12)
    const peak = Array.from(y).indexOf(Math.max(...y))
    expect(peak).toBe(40)
  })

  it('cuts white-noise variance to about the centre weight (0.207 for 11 points, quadratic)', () => {
    const rnd = mulberry32(3)
    const x = range(20000).map(() => rnd() - 0.5)
    const ratio = variance(savitzkyGolay(x, 11, 2).subarray(5, -5)) / variance(x)
    expect(ratio).toBeGreaterThan(0.18)
    expect(ratio).toBeLessThan(0.235)
  })

  it('shrinks the window to fit short series and passes tiny ones through', () => {
    const x = [1, 5, 2, 8, 3, 9]
    expect(Array.from(savitzkyGolay(x, 11, 2))).toHaveLength(6)
    expect(Array.from(savitzkyGolay([4, 7], 11, 2))).toEqual([4, 7])
  })
})

describe('runningMedian', () => {
  it('removes isolated spikes one or two samples wide, including at both ends', () => {
    const x = range(30).map(() => 100)
    x[0] = 130
    x[10] = 130
    x[20] = 70
    x[21] = 70
    x[29] = 40
    expect(Array.from(runningMedian(x, 5))).toEqual(range(30).map(() => 100))
  })

  it('passes any monotone sequence through unchanged, ends included', () => {
    const kinked = range(40).map((i) => (i < 20 ? 100 : 100 + 0.6 * (i - 20)))
    expect(Array.from(runningMedian(kinked, 5))).toEqual(kinked)
    const climb = range(12).map((i) => 50 + 1.3 * i)
    expect(Array.from(runningMedian(climb, 5))).toEqual(climb)
  })

  it('is a no-op for a window of one sample or very short series', () => {
    expect(Array.from(runningMedian([1, 9, 1], 1))).toEqual([1, 9, 1])
    expect(Array.from(runningMedian([1, 9], 5))).toEqual([1, 9])
  })
})

describe('limitRate', () => {
  it('never lets the output change faster than the bound', () => {
    const rnd = mulberry32(11)
    const x = range(500).map(() => (rnd() - 0.5) * 40)
    const steps = range(499).map((i) => 0.5 + (i % 3))
    const y = limitRate(x, steps)
    for (let i = 1; i < y.length; i++) expect(Math.abs(y[i]! - y[i - 1]!)).toBeLessThanOrEqual(steps[i - 1]! + 1e-12)
  })

  it('leaves a compliant signal alone', () => {
    const x = range(50).map((i) => Math.sin(i / 5))
    const y = limitRate(x, range(49).map(() => 0.5))
    x.forEach((v, i) => expect(y[i]).toBeCloseTo(v, 12))
  })

  it('turns a step into a ramp centred on the step, with no lag', () => {
    const x = range(40).map((i) => (i < 20 ? 0 : 10))
    const y = limitRate(x, range(39).map(() => 1))
    for (let i = 0; i < 40; i++) expect(y[i]! + y[39 - i]!).toBeCloseTo(10, 12)
    expect(y[19]).toBe(4.5)
    expect(y[20]).toBe(5.5)
  })
})
