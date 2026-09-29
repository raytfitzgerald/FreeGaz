import { describe, expect, it } from 'vitest'
import { SensorHub } from './hub'
import type { Metric } from './types'

const push = (hub: SensorHub, metric: Metric, sourceId: string, t: number, value: number) =>
  hub.ingest({ metric, sourceId, tMono: t, value })

describe('SensorHub freshness', () => {
  it('returns the latest value while fresh and null once past TTL (missing is not zero)', () => {
    const hub = new SensorHub()
    push(hub, 'power', 'trainer', 1000, 210)
    expect(hub.value('power', 1500)).toBe(210)
    expect(hub.value('power', 4000)).toBe(210) // exactly at TTL (3 s)
    expect(hub.value('power', 4001)).toBeNull()
  })

  it('treats a real zero as a value', () => {
    const hub = new SensorHub()
    push(hub, 'cadence', 'trainer', 0, 0)
    expect(hub.value('cadence', 100)).toBe(0)
  })

  it('ignores non-finite and out-of-order samples', () => {
    const hub = new SensorHub()
    push(hub, 'hr', 'strap', 1000, 140)
    push(hub, 'hr', 'strap', 500, 99)
    push(hub, 'hr', 'strap', 1200, Number.NaN)
    expect(hub.value('hr', 1300)).toBe(140)
  })
})

describe('SensorHub source priority and failover', () => {
  it('prefers the higher-priority source when both are fresh', () => {
    const hub = new SensorHub()
    hub.setPriority('power', ['pedals', 'trainer'])
    push(hub, 'power', 'trainer', 0, 200)
    push(hub, 'power', 'pedals', 0, 195)
    expect(hub.latest('power', 100)?.sourceId).toBe('pedals')
  })

  it('fails over immediately when the active source goes stale', () => {
    const hub = new SensorHub()
    hub.setPriority('power', ['pedals', 'trainer'])
    for (let t = 0; t <= 10_000; t += 1000) push(hub, 'power', 'trainer', t, 200)
    for (let t = 0; t <= 4000; t += 1000) push(hub, 'power', 'pedals', t, 195)
    expect(hub.latest('power', 4000)?.sourceId).toBe('pedals')
    // pedals stop at 4 s; stale after 7 s -> trainer takes over
    expect(hub.latest('power', 7500)?.sourceId).toBe('trainer')
  })

  it('switches back to the preferred source only after it streams for the hysteresis window', () => {
    const hub = new SensorHub()
    hub.setPriority('power', ['pedals', 'trainer'])
    const switches: string[] = []
    hub.onSourceSwitch((s) => switches.push(`${s.from}->${s.to}`))
    for (let t = 0; t <= 30_000; t += 1000) push(hub, 'power', 'trainer', t, 200)
    push(hub, 'power', 'pedals', 0, 190)
    hub.latest('power', 0)
    hub.latest('power', 5000) // pedals stale -> trainer
    // pedals come back at 10 s and stream steadily
    for (let t = 10_000; t <= 30_000; t += 1000) push(hub, 'power', 'pedals', t, 190)
    expect(hub.latest('power', 12_000)?.sourceId).toBe('trainer') // only streaming 2 s
    expect(hub.latest('power', 15_000)?.sourceId).toBe('pedals') // 5 s streak
    expect(switches).toEqual(['null->pedals', 'pedals->trainer', 'trainer->pedals'])
  })
})

describe('SensorHub.meanOver (time-weighted, sample-and-hold)', () => {
  it('weights each sample by how long it held', () => {
    const hub = new SensorHub()
    push(hub, 'power', 'trainer', 0, 100)
    push(hub, 'power', 'trainer', 250, 300)
    // [0,1000): 100 for 250 ms, 300 for 750 ms
    expect(hub.meanOver('power', 0, 1000)).toBeCloseTo(250, 6)
  })

  it('uses the sample that was already holding at the window start', () => {
    const hub = new SensorHub()
    push(hub, 'power', 'trainer', 0, 180)
    push(hub, 'power', 'trainer', 2000, 220)
    expect(hub.meanOver('power', 1000, 2000)).toBeCloseTo(180, 6)
    expect(hub.meanOver('power', 1500, 2500)).toBeCloseTo(200, 6)
  })

  it('excludes spans past the TTL and returns null when nothing was valid', () => {
    const hub = new SensorHub()
    push(hub, 'power', 'trainer', 0, 200)
    // valid until 3000; window [2000, 6000) only has 1000 ms valid
    expect(hub.meanOver('power', 2000, 6000, 'trainer')).toBeCloseTo(200, 6)
    expect(hub.meanOver('power', 4000, 5000, 'trainer')).toBeNull()
  })

  it('makes energy exact: sum of 1 s means equals the integral', () => {
    const hub = new SensorHub()
    // irregular 4 Hz-ish samples with jitter
    let t = 0
    let integral = 0
    let prevT = 0
    let prevV = 0
    for (let i = 0; i < 400; i++) {
      const v = 150 + ((i * 37) % 120)
      if (i > 0) integral += prevV * (t - prevT)
      push(hub, 'power', 'trainer', t, v)
      prevT = t
      prevV = v
      t += 200 + ((i * 13) % 110)
    }
    integral += prevV * (Math.floor(prevT / 1000) * 1000 + 1000 - prevT)
    let sum = 0
    for (let s = 0; s < Math.ceil(prevT / 1000); s++) sum += (hub.meanOver('power', s * 1000, (s + 1) * 1000) ?? 0) * 1000
    expect(sum / 1000).toBeCloseTo(integral / 1000, 3)
  })
})

describe('SensorHub RR buffer and pruning', () => {
  it('returns RR intervals in a window', () => {
    const hub = new SensorHub()
    hub.ingestRr({ rrMs: [800, 810], tMono: 1000, sourceId: 'strap' })
    hub.ingestRr({ rrMs: [790], tMono: 2000, sourceId: 'strap' })
    expect(hub.rrBetween(0, 1500)).toEqual([800, 810])
    expect(hub.rrBetween(0, 3000)).toEqual([800, 810, 790])
  })

  it('prunes old history but keeps means exact near the boundary', () => {
    const hub = new SensorHub()
    for (let t = 0; t <= 10 * 60_000; t += 1000) push(hub, 'power', 'trainer', t, 200)
    hub.prune(10 * 60_000)
    expect(hub.meanOver('power', 9 * 60_000, 9 * 60_000 + 1000)).toBeCloseTo(200, 6)
  })

  it('removeSource forgets a device', () => {
    const hub = new SensorHub()
    push(hub, 'hr', 'watch', 0, 120)
    hub.removeSource('watch')
    expect(hub.value('hr', 100)).toBeNull()
  })
})
