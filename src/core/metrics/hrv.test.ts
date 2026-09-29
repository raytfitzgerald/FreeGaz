import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createRng, gaussian } from '../sim/physiology'
import { cleanRr, dfaAlpha1, lnRmssd, rmssd, sdnn } from './hrv'

function whiteNoise(seed: number, n: number): number[] {
  const rng = createRng(seed)
  return Array.from({ length: n }, () => 800 + 25 * gaussian(rng))
}

function brownian(seed: number, n: number): number[] {
  const rng = createRng(seed)
  let x = 0
  return Array.from({ length: n }, () => (x += 3 * gaussian(rng)) + 800)
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

describe('cleanRr', () => {
  it('drops intervals outside 300–2000 ms and non-finite values', () => {
    expect(cleanRr([800, 250, 810, 2500, Number.NaN, 805])).toEqual([800, 810, 805])
  })

  it('drops an ectopic beat and its compensatory pause', () => {
    const rr = [800, 805, 810, 560, 1060, 808, 803]
    expect(cleanRr(rr)).toEqual([800, 805, 810, 808, 803])
  })

  it('follows a gradual change in HR', () => {
    const rr = Array.from({ length: 200 }, (_, i) => 1000 - 2.5 * i) // 60 → 120 bpm
    expect(cleanRr(rr)).toEqual(rr)
  })

  it('rejects an artifact in the very first beat', () => {
    expect(cleanRr([900, 450, 452, 448, 451, 449])).toEqual([450, 452, 448, 451, 449])
  })

  it('re-anchors after a gap in the data (a run of consistent beats)', () => {
    const rr = [400, 402, 399, 401, 545, 548, 546, 544, 547] // strap dropped out while HR fell
    expect(cleanRr(rr)).toEqual(rr)
  })

  it('is empty for empty or unusable input', () => {
    expect(cleanRr([])).toEqual([])
    expect(cleanRr([100, 5000])).toEqual([])
  })
})

describe('time-domain HRV', () => {
  const alternating = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 1000 : 1010))

  it('RMSSD is the RMS of successive differences', () => {
    expect(rmssd(alternating)).toBeCloseTo(10, 12)
    expect(lnRmssd(alternating)).toBeCloseTo(Math.log(10), 12)
  })

  it('SDNN is the sample standard deviation', () => {
    expect(sdnn(alternating)).toBeCloseTo(Math.sqrt((20 * 25) / 19), 12)
  })

  it('needs 10 clean intervals', () => {
    expect(rmssd(alternating.slice(0, 9))).toBeNull()
    expect(rmssd(alternating.slice(0, 10))).not.toBeNull()
    expect(sdnn([...alternating.slice(0, 9), 3000])).toBeNull() // 3000 ms is dropped by the cleaner
    expect(lnRmssd(Array.from({ length: 12 }, () => 800))).toBeNull() // RMSSD 0
  })

  it('cleans the input unless told not to', () => {
    const withArtifact = [...alternating.slice(0, 10), 1600, ...alternating.slice(10)]
    expect(rmssd(withArtifact)).toBeCloseTo(10, 12)
    expect(rmssd(withArtifact, { clean: false })!).toBeGreaterThan(100)
  })
})

describe('dfaAlpha1 (experimental)', () => {
  it('needs 120 clean beats', () => {
    expect(dfaAlpha1(whiteNoise(1, 119))).toBeNull()
    expect(dfaAlpha1(whiteNoise(1, 120))).not.toBeNull()
  })

  it('white noise gives α1 ≈ 0.5, at the value theory predicts for boxes of 4–16 beats', () => {
    // With a linear detrend, E[F²(n)] ∝ (n² − 4)/n for white noise. Fitting that
    // over n = 4..16 gives 0.583, the known small-box bias of DFA-1. Kubios uses the
    // same algorithm, so the published thresholds (0.75 and 0.5) still apply.
    const xs: number[] = []
    const ys: number[] = []
    for (let n = 4; n <= 16; n++) {
      xs.push(Math.log(n))
      ys.push(0.5 * Math.log((n * n - 4) / n))
    }
    const mx = mean(xs)
    const my = mean(ys)
    const theory = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0)
    expect(theory).toBeCloseTo(0.583, 3)

    const alphas = Array.from({ length: 20 }, (_, seed) => dfaAlpha1(whiteNoise(seed + 1, 1000), { clean: false })!)
    const avg = mean(alphas)
    expect(Math.abs(avg - 0.5)).toBeLessThanOrEqual(0.1)
    expect(Math.abs(avg - theory)).toBeLessThan(0.02)
  })

  it('Brownian noise (cumulative sum of white noise) gives α1 ≈ 1.5', () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(Math.abs(dfaAlpha1(brownian(seed, 1000), { clean: false })! - 1.5)).toBeLessThanOrEqual(0.15)
    }
  })

  it('orders correlated noise between the two, and cleaning does not change clean data', () => {
    const rng = createRng(5)
    let x = 0
    const ar = Array.from({ length: 1000 }, () => 800 + 25 * (x = 0.7 * x + Math.sqrt(1 - 0.49) * gaussian(rng)))
    const a = dfaAlpha1(ar)!
    expect(a).toBeGreaterThan(dfaAlpha1(whiteNoise(5, 1000))!)
    expect(a).toBeLessThan(dfaAlpha1(brownian(5, 1000))!)
    expect(dfaAlpha1(ar)).toBe(dfaAlpha1(ar, { clean: false }))
  })

  it('does not depend on the RR scale or offset', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), fc.double({ min: 0.5, max: 1.5, noNaN: true }), fc.double({ min: -100, max: 100, noNaN: true }), (seed, k, c) => {
        const rr = whiteNoise(seed, 150)
        expect(dfaAlpha1(rr.map((v) => k * v + c), { clean: false })).toBeCloseTo(dfaAlpha1(rr, { clean: false })!, 9)
      }),
      { numRuns: 30 },
    )
  })
})
