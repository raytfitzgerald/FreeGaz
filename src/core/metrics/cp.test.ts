import { describe, expect, it } from 'vitest'
import { createRng } from '../sim/physiology'
import { estimateFtp, fitCriticalPower, type PowerDurationPoint } from './cp'
import { STANDARD_DURATIONS } from './mmp'

// The power-duration curve of an ideal rider: P(t) = CP + W'/t.
function monod(cp: number, wPrimeJ: number, durations: readonly number[] = STANDARD_DURATIONS): PowerDurationPoint[] {
  return durations.map((durationS) => ({ durationS, watts: cp + wPrimeJ / durationS }))
}

describe('fitCriticalPower', () => {
  it('recovers CP and W′ exactly from an ideal curve, using only 180–1200 s by default', () => {
    const fit = fitCriticalPower(monod(280, 18_000))
    expect(fit).not.toBeNull()
    expect(fit!.cpW).toBeCloseTo(280, 9)
    expect(fit!.wPrimeJ).toBeCloseTo(18_000, 6)
    expect(fit!.r2).toBeCloseTo(1, 12)
    expect(fit!.n).toBe(9) // 180, 240, 300, 360, 480, 600, 720, 900, 1200
  })

  it('is robust to 1 % noise', () => {
    const rng = createRng(11)
    const noisy = monod(300, 20_000).map((p) => ({ ...p, watts: p.watts * (1 + 0.02 * (rng() - 0.5)) }))
    const fit = fitCriticalPower(noisy)!
    expect(fit.cpW).toBeGreaterThan(300 * 0.98)
    expect(fit.cpW).toBeLessThan(300 * 1.02)
    expect(fit.wPrimeJ).toBeGreaterThan(20_000 * 0.8)
    expect(fit.wPrimeJ).toBeLessThan(20_000 * 1.2)
    expect(fit.r2).toBeGreaterThan(0.99)
  })

  it('ignores points outside the window, and minS/maxS move it', () => {
    const base = monod(250, 15_000, [180, 300, 600, 1200])
    const withOutliers = [...base, { durationS: 60, watts: 2000 }, { durationS: 3600, watts: 50 }]
    expect(fitCriticalPower(withOutliers)).toEqual(fitCriticalPower(base))
    expect(fitCriticalPower(monod(250, 15_000, [120, 150, 240]), { minS: 120 })?.n).toBe(3)
    expect(fitCriticalPower(monod(250, 15_000, [120, 150, 240]))).toBeNull() // only 240 s is ≥ 180 s
  })

  it('keeps the best power when a duration repeats', () => {
    const pts = [...monod(250, 15_000, [180, 600, 1200]), { durationS: 600, watts: 100 }]
    expect(fitCriticalPower(pts)?.cpW).toBeCloseTo(250, 9)
  })

  it('needs ≥ 3 points spanning ≥ 2× in duration, and a positive W′', () => {
    expect(fitCriticalPower(monod(250, 15_000, [300, 1200]))).toBeNull()
    expect(fitCriticalPower(monod(250, 15_000, [300, 400, 500]))).toBeNull()
    expect(fitCriticalPower(monod(250, -5_000, [180, 600, 1200]))).toBeNull() // power rising with duration
    expect(fitCriticalPower([])).toBeNull()
  })
})

describe('estimateFtp', () => {
  it('uses CP when the fit is good', () => {
    const est = estimateFtp(monod(270, 20_000))
    expect(est.method).toBe('cp')
    expect(est.ftpW).toBeCloseTo(270, 9)
    expect(est.cp?.r2).toBeCloseTo(1, 12)
  })

  it('falls back to 95 % of the best 20 minutes when the fit is poor', () => {
    // Work against time is far from linear here (r² ≈ 0.87), although W′ > 0.
    const pts = [
      { durationS: 180, watts: 80_000 / 180 },
      { durationS: 600, watts: 500 },
      { durationS: 1200, watts: 380_000 / 1200 },
    ]
    const est = estimateFtp(pts)
    expect(est.method).toBe('95pct-20min')
    expect(est.ftpW).toBeCloseTo(0.95 * (380_000 / 1200), 9)
    expect(est.cp?.r2).toBeLessThan(0.95)
  })

  it('falls back to 20 minutes when there are too few points for a fit', () => {
    const est = estimateFtp([
      { durationS: 60, watts: 450 },
      { durationS: 1200, watts: 300 },
    ])
    expect(est.method).toBe('95pct-20min')
    expect(est.ftpW).toBeCloseTo(285, 9)
    expect(est.cp).toBeUndefined()
  })

  it('reports insufficient data without a fit or a 20-minute effort', () => {
    const est = estimateFtp([{ durationS: 300, watts: 350 }])
    expect(est.method).toBe('insufficient')
    expect(est.ftpW).toBeNull()
  })
})
