import { describe, expect, it } from 'vitest'
import { dfaAlpha1, rmssd } from '../metrics/hrv'
import { createRng, gaussian, HeartRateModel, RiderModel, riderScriptState, type PedalInput } from './physiology'

const athlete = { restHr: 50, maxHr: 190, ftpW: 250, lthr: 165 }
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

describe('createRng', () => {
  it('is deterministic per seed, and uniform in [0, 1)', () => {
    const a = createRng(123)
    const b = createRng(123)
    const xs = Array.from({ length: 20_000 }, () => a())
    expect(Array.from({ length: 20_000 }, () => b())).toEqual(xs)
    const c = createRng(124)
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(xs.slice(0, 5))
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...xs)).toBeLessThan(1)
    const buckets = Array.from({ length: 10 }, () => 0)
    for (const x of xs) buckets[Math.floor(x * 10)]!++
    for (const n of buckets) expect(Math.abs(n - 2000)).toBeLessThan(200)
  })

  it('gaussian() has mean 0 and SD 1', () => {
    const rng = createRng(8)
    const xs = Array.from({ length: 20_000 }, () => gaussian(rng))
    const m = mean(xs)
    expect(Math.abs(m)).toBeLessThan(0.03)
    expect(Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))).toBeCloseTo(1, 1)
  })
})

describe('HeartRateModel', () => {
  it('rises towards steady state (τ ≈ 30 s), recovers (τ ≈ 60 s), and stays within [rest, max]', () => {
    const m = new HeartRateModel({ ...athlete, rng: createRng(1) })
    const trace: number[] = []
    for (let t = 0; t < 600; t++) trace.push(m.step(200, 1))
    const rise = m.steadyStateHr(0) // rest + drift
    expect(trace[29]!).toBeGreaterThan(50 + 0.632 * 92 - 4) // 63 % of the 92 bpm rise after 30 s
    expect(trace[29]!).toBeLessThan(50 + 0.632 * 92 + 4)
    expect(Math.abs(trace[599]! - m.steadyStateHr(200))).toBeLessThan(3)
    expect(m.steadyStateHr(200)).toBeCloseTo(50 + 115 * 0.8 + m.driftBpm, 9)
    const peak = trace[599]!
    for (let t = 0; t < 600; t++) trace.push(m.step(0, 1))
    expect(Math.abs(trace[659]! - (rise + (peak - rise) * Math.exp(-1)))).toBeLessThan(4) // 60 s into recovery
    expect(trace[1199]!).toBeLessThan(rise + 4)
    for (const hr of trace) {
      expect(hr).toBeGreaterThanOrEqual(50)
      expect(hr).toBeLessThanOrEqual(190)
    }
  })

  it('caps at max HR under very hard efforts', () => {
    const m = new HeartRateModel({ ...athlete, rng: createRng(2) })
    let hr = 0
    for (let t = 0; t < 300; t++) hr = m.step(500, 1)
    expect(hr).toBeLessThanOrEqual(190)
    expect(hr).toBeGreaterThan(185)
  })

  it('drifts about +5 bpm per hour above 60 % FTP, and not below it', () => {
    const hard = new HeartRateModel({ ...athlete, rng: createRng(3) })
    const easy = new HeartRateModel({ ...athlete, rng: createRng(3) })
    for (let t = 0; t < 3600; t++) {
      hard.step(200, 1)
      easy.step(140, 1)
    }
    expect(hard.driftBpm).toBeCloseTo(5, 6)
    expect(easy.driftBpm).toBe(0)
  })

  it('emits RR intervals that average 60000 / HR', () => {
    const m = new HeartRateModel({ ...athlete, rng: createRng(4) })
    for (let t = 0; t < 300; t++) {
      m.step(200, 1)
      m.rr(1)
    }
    const rr: number[] = []
    const hr: number[] = []
    for (let t = 0; t < 300; t++) {
      hr.push(m.step(200, 1))
      rr.push(...m.rr(1))
    }
    expect(rr.length).toBeGreaterThan(650) // ≈ 143 bpm × 5 min
    expect(Math.abs(mean(rr) / (60000 / mean(hr)) - 1)).toBeLessThan(0.01)
  })

  it('has 3–5 % beat-to-beat variability at rest, much less when hard, and α1 falling with intensity', () => {
    const collect = (watts: number, seed: number) => {
      const m = new HeartRateModel({ ...athlete, rng: createRng(seed) })
      const rr: number[] = []
      for (let t = 0; t < 900; t++) {
        m.step(watts, 1)
        const beats = m.rr(1)
        if (t >= 300) rr.push(...beats)
      }
      return rr
    }
    const rest = collect(0, 5)
    const hard = collect(280, 6)
    const restRel = rmssd(rest)! / mean(rest)
    expect(restRel).toBeGreaterThan(0.03)
    expect(restRel).toBeLessThan(0.05)
    expect(rmssd(hard)! / mean(hard)).toBeLessThan(0.02)
    expect(dfaAlpha1(rest)!).toBeGreaterThan(dfaAlpha1(hard)!)
  })

  it('keeps the beat phase across ticks, whatever the tick length', () => {
    const m = new HeartRateModel({ ...athlete, rng: createRng(7) })
    for (let t = 0; t < 600; t++) m.step(0, 1)
    let beats = 0
    for (let i = 0; i < 240; i++) beats += m.rr(0.25).length // 60 s in 4 Hz ticks
    expect(Math.abs(beats - m.bpm)).toBeLessThan(3)
    expect(m.rr(0)).toEqual([])
  })

  it('is deterministic for a fixed seed, including by default', () => {
    const run = (m: HeartRateModel) => Array.from({ length: 120 }, (_, t) => [m.step(t < 60 ? 250 : 50, 1), ...m.rr(1)])
    expect(run(new HeartRateModel({ ...athlete, rng: createRng(9) }))).toEqual(run(new HeartRateModel({ ...athlete, rng: createRng(9) })))
    expect(run(new HeartRateModel(athlete))).toEqual(run(new HeartRateModel(athlete)))
  })

  it('validates its options', () => {
    expect(() => new HeartRateModel({ ...athlete, lthr: 40 })).toThrow(RangeError)
    expect(() => new HeartRateModel({ ...athlete, maxHr: 150 })).toThrow(RangeError)
    expect(() => new HeartRateModel({ ...athlete, ftpW: 0 })).toThrow(RangeError)
  })
})

