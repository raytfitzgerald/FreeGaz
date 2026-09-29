import { describe, expect, it } from 'vitest'
import { haversineM } from './geo'
import { sampleAt } from './lookup'
import { RoutePlayer } from './player'
import { DEMO_ROUTE_SPECS, demoRoutes, syntheticPoints, syntheticRoute, type SyntheticSpec } from './synthetic'

const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length

describe('syntheticRoute', () => {
  it('builds a flat 5 km along a straight line, 10 m between points', () => {
    const route = syntheticRoute({ name: 'Flat', segments: [{ kind: 'flat', lengthM: 5000 }] })
    expect(route).toMatchObject({ source: 'synthetic', name: 'Flat', distanceM: 5000, elevationGainM: 0, elevationLossM: 0, hasTimes: false })
    expect(route.profile.every((p) => Math.abs(p.gradePct) < 1e-9 && Math.abs(p.ele - 100) < 1e-9)).toBe(true)
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1]!
      const b = route.points[i]!
      expect(haversineM(a.lat, a.lon, b.lat, b.lon)).toBeCloseTo(10, 6)
    }
  })

  it('builds a 3 km climb at 6 %', () => {
    const route = syntheticRoute({
      segments: [
        { kind: 'flat', lengthM: 500 },
        { kind: 'climb', lengthM: 3000, gradePct: 6 },
        { kind: 'flat', lengthM: 500 },
      ],
    })
    expect(route.elevationGainM).toBeCloseTo(180, 0)
    const climb = route.profile.filter((p) => p.distM >= 700 && p.distM <= 3300).map((p) => p.gradePct)
    expect(mean(climb)).toBeCloseTo(6, 2)
    // Measured on the flats, clear of the rounded corners at 500 m and 3500 m.
    expect(sampleAt(route.profile, 3600).ele - sampleAt(route.profile, 400).ele).toBeCloseTo(180, 6)
  })

  it('builds rolling sine hills', () => {
    const route = syntheticRoute({ segments: [{ kind: 'rolling', lengthM: 10_000, amplitudeM: 15, wavelengthM: 1250 }] })
    expect(route.elevationGainM).toBeCloseTo(240, -1) // 8 waves of 30 m, from and back to the mid-line
    expect(Math.abs(route.elevationGainM - 240)).toBeLessThan(2)
    expect(route.maxGradePct).toBeCloseTo((15 * 2 * Math.PI * 100) / 1250, 0) // 7.5 %
    expect(route.minGradePct).toBeCloseTo((-15 * 2 * Math.PI * 100) / 1250, 0)
  })

  it('closes a loop and returns to the start elevation, with per-segment recorded speeds', () => {
    const route = syntheticRoute({
      shape: 'loop',
      segments: [
        { kind: 'flat', lengthM: 1000, speedKmh: 32 },
        { kind: 'climb', lengthM: 2000, gradePct: 4, speedKmh: 20 },
        { kind: 'flat', lengthM: 1000, speedKmh: 32 },
        { kind: 'climb', lengthM: 2000, gradePct: -4, speedKmh: 42 },
      ],
    })
    const first = route.points[0]!
    const last = route.points.at(-1)!
    expect(haversineM(first.lat, first.lon, last.lat, last.lon)).toBeLessThan(0.01)
    expect(last.ele).toBeCloseTo(first.ele!, 9)
    expect(route.elevationGainM).toBeCloseTo(80, 0)
    expect(route.elevationLossM).toBeCloseTo(80, 0)
    expect(route.hasTimes).toBe(true)
    // Timestamps are whole milliseconds, like a real file's, hence 2 decimals.
    expect(sampleAt(route.profile, 500).recordedMps).toBeCloseTo(32 / 3.6, 2)
    expect(sampleAt(route.profile, 2000).recordedMps).toBeCloseTo(20 / 3.6, 2)
    expect(sampleAt(route.profile, 5000).recordedMps).toBeCloseTo(42 / 3.6, 2)
  })

  it('is deterministic, with a stable default id', () => {
    const spec: SyntheticSpec = { segments: [{ kind: 'climb', lengthM: 1234, gradePct: 3 }] }
    const a = syntheticRoute(spec)
    expect(syntheticRoute(spec)).toEqual(a)
    expect(a.id).toMatch(/^synthetic-[0-9a-f]{16}$/)
    expect(syntheticRoute({ ...spec, id: 'mine' }).id).toBe('mine')
  })
})

