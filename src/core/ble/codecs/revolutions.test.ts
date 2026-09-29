import { describe, expect, it } from 'vitest'
import { RevolutionRateCalculator, wheelSpeedMps } from './revolutions'

interface Sample {
  revs: number
  time: number
  nowMs: number
}

/**
 * What a sensor reports while something turns at a constant rate: at each
 * notification, the cumulative count and the event time of the latest
 * revolution (rounded to whole ticks), both wrapped like the real counters.
 */
function stream(o: {
  rpm: number
  hz: 1024 | 2048
  revBits: 16 | 32
  startRevs: number
  startTicks: number
  seconds: number
  notifyMs: number
}): Sample[] {
  const periodS = 60 / o.rpm
  const out: Sample[] = []
  for (let t = o.notifyMs; t <= o.seconds * 1000; t += o.notifyMs) {
    const k = Math.floor(t / 1000 / periodS)
    out.push({
      revs: (o.startRevs + k) % 2 ** o.revBits,
      time: (o.startTicks + Math.round(k * periodS * o.hz)) % 0x10000,
      nowMs: t,
    })
  }
  return out
}

const crank = () => new RevolutionRateCalculator({ timeResolutionHz: 1024, revBits: 16 })
const feed = (calc: RevolutionRateCalculator, samples: Sample[]) => samples.map((s) => calc.update(s.revs, s.time, s.nowMs))

