import { describe, expect, it } from 'vitest'
import { SensorHub } from '../sensors/hub'
import { FakeClock } from '../time/clock'
import { RideRecorder, type RideRecord } from './recorder'

function setup() {
  const clock = new FakeClock(Date.UTC(2026, 8, 29, 6, 0, 0))
  const hub = new SensorHub()
  const rec = new RideRecorder(hub, clock)
  return { clock, hub, rec }
}

/** Feeds power at `hz` from `from` to `to` (ms) with a value function. */
function feed(hub: SensorHub, from: number, to: number, hz: number, value: (t: number) => number, metric: 'power' | 'cadence' | 'hr' = 'power') {
  for (let t = from; t < to; t += 1000 / hz) hub.ingest({ metric, value: value(t), tMono: t, sourceId: 'trainer:ftms' })
}

describe('RideRecorder', () => {
  it('emits one record per moving second with exact means', () => {
    const { clock, hub, rec } = setup()
    feed(hub, 0, 10_000, 4, (t) => (t % 1000 < 500 ? 100 : 300))
    rec.start(0)
    clock.advance(10_000)
    const records = rec.collect(10_000)
    expect(records).toHaveLength(10)
    expect(records.every((r) => r.power === 200)).toBe(true)
    expect(records.map((r) => r.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('catches up correctly after a late tick', () => {
    const { hub, rec } = setup()
    feed(hub, 0, 6000, 4, (t) => 150 + Math.floor(t / 1000) * 10)
    rec.start(0)
    const a = rec.collect(1000)
    const b = rec.collect(5000) // 4 s late
    expect([...a, ...b].map((r) => r.power)).toEqual([150, 160, 170, 180, 190])
  })

  it('timestamps are whole seconds and strictly increasing', () => {
    const { clock, hub, rec } = setup()
    feed(hub, 0, 5000, 4, () => 200)
    rec.start(0)
    clock.advance(5000)
    const ts = rec.collect(5000).map((r) => r.ts)
    for (let i = 1; i < ts.length; i++) expect(ts[i]! - ts[i - 1]!).toBe(1000)
    expect(ts.every((t) => t % 1000 === 0)).toBe(true)
  })

  it('pause takes effect at the slot boundary and resume starts a fresh slot', () => {
    const { hub, rec } = setup()
    feed(hub, 0, 20_000, 4, () => 200)
    rec.start(0)
    rec.collect(2500) // 2 records, mid-slot 3
    rec.requestPause()
    const r = rec.collect(3100) // slot [2000,3000) completes, then pause
    expect(r).toHaveLength(1)
    expect(rec.isPaused).toBe(true)
    expect(rec.collect(9000)).toHaveLength(0)
    rec.resume(9000)
    expect(rec.collect(12_000)).toHaveLength(3)
    expect(rec.movingSeconds).toBe(6)
  })

  it('a resume before the requested pause takes effect cancels it, so recording carries on', () => {
    const { hub, rec } = setup()
    feed(hub, 0, 20_000, 4, () => 200)
    rec.start(0)
    rec.collect(2500)
    rec.requestPause()
    rec.resume(2600) // pressed again within the same second
    rec.collect(10_000)
    expect(rec.isPaused).toBe(false)
    expect(rec.movingSeconds).toBe(10)
  })

  it('records null, never 0, when the sensor goes silent', () => {
    const { hub, rec } = setup()
    feed(hub, 0, 2000, 4, () => 220)
    rec.start(0)
    const records = rec.collect(8000)
    // valid until 2000 + 3000 TTL; slots after 5 s have no valid power
    expect(records.map((r) => r.power)).toEqual([220, 220, 220, 220, 220, null, null, null])
  })

  it('laps advance at slot boundaries', () => {
    const { hub, rec } = setup()
    feed(hub, 0, 5000, 4, () => 200)
    rec.start(0)
    rec.collect(2000)
    rec.requestLap()
    const r = rec.collect(5000)
    expect(r.map((x) => x.lap)).toEqual([0, 1, 1])
    expect(rec.lapIndex).toBe(1)
  })

  it('integrates distance from speed and carries HR as the holding value', () => {
    const { hub, rec } = setup()
    for (let t = 0; t < 5000; t += 250) hub.ingest({ metric: 'speed', value: 10, tMono: t, sourceId: 'trainer:ftms' })
    feed(hub, 0, 5000, 1, (t) => 120 + t / 1000, 'hr')
    rec.start(0)
    const r = rec.collect(5000)
    expect(r.at(-1)?.distance).toBeCloseTo(50, 5)
    expect(r.map((x) => x.hr)).toEqual([121, 122, 123, 124, 124])
  })

  it('a 3-hour jittery ride: records == moving seconds and kJ matches the integral', () => {
    const { hub, rec } = setup()
    let t = 0
    let integral = 0
    const all: RideRecord[] = []
    rec.start(0)
    let prevT = 0
    let prevV = 0
    let nextCollect = 250
    while (t < 3 * 3600_000) {
      const v = 180 + ((t / 7919) % 90)
      if (t > 0) integral += prevV * (t - prevT)
      hub.ingest({ metric: 'power', value: v, tMono: t, sourceId: 'trainer:ftms' })
      prevT = t
      prevV = v
      t += 220 + ((t / 13) % 60) // irregular 3.5-4.5 Hz
      if (t >= nextCollect) {
        all.push(...rec.collect(t))
        nextCollect = t + 250 + ((t / 17) % 900) // late ticks up to ~1 s
      }
      if (t % 60_000 < 300) hub.prune(t)
    }
    const covered = all.length * 1000
    integral += prevV * Math.max(0, covered - prevT)
    expect(all.length).toBe(rec.movingSeconds)
    expect(all.length).toBeGreaterThanOrEqual(3 * 3600 - 2)
    const kj = all.reduce((s, r) => s + (r.power ?? 0), 0) / 1000
    // power is rounded to whole watts per second, so allow 0.1 %
    expect(Math.abs(kj - integral / 1e6) / (integral / 1e6)).toBeLessThan(0.001)
  })
})
