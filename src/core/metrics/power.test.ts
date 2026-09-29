import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  averagePower,
  intensityFactor,
  kilojoules,
  maxPower,
  normalizedPower,
  NormalizedPowerAccumulator,
  trainingStressScore,
  variabilityIndex,
  wattsPerKg,
} from './power'
import type { Sample } from './sample'

const steady = (watts: number, seconds: number): number[] => Array.from({ length: seconds }, () => watts)

// Coggan's recipe, written out literally (O(n·30)). A term is added for each
// valid second from the 30th on, and the window mean skips nulls.
function referenceNp(xs: readonly Sample[]): number | null {
  const terms: number[] = []
  for (let i = 29; i < xs.length; i++) {
    if (xs[i] === null || xs[i] === undefined) continue
    const win = xs.slice(i - 29, i + 1).filter((x): x is number => x !== null)
    terms.push((win.reduce((a, b) => a + b, 0) / win.length) ** 4)
  }
  return terms.length > 0 ? (terms.reduce((a, b) => a + b, 0) / terms.length) ** 0.25 : null
}

describe('normalizedPower', () => {
  it('equals the power of a steady ride', () => {
    expect(normalizedPower(steady(200, 3600))).toBeCloseTo(200, 9)
  })

  it('is null before the 30 s mark (Coggan / TrainingPeaks), then defined', () => {
    expect(normalizedPower(steady(250, 29))).toBeNull()
    expect(normalizedPower(steady(250, 30))).toBeCloseTo(250, 9)
    expect(normalizedPower([])).toBeNull()
    expect(normalizedPower(Array.from({ length: 100 }, () => null))).toBeNull()
  })

  it('weights hard efforts: 30 min at 300 W then 30 min at 100 W gives about 253 W', () => {
    const ride = [...steady(300, 1800), ...steady(100, 1800)]
    const np = normalizedPower(ride)
    // (½·300⁴ + ½·100⁴)^¼ = 253.0 W, less a little for the 30 s transition.
    expect(np).toBeCloseTo(referenceNp(ride)!, 9)
    expect(np!).toBeGreaterThan(250)
    expect(np!).toBeLessThan(254)
    expect(averagePower(ride)).toBe(200)
  })

  it('skips missing seconds instead of treating them as zero', () => {
    const gappy = steady(250, 3600).map((w, i) => (i % 7 === 3 ? null : w))
    expect(normalizedPower(gappy)).toBeCloseTo(250, 9)
    const zeros = steady(250, 3600).map((w, i) => (i % 7 === 3 ? 0 : w))
    expect(normalizedPower(zeros)!).toBeLessThan(250) // real zeros (coasting) do count
  })

  it('a long dropout neither lowers NP nor adds terms', () => {
    const ride = [...steady(200, 600), ...Array.from({ length: 900 }, () => null), ...steady(200, 600)]
    expect(normalizedPower(ride)).toBeCloseTo(200, 9)
    const acc = new NormalizedPowerAccumulator()
    for (const w of ride) acc.push(w)
    expect(acc.validSeconds).toBe(1200)
  })

  it('streaming equals batch exactly and matches the literal recipe', () => {
    const watts = fc.option(fc.integer({ min: 0, max: 1500 }), { nil: null, freq: 8 })
    fc.assert(
      fc.property(fc.array(watts, { maxLength: 400 }), (xs) => {
        const acc = new NormalizedPowerAccumulator()
        for (const w of xs) acc.push(w)
        expect(acc.value()).toBe(normalizedPower(xs))
        const ref = referenceNp(xs)
        if (ref === null) expect(acc.value()).toBeNull()
        else expect(acc.value()).toBeCloseTo(ref, 6)
      }),
    )
  })

  it('reset() starts over', () => {
    const acc = new NormalizedPowerAccumulator()
    for (const w of steady(300, 60)) acc.push(w)
    acc.reset()
    expect(acc.value()).toBeNull()
    expect(acc.validSeconds).toBe(0)
  })
})

describe('simple power statistics', () => {
  const ride: Sample[] = [100, null, 0, 300, null, 200]

  it('average and max skip nulls; 0 W counts', () => {
    expect(averagePower(ride)).toBe(150)
    expect(maxPower(ride)).toBe(300)
    expect(averagePower([null, null])).toBeNull()
    expect(maxPower([])).toBeNull()
  })

  it('kilojoules sums valid watt-seconds', () => {
    expect(kilojoules(steady(250, 3600))).toBe(900)
    expect(kilojoules(ride)).toBe(0.6)
    expect(kilojoules([200, 200], 0.5)).toBe(0.2)
    expect(kilojoules([null])).toBeNull()
  })
})

describe('IF, TSS, VI, W/kg', () => {
  it('one hour at FTP is IF 1.0 and 100 TSS', () => {
    expect(intensityFactor(250, 250)).toBe(1)
    expect(trainingStressScore(3600, 250, 250)).toBeCloseTo(100, 12)
  })

  it('30 min at 80 % FTP is 32 TSS', () => {
    expect(trainingStressScore(1800, 200, 250)).toBeCloseTo(32, 12)
  })

  it('agrees with the (s × NP × IF) / (FTP × 3600) × 100 definition', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 36_000 }), fc.double({ min: 1, max: 600, noNaN: true }), fc.double({ min: 50, max: 500, noNaN: true }), (s, np, ftp) => {
        expect(trainingStressScore(s, np, ftp)).toBeCloseTo(((s * np * (np / ftp)) / (ftp * 3600)) * 100, 9)
      }),
    )
  })

  it('returns null for missing inputs or a non-positive FTP', () => {
    expect(intensityFactor(null, 250)).toBeNull()
    expect(intensityFactor(200, 0)).toBeNull()
    expect(trainingStressScore(3600, null, 250)).toBeNull()
    expect(trainingStressScore(3600, 200, -1)).toBeNull()
  })

  it('variability index and watts per kg', () => {
    expect(variabilityIndex(220, 200)).toBeCloseTo(1.1, 12)
    expect(variabilityIndex(220, 0)).toBeNull()
    expect(variabilityIndex(null, 200)).toBeNull()
    expect(wattsPerKg(300, 75)).toBe(4)
    expect(wattsPerKg(300, 0)).toBeNull()
    expect(wattsPerKg(null, 75)).toBeNull()
  })
})
