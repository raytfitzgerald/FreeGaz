import { describe, expect, it } from 'vitest'
import type { Sample } from './sample'
import { skibaTau, timeToExhaustionS, WPrimeBalance, wPrimeBalanceIntegral } from './wbal'

const CP = 250
const WP = 20_000
const steady = (watts: number, seconds: number): number[] => Array.from({ length: seconds }, () => watts)

// 5 × (3 min at 350 W, 3 min at 150 W)
const intervals: number[] = Array.from({ length: 5 }, () => [...steady(350, 180), ...steady(150, 180)]).flat()

describe('WPrimeBalance (Skiba 2015 differential)', () => {
  it('starts full and drains linearly above CP', () => {
    const m = new WPrimeBalance({ cp: CP, wPrimeJ: WP })
    expect(m.valueJ).toBe(WP)
    let bal = WP
    for (const w of steady(300, 100)) bal = m.push(w)
    expect(bal).toBe(WP - 50 * 100)
  })

  it('recovers exponentially below CP: W′ − (W′ − W′bal)·e^(−(CP − P)·t/W′)', () => {
    const m = new WPrimeBalance({ cp: CP, wPrimeJ: WP })
    for (const w of steady(350, 100)) m.push(w) // down to 10 kJ
    expect(m.valueJ).toBe(10_000)
    for (const w of steady(150, 60)) m.push(w)
    expect(m.valueJ).toBeCloseTo(WP - 10_000 * Math.exp((-100 * 60) / WP), 6)
  })

  it('stays close to the Euler discretisation at 1 s steps', () => {
    const m = new WPrimeBalance({ cp: CP, wPrimeJ: WP })
    let euler = WP
    let maxDiff = 0
    for (const w of intervals) {
      euler += w > CP ? -(w - CP) : ((CP - w) * (WP - euler)) / WP
      maxDiff = Math.max(maxDiff, Math.abs(m.push(w) - euler))
    }
    expect(maxDiff).toBeLessThan(0.005 * WP)
  })

  it('a 2 s step equals two 1 s steps, in both regimes', () => {
    const a = new WPrimeBalance({ cp: CP, wPrimeJ: WP })
    const b = new WPrimeBalance({ cp: CP, wPrimeJ: WP })
    for (const w of [400, 100, 0, 320]) {
      a.push(w, 2)
      b.push(w)
      b.push(w)
      expect(a.valueJ).toBeCloseTo(b.valueJ, 8)
    }
  })

  it('leaves the balance unchanged for missing samples', () => {
    const m = new WPrimeBalance({ cp: CP, wPrimeJ: WP })
    m.push(400)
    const before = m.valueJ
    expect(m.push(null)).toBe(before)
    expect(m.push(Number.NaN)).toBe(before)
    expect(m.push(100, 0)).toBe(before)
  })

  it('does not change at exactly CP, never exceeds W′, and tracks the minimum (which may go negative)', () => {
    const m = new WPrimeBalance({ cp: CP, wPrimeJ: WP })
    for (const w of steady(CP, 100)) m.push(w)
    expect(m.valueJ).toBe(WP)
    for (const w of steady(500, 100)) m.push(w) // 25 kJ above CP: more than W′
    expect(m.valueJ).toBe(-5000)
    for (const w of steady(0, 3600)) m.push(w)
    expect(m.valueJ).toBeLessThanOrEqual(WP)
    expect(m.valueJ).toBeGreaterThan(WP - 1)
    expect(m.minJ).toBe(-5000)
    m.reset()
    expect(m.valueJ).toBe(WP)
    expect(m.minJ).toBe(WP)
  })

  it('rejects a non-positive CP or W′', () => {
    expect(() => new WPrimeBalance({ cp: 0, wPrimeJ: WP })).toThrow(RangeError)
    expect(() => new WPrimeBalance({ cp: CP, wPrimeJ: -1 })).toThrow(RangeError)
  })
})

describe('timeToExhaustionS', () => {
  it('is W′bal / (P − CP) above CP, and null otherwise', () => {
    expect(timeToExhaustionS(350, CP, 20_000)).toBe(200)
    expect(timeToExhaustionS(350, CP, -10)).toBe(0)
    expect(timeToExhaustionS(CP, CP, 20_000)).toBeNull()
    expect(timeToExhaustionS(100, CP, 20_000)).toBeNull()
  })
})

describe('wPrimeBalanceIntegral (Skiba 2012)', () => {
  it('uses τ = 546·e^(−0.01·D_CP) + 316', () => {
    expect(skibaTau(0)).toBe(862)
    expect(skibaTau(100)).toBeCloseTo(546 * Math.exp(-1) + 316, 12)
  })

  it('matches the closed-form sum for a constant effort above CP', () => {
    const out = wPrimeBalanceIntegral(steady(300, 120), CP, WP)
    const decay = Math.exp(-1 / skibaTau(0)) // no sub-CP samples, so D_CP = 0
    const t = 120
    expect(out).toHaveLength(t)
    expect(out[t - 1]).toBeCloseTo(WP - (50 * (1 - decay ** t)) / (1 - decay), 6)
  })

  it('recovers with the time constant set by the mean sub-CP power', () => {
    const ride = [...steady(350, 100), ...steady(150, 600)]
    const out = wPrimeBalanceIntegral(ride, CP, WP)
    const tau = skibaTau(CP - 150)
    const atEnd = out[99]!
    expect(out[ride.length - 1]).toBeCloseTo(WP - (WP - atEnd) * Math.exp(-600 / tau), 6)
  })

  it('keeps the balance unchanged over missing samples', () => {
    const ride: Sample[] = [...steady(400, 30), null, null, null, ...steady(400, 1)]
    const out = wPrimeBalanceIntegral(ride, CP, WP)
    expect(out[30]).toBe(out[29])
    expect(out[32]).toBe(out[29])
    expect(out[33]!).toBeLessThan(out[32]!)
  })

  it('bottoms out at the end of the last hard interval, as the differential model does', () => {
    const integral = wPrimeBalanceIntegral(intervals, CP, WP)
    const m = new WPrimeBalance({ cp: CP, wPrimeJ: WP })
    const differential = intervals.map((w) => m.push(w))
    const argmin = (xs: number[]) => xs.indexOf(Math.min(...xs))
    expect(argmin(integral)).toBe(4 * 360 + 179)
    expect(argmin(differential)).toBe(4 * 360 + 179)
    expect(Math.max(...integral)).toBeLessThanOrEqual(WP)
  })
})
