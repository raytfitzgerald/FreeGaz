import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { aerobicDecoupling, efficiencyFactor, HrDriftAccumulator } from './hr'
import type { Sample } from './sample'

const steady = (v: number, seconds: number): number[] => Array.from({ length: seconds }, () => v)

describe('efficiencyFactor', () => {
  it('is NP / average HR', () => {
    expect(efficiencyFactor(210, 140)).toBe(1.5)
    expect(efficiencyFactor(null, 140)).toBeNull()
    expect(efficiencyFactor(210, null)).toBeNull()
    expect(efficiencyFactor(210, 0)).toBeNull()
  })
})

describe('aerobicDecoupling', () => {
  it('is positive when HR drifts up at constant power', () => {
    const power = steady(200, 3600)
    const hr = [...steady(140, 1800), ...steady(147, 1800)]
    expect(aerobicDecoupling(power, hr)).toBeCloseTo((1 - 140 / 147) * 100, 9) // 4.76 %
  })

  it('is positive when power fades at constant HR', () => {
    const power = [...steady(200, 1800), ...steady(190, 1800)]
    expect(aerobicDecoupling(power, steady(140, 3600))).toBeCloseTo(5, 9)
  })

  it('is 0 for a perfectly coupled ride', () => {
    expect(aerobicDecoupling(steady(180, 2400), steady(130, 2400))).toBeCloseTo(0, 12)
  })

  it('needs 20 minutes of paired data', () => {
    expect(aerobicDecoupling(steady(200, 1199), steady(140, 1199))).toBeNull()
    expect(aerobicDecoupling(steady(200, 1200), steady(140, 1200))).toBeCloseTo(0, 12)
    expect(aerobicDecoupling(steady(200, 600), steady(140, 600), { minPairedS: 300 })).toBeCloseTo(0, 12)
  })

  it('pairs only seconds with both readings (and HR > 0), splitting halves by paired time', () => {
    // First 1800 s: no HR at all. It must not count as a half.
    const power: Sample[] = [...steady(250, 1800), ...steady(200, 1800), ...steady(190, 1800)]
    const hr: Sample[] = [...Array.from({ length: 1800 }, () => null), ...steady(140, 1800), ...steady(140, 1800)]
    expect(aerobicDecoupling(power, hr)).toBeCloseTo(5, 9)
    const withZeros = hr.map((h, i) => (i % 10 === 0 && h !== null ? 0 : h))
    expect(aerobicDecoupling(power, withZeros)).toBeCloseTo(5, 9)
  })

  it('keeps 0 W seconds (coasting) in the average power', () => {
    const power = [...steady(200, 1800), ...steady(200, 1700), ...steady(0, 100)]
    const expected = (1 - (200 * 1700) / 1800 / 200) * 100
    expect(aerobicDecoupling(power, steady(140, 3600))).toBeCloseTo(expected, 9)
  })
})

describe('HrDriftAccumulator', () => {
  it('gives the same value as the batch function on every prefix', () => {
    const sample = fc.option(fc.integer({ min: 0, max: 400 }), { nil: null, freq: 6 })
    const hr = fc.option(fc.integer({ min: 0, max: 200 }), { nil: null, freq: 6 })
    fc.assert(
      fc.property(fc.array(fc.tuple(sample, hr), { minLength: 1, maxLength: 120 }), (pairs) => {
        const acc = new HrDriftAccumulator({ minPairedS: 10 })
        const p: Sample[] = []
        const h: Sample[] = []
        for (const [w, b] of pairs) {
          acc.push(w, b)
          p.push(w)
          h.push(b)
          expect(acc.value()).toBe(aerobicDecoupling(p, h, { minPairedS: 10 }))
        }
      }),
    )
  })

  it('reports live decoupling and resets', () => {
    const acc = new HrDriftAccumulator()
    for (let t = 0; t < 3600; t++) acc.push(200, 140 + t / 360) // HR creeps up 10 bpm/h
    expect(acc.pairedSeconds).toBe(3600)
    expect(acc.value()!).toBeGreaterThan(2)
    acc.reset()
    expect(acc.pairedSeconds).toBe(0)
    expect(acc.value()).toBeNull()
  })
})