describe('RiderModel', () => {
  it('ERG: delivered power reaches 200 ± 5 W within 10 s, at the preferred cadence', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rider = new RiderModel({ ftpW: 250, rng: createRng(seed) })
      const power: number[] = []
      const cadence: number[] = []
      for (let i = 1; i <= 48; i++) {
        const out = rider.pedal({ mode: 'erg', targetW: 200, dtS: 0.25 })
        if (i > 40) {
          power.push(out.powerW) // the 2 s after the 10 s mark
          cadence.push(out.cadenceRpm)
        }
      }
      expect(Math.abs(mean(power) - 200)).toBeLessThan(5)
      expect(Math.abs(mean(cadence) - 88)).toBeLessThan(5)
    }
  })

  it('effort: at 1.3 × CP, W′ runs out after ≈ W′ / (P − CP), then power drops to ≤ 90 % CP', () => {
    const cpW = 250
    const wPrimeJ = 20_000
    const rider = new RiderModel({ ftpW: 250, cpW, wPrimeJ, rng: createRng(12) })
    const desiredW = 1.3 * cpW
    let t = 0
    while (!rider.pedal({ mode: 'effort', desiredW, dtS: 1 }).fatigued && t < 1000) t++
    const expected = wPrimeJ / (desiredW - cpW) // 267 s
    expect(Math.abs(t + 1 - expected) / expected).toBeLessThan(0.15)
    expect(rider.fatigued).toBe(true)
    const after: number[] = []
    for (let i = 0; i < 60; i++) after.push(rider.pedal({ mode: 'effort', desiredW, dtS: 1 }).powerW)
    expect(Math.abs(mean(after.slice(10)) - 0.9 * cpW)).toBeLessThan(0.03 * cpW)
  })

  it('is no longer fatigued once 20 % of W′ has recovered', () => {
    const rider = new RiderModel({ ftpW: 250, cpW: 250, wPrimeJ: 20_000, rng: createRng(13) })
    let exhausted = false
    while (!exhausted) exhausted = rider.pedal({ mode: 'effort', desiredW: 400, dtS: 1 }).fatigued
    let t = 0
    while (rider.pedal({ mode: 'coast', dtS: 1 }).fatigued && t < 600) t++
    // From ≈ 0 J while coasting: 20000 − 20000·e^(−250·t/20000) = 4000 → t ≈ 18 s
    expect(t).toBeGreaterThan(12)
    expect(t).toBeLessThan(25)
    expect(rider.wPrimeBalJ).toBeGreaterThanOrEqual(4000)
  })

  it('coast: 0 W at once, and cadence falls linearly to 0 over 2 s', () => {
    const rider = new RiderModel({ ftpW: 250, rng: createRng(14) })
    for (let i = 0; i < 120; i++) rider.pedal({ mode: 'erg', targetW: 180, dtS: 0.25 })
    const coast: PedalInput = { mode: 'coast', dtS: 0.25 }
    const first = rider.pedal(coast)
    expect(first.powerW).toBe(0)
    for (let i = 1; i < 4; i++) rider.pedal(coast)
    expect(rider.pedal({ mode: 'coast', dtS: 0 }).cadenceRpm).toBeCloseTo(44, 6)
    for (let i = 0; i < 4; i++) rider.pedal(coast)
    expect(rider.pedal(coast).cadenceRpm).toBe(0)
  })

  it('setPreferredCadence moves the cadence the rider settles at', () => {
    const rider = new RiderModel({ ftpW: 250, preferredCadence: 90, rng: createRng(15) })
    rider.setPreferredCadence(70)
    const cad: number[] = []
    for (let i = 0; i < 80; i++) cad.push(rider.pedal({ mode: 'erg', targetW: 150, dtS: 0.25 }).cadenceRpm)
    expect(Math.abs(mean(cad.slice(40)) - 70)).toBeLessThan(4)
    expect(rider.preferredCadence).toBe(70)
  })

  it('is deterministic for a fixed seed', () => {
    const run = (r: RiderModel) =>
      Array.from({ length: 200 }, (_, i) =>
        r.pedal(i < 80 ? { mode: 'erg', targetW: 220, dtS: 0.25 } : i < 150 ? { mode: 'effort', desiredW: 400, dtS: 0.25 } : { mode: 'coast', dtS: 0.25 }),
      )
    expect(run(new RiderModel({ ftpW: 250, rng: createRng(16) }))).toEqual(run(new RiderModel({ ftpW: 250, rng: createRng(16) })))
    expect(run(new RiderModel({ ftpW: 250 }))).toEqual(run(new RiderModel({ ftpW: 250 })))
  })

  it('rejects a non-positive FTP', () => {
    expect(() => new RiderModel({ ftpW: 0 })).toThrow(RangeError)
  })
})

describe('riderScriptState', () => {
  const script = [
    { atS: 60, action: 'stop' as const },
    { atS: 90, action: 'resume' as const },
    { atS: 30, action: 'cadence' as const, value: 100 },
    { atS: 120, action: 'cadence' as const, value: 75 },
  ]

  it('applies the events up to the given time, in time order', () => {
    expect(riderScriptState(script, 10)).toEqual({ stopped: false, cadenceRpm: null })
    expect(riderScriptState(script, 30)).toEqual({ stopped: false, cadenceRpm: 100 })
    expect(riderScriptState(script, 75)).toEqual({ stopped: true, cadenceRpm: 100 })
    expect(riderScriptState(script, 90)).toEqual({ stopped: false, cadenceRpm: 100 })
    expect(riderScriptState(script, 500)).toEqual({ stopped: false, cadenceRpm: 75 })
    expect(riderScriptState([], 10)).toEqual({ stopped: false, cadenceRpm: null })
  })
})