describe('syntheticPoints', () => {
  it('always puts a point on segment boundaries', () => {
    const pts = syntheticPoints({
      segments: [
        { kind: 'flat', lengthM: 15 },
        { kind: 'climb', lengthM: 12, gradePct: 10 },
      ],
    })
    expect(pts.map((p) => p.distM)).toEqual([0, 10, 15, 20, 27])
    expect(pts.map((p) => p.ele)).toEqual([100, 100, 100, 100.5, 101.2])
  })

  it('adds timestamps at the given speed', () => {
    const pts = syntheticPoints({ speedKmh: 36, startTimeMs: 0, segments: [{ kind: 'flat', lengthM: 50 }] })
    expect(pts.map((p) => p.t)).toEqual([0, 1000, 2000, 3000, 4000, 5000])
    expect(syntheticPoints({ segments: [{ kind: 'flat', lengthM: 50 }] })[1]).not.toHaveProperty('t')
  })

  it('starts where it is told and heads the way it is told', () => {
    const pts = syntheticPoints({ origin: { lat: -33.5, lon: 151.25 }, bearingDeg: 0, segments: [{ kind: 'flat', lengthM: 1000 }] })
    expect(pts[0]).toMatchObject({ lat: -33.5, lon: 151.25 })
    expect(pts.at(-1)!.lat).toBeGreaterThan(-33.5)
    expect(pts.at(-1)!.lon).toBeCloseTo(151.25, 9)
  })

  it('rejects impossible specs', () => {
    expect(() => syntheticPoints({ segments: [] })).toThrow(RangeError)
    expect(() => syntheticPoints({ segments: [{ kind: 'flat', lengthM: 0 }] })).toThrow(RangeError)
    expect(() => syntheticPoints({ spacingM: -1, segments: [{ kind: 'flat', lengthM: 10 }] })).toThrow(RangeError)
    expect(() => syntheticPoints({ speedKmh: 0, segments: [{ kind: 'flat', lengthM: 10 }] })).toThrow(RangeError)
    expect(() => syntheticPoints({ segments: [{ kind: 'rolling', lengthM: 10, amplitudeM: 1, wavelengthM: 0 }] })).toThrow(RangeError)
  })
})

describe('demo routes', () => {
  it('are FreeGaz originals with unique ids, and all rideable', () => {
    const routes = demoRoutes()
    expect(routes).toHaveLength(DEMO_ROUTE_SPECS.length)
    expect(new Set(routes.map((r) => r.id)).size).toBe(routes.length)
    for (const route of routes) {
      expect(route.name).toMatch(/^FreeGaz /)
      const player = new RoutePlayer(route, { mode: 'steady', speedModel: () => 0 })
      let s = player.state
      for (let t = 0; t < 60; t++) s = player.step({ dtS: 1, powerW: 200 })
      expect(s.distM).toBeGreaterThan(300)
    }
  })

  it('include the Test Loop, a closed timed loop', () => {
    const loop = demoRoutes().find((r) => r.name === 'FreeGaz Test Loop')!
    expect(loop.hasTimes).toBe(true)
    expect(loop.distanceM).toBe(6000)
    const first = loop.points[0]!
    const last = loop.points.at(-1)!
    expect(haversineM(first.lat, first.lon, last.lat, last.lon)).toBeLessThan(0.01)
  })
})