describe('RevolutionRateCalculator', () => {
  it('returns null for the first sample', () => {
    expect(crank().update(100, 1234, 0)).toBeNull()
  })

  it('tracks a steady 90 rpm at 1024 Hz across event-time and counter rollovers', () => {
    // The counter starts 36 revolutions before its 16-bit wrap; the event time
    // wraps after ~5 s and then every 64 s. 150 s at 1 Hz, 1-2 revolutions per notification.
    const samples = stream({ rpm: 90, hz: 1024, revBits: 16, startRevs: 65500, startTicks: 60000, seconds: 150, notifyMs: 1000 })
    const timeWraps = samples.filter((s, i) => i > 0 && s.time < (samples[i - 1]?.time ?? 0)).length
    const revWraps = samples.filter((s, i) => i > 0 && s.revs < (samples[i - 1]?.revs ?? 0)).length
    expect(timeWraps).toBeGreaterThanOrEqual(3)
    expect(revWraps).toBe(1)

    const [first, ...rest] = feed(crank(), samples)
    expect(first).toBeNull()
    for (const rpm of rest) expect(Math.abs((rpm ?? NaN) - 90)).toBeLessThan(0.15)
  })

  it('keeps the last rate for repeated events, then decays to 0 after staleMs', () => {
    const calc = crank()
    const samples = stream({ rpm: 90, hz: 1024, revBits: 16, startRevs: 0, startTicks: 0, seconds: 10, notifyMs: 1000 })
    const last = feed(calc, samples).at(-1)
    const end = samples.at(-1)
    if (!end || last == null) throw new Error('stream too short')
    expect(last).toBeCloseTo(90, 0) // a new revolution arrived at 10 000 ms

    // Coasting: the same count and event time keep arriving.
    for (const now of [10500, 11000, 12000, 12499]) expect(calc.update(end.revs, end.time, now)).toBe(last)
    expect(calc.update(end.revs, end.time, 12500)).toBe(0) // staleMs (2500) after the last new event
    expect(calc.update(end.revs, end.time, 15000)).toBe(0)
  })

  it('reports 0 for a sensor that never turns', () => {
    const calc = crank()
    expect(calc.update(7, 500, 0)).toBeNull()
    expect(calc.update(7, 500, 1000)).toBeNull() // no rate known yet, not stale yet
    expect(calc.update(7, 500, 2500)).toBe(0)
  })

  it('honours a custom staleMs', () => {
    const calc = new RevolutionRateCalculator({ timeResolutionHz: 1024, revBits: 16, staleMs: 5000 })
    calc.update(1, 0, 0)
    calc.update(2, 683, 667)
    expect(calc.update(2, 683, 5000)).toBeCloseTo(90, 0)
    expect(calc.update(2, 683, 5667)).toBe(0)
  })

  it('handles the 16-bit counter wrapping from 65535 to 0', () => {
    const calc = crank()
    // 683 ticks per revolution = 89.96 rpm
    expect(calc.update(65534, 1000, 0)).toBeNull()
    expect(calc.update(65535, 1683, 667)).toBeCloseTo(89.96, 2)
    expect(calc.update(0, 2366, 1333)).toBeCloseTo(89.96, 2)
    expect(calc.update(1, 3049, 2000)).toBeCloseTo(89.96, 2)
  })

  it('handles the event time wrapping from 65535 to 0', () => {
    const calc = crank()
    calc.update(10, 65000, 0)
    // (147 - 65000) mod 65536 = 683 ticks
    expect(calc.update(11, 147, 667)).toBeCloseTo(89.96, 2)
  })

  it('treats a changed event time without a new revolution as no event', () => {
    const calc = crank()
    calc.update(100, 0, 0)
    expect(calc.update(101, 683, 667)).toBeCloseTo(89.96, 2)
    expect(calc.update(101, 900, 1000)).toBeCloseTo(89.96, 2) // kept; reference not moved
    expect(calc.update(102, 1366, 1333)).toBeCloseTo(89.96, 2) // 683 ticks from the reference, not 466
  })

  it('rejects an absurd spike, returning the previous rate, and recovers', () => {
    const calc = crank()
    calc.update(100, 0, 0)
    const steady = calc.update(101, 683, 667)
    expect(steady).toBeCloseTo(89.96, 2)
    // Corrupted count: +50 revolutions in 683 ticks would be ~4500 rpm.
    expect(calc.update(151, 1366, 1333)).toBe(steady)
    // Back on the true count: a backwards jump (a huge wrapped delta) is rejected too...
    expect(calc.update(102, 2049, 2000)).toBe(steady)
    // ...and the next sample is measured normally again.
    expect(calc.update(103, 2732, 2667)).toBeCloseTo(89.96, 2)
    // Revolutions with no elapsed ticks are rejected the same way.
    expect(calc.update(104, 2732, 3333)).toBeCloseTo(89.96, 2)
    expect(calc.update(105, 3415, 4000)).toBeCloseTo(89.96, 2)
  })

  it('applies maxRatePerMin (default 250 for cranks)', () => {
    // 1 revolution in 236 ticks = 260.3 rpm
    const strict = crank()
    strict.update(0, 0, 0)
    expect(strict.update(1, 236, 231)).toBeNull() // rejected; there was no previous rate
    const loose = new RevolutionRateCalculator({ timeResolutionHz: 1024, revBits: 16, maxRatePerMin: 300 })
    loose.update(0, 0, 0)
    expect(loose.update(1, 236, 231)).toBeCloseTo(260.3, 1)
  })

  it('restarts after a gap longer than the rollover-safe window (60 s at 1024 Hz)', () => {
    const calc = crank()
    feed(calc, stream({ rpm: 90, hz: 1024, revBits: 16, startRevs: 0, startTicks: 0, seconds: 10, notifyMs: 1000 }))
    // No notifications for 61 s, then the sensor is back.
    expect(calc.update(200, 30000, 71000)).toBeNull()
    expect(calc.update(201, 30683, 71667)).toBeCloseTo(89.96, 2)
  })

  it('restarts when a revolution follows more than 60 s of coasting', () => {
    const calc = crank()
    const samples = stream({ rpm: 90, hz: 1024, revBits: 16, startRevs: 0, startTicks: 0, seconds: 10, notifyMs: 1000 })
    feed(calc, samples)
    const end = samples.at(-1)
    if (!end) throw new Error('stream too short')
    for (let now = 11000; now <= 75000; now += 1000) {
      const rpm = calc.update(end.revs, end.time, now)
      if (now >= 12500) expect(rpm).toBe(0)
    }
    // The event time may have wrapped more than once since the last revolution.
    expect(calc.update(end.revs + 1, (end.time + 5000) % 0x10000, 75500)).toBeNull()
    expect(calc.update(end.revs + 2, (end.time + 5683) % 0x10000, 76167)).toBeCloseTo(89.96, 2)
  })

  it('reports the rate since the last event when pedalling resumes after a short stop', () => {
    const calc = crank()
    calc.update(0, 0, 0)
    calc.update(1, 683, 667)
    expect(calc.update(1, 683, 3200)).toBe(0) // stale
    // Next revolution 3 s (3072 ticks) after the last one: 20 rpm.
    expect(calc.update(2, 683 + 3072, 3700)).toBe(20)
  })

  it('tracks a 300 rpm wheel at 2048 Hz across 32-bit counter and 32 s event-time rollovers', () => {
    const calc = new RevolutionRateCalculator({ timeResolutionHz: 2048, revBits: 32, maxRatePerMin: 2000 })
    const samples = stream({ rpm: 300, hz: 2048, revBits: 32, startRevs: 2 ** 32 - 20, startTicks: 65000, seconds: 70, notifyMs: 250 })
    expect(samples.some((s, i) => i > 0 && s.revs < (samples[i - 1]?.revs ?? 0))).toBe(true)
    const [first, ...rest] = feed(calc, samples)
    expect(first).toBeNull()
    for (const rpm of rest) expect(Math.abs((rpm ?? NaN) - 300)).toBeLessThan(0.5)
    expect(wheelSpeedMps(rest.at(-1) ?? 0, 2096)).toBeCloseTo(10.48, 1)
  })

  it('uses a 30 s window at 2048 Hz', () => {
    const wheel = () => {
      const calc = new RevolutionRateCalculator({ timeResolutionHz: 2048, revBits: 32, maxRatePerMin: 2000 })
      calc.update(0, 0, 0)
      calc.update(1, 410, 200)
      return calc
    }
    // 29 s later: 145 revolutions in 59392 ticks is still unambiguous.
    expect(wheel().update(146, (410 + 59392) % 0x10000, 29200)).toBeCloseTo(300, 0)
    // 31 s later: restart.
    expect(wheel().update(156, (410 + 63488) % 0x10000, 31200)).toBeNull()
  })

  it('reset() forgets everything', () => {
    const calc = crank()
    calc.update(0, 0, 0)
    calc.update(1, 683, 667)
    calc.reset()
    expect(calc.update(2, 1366, 1333)).toBeNull()
    expect(calc.update(3, 2049, 2000)).toBeCloseTo(89.96, 2)
  })

  it('refuses non-finite input', () => {
    expect(() => crank().update(Number.NaN, 0, 0)).toThrow(RangeError)
    expect(() => crank().update(0, 0, Infinity)).toThrow(RangeError)
  })
})

describe('wheelSpeedMps', () => {
  it('converts rev/min and circumference to m/s', () => {
    expect(wheelSpeedMps(300, 2096)).toBeCloseTo(10.48, 10) // 5 rev/s × 2.096 m
    expect(wheelSpeedMps(60, 1000)).toBe(1)
    expect(wheelSpeedMps(0, 2096)).toBe(0)
  })
})
