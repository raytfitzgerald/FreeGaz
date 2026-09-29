import { describe, expect, it } from 'vitest'
import { lineTrack, mulberry32 } from './fixtures/tracks'
import { haversineM } from './geo'
import { sampleAt } from './lookup'
import type { ProfilePoint, RoutePoint } from './model'
import {
  DEFAULT_PROFILE_OPTIONS,
  buildProfile,
  elevationGainLoss,
  fillElevation,
  gridDistances,
  recordedSpeed,
  summarize,
} from './smooth'

const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length
const flat = (ele = 100) => (): number => ele
const gradeSteps = (profile: ProfilePoint[]): number[] => profile.slice(1).map((p, i) => Math.abs(p.gradePct - profile[i]!.gradePct))

/** Flat to 1 km, 6 % for 3 km, flat for the last 1 km. */
const climbEle = (s: number): number => (s < 1000 ? 100 : s < 4000 ? 100 + 0.06 * (s - 1000) : 280)

describe('defaults', () => {
  it('are the documented pipeline parameters', () => {
    expect(DEFAULT_PROFILE_OPTIONS).toEqual({
      spacingM: 10,
      spikeWindowM: 50,
      smoothWindowM: 100,
      smoothOrder: 2,
      gradeBaselineM: 50,
      maxGradePct: 25,
      maxGradeChangePer10mPct: 1.5,
      gainThresholdM: 2,
      speedWindowM: 100,
      minRecordedMps: 1,
      maxRecordedMps: 30,
    })
  })
})

describe('resampling', () => {
  it('puts a profile point every 10 m, then one at the exact end', () => {
    const profile = buildProfile(lineTrack({ lengthM: 1234.5, spacingM: 7, ele: flat() }))
    expect(profile).toHaveLength(125)
    profile.slice(0, -1).forEach((p, k) => expect(p.distM).toBe(k * 10))
    expect(profile.at(-1)!.distM).toBe(1234.5)
  })

  it('adds no extra point when the length is a multiple of the spacing, and honours custom spacing', () => {
    expect(buildProfile(lineTrack({ lengthM: 1000, spacingM: 3, ele: flat() }))).toHaveLength(101)
    const coarse = buildProfile(lineTrack({ lengthM: 1000, spacingM: 3, ele: flat() }), { spacingM: 25 })
    expect(coarse.map((p) => p.distM)).toEqual(Array.from({ length: 41 }, (_, k) => k * 25))
    expect(Array.from(gridDistances(25, 10))).toEqual([0, 10, 20, 25])
    expect(Array.from(gridDistances(0.3, 0.1))).toEqual([0, 0.1, 0.2, 0.3])
    expect(Array.from(gridDistances(4, 10))).toEqual([0, 4])
  })

  it('interpolates positions along the track and elevation on distance', () => {
    const origin = { lat: 45, lon: 7 }
    const sparse = lineTrack({ lengthM: 1000, spacingM: 250, ele: (s) => 100 + s / 50, origin })
    const profile = buildProfile(sparse)
    const mid = sampleAt(profile, 500)
    expect(haversineM(origin.lat, origin.lon, mid.lat, mid.lon)).toBeCloseTo(500, 1)
    expect(profile.find((p) => p.distM === 370)!.ele).toBeCloseTo(107.4, 6)
    expect(profile.every((p) => Math.abs(p.gradePct - 2) < 1e-6)).toBe(true)
  })

  it('treats distances relative to the first point', () => {
    const pts = lineTrack({ lengthM: 200, spacingM: 10, ele: flat() }).map((p) => ({ ...p, distM: p.distM + 5000 }))
    const profile = buildProfile(pts)
    expect(profile[0]!.distM).toBe(0)
    expect(profile.at(-1)!.distM).toBe(200)
  })
})

describe('missing elevation', () => {
  it('interpolates gaps on distance and holds the first and last known values', () => {
    const at = (distM: number, ele: number | null): RoutePoint => ({ lat: 45, lon: 7, ele, distM })
    const filled = fillElevation([at(0, null), at(10, 10), at(20, null), at(50, null), at(60, 18), at(70, null)])
    const expected = [10, 10, 11.6, 16.4, 18, 18]
    expected.forEach((v, i) => expect(filled[i]).toBeCloseTo(v, 12))
  })

  it('rides flat at 0 m when the file has no elevation at all', () => {
    const profile = buildProfile(lineTrack({ lengthM: 500, spacingM: 10, ele: () => null }))
    expect(profile.every((p) => p.ele === 0 && p.gradePct === 0)).toBe(true)
  })
})

describe('spikes and smoothing', () => {
  it('removes a single 30 m elevation spike completely', () => {
    const profile = buildProfile(lineTrack({ lengthM: 2000, spacingM: 7, ele: (_s, i) => (i === 100 ? 130 : 100) }))
    expect(Math.max(...profile.map((p) => Math.abs(p.ele - 100)))).toBeLessThan(1e-9)
    expect(Math.max(...profile.map((p) => Math.abs(p.gradePct)))).toBeLessThan(1e-9)
  })

  it('keeps a real 6 % climb at 6 % on average, through noise and a spike', () => {
    const rnd = mulberry32(42)
    const pts = lineTrack({ lengthM: 5000, spacingM: 7.3, ele: (s, i) => climbEle(s) + (rnd() - 0.5) + (i === 300 ? 30 : 0) })
    const profile = buildProfile(pts)
    const byElevation = ((sampleAt(profile, 4000).ele - sampleAt(profile, 1000).ele) / 3000) * 100
    expect(Math.abs(byElevation - 6)).toBeLessThan(0.3)
    const interior = profile.filter((p) => p.distM >= 1200 && p.distM <= 3800).map((p) => p.gradePct)
    expect(Math.abs(mean(interior) - 6)).toBeLessThan(0.3)
    expect(Math.max(...profile.map((p) => Math.abs(p.ele - climbEle(p.distM))))).toBeLessThan(1)
  })

  it('is zero-phase: a grade step becomes a ramp centred on the real kink', () => {
    const kink = 1500
    const profile = buildProfile(lineTrack({ lengthM: 3000, spacingM: 10, ele: (s) => (s < kink ? 100 : 100 + 0.12 * (s - kink)) }))
    const g = (d: number): number => sampleAt(profile, d).gradePct
    expect(g(kink)).toBeCloseTo(6, 6)
    for (let x = 10; x <= 300; x += 10) expect(g(kink + x) + g(kink - x)).toBeCloseTo(12, 6)
    expect(g(kink - 150)).toBeCloseTo(0, 6)
    expect(g(kink + 150)).toBeCloseTo(12, 6)
  })

  it('can be switched off through the options', () => {
    const pts = lineTrack({ lengthM: 500, spacingM: 10, ele: (_s, i) => (i === 20 ? 130 : 100) })
    const raw = buildProfile(pts, { spikeWindowM: 0, smoothWindowM: 0 })
    expect(raw.find((p) => p.distM === 200)!.ele).toBe(130)
  })
})

describe('grade', () => {
  it('clamps to +/-25 %', () => {
    const wall = buildProfile(lineTrack({ lengthM: 2000, spacingM: 10, ele: (s) => (s < 500 ? 100 : s < 1500 ? 100 + 0.4 * (s - 500) : 500) }))
    expect(Math.max(...wall.map((p) => p.gradePct))).toBeCloseTo(25, 9)
    const drop = buildProfile(lineTrack({ lengthM: 2000, spacingM: 10, ele: (s) => (s < 500 ? 500 : s < 1500 ? 500 - 0.4 * (s - 500) : 100) }))
    expect(Math.min(...drop.map((p) => p.gradePct))).toBeCloseTo(-25, 9)
    const custom = buildProfile(lineTrack({ lengthM: 2000, spacingM: 10, ele: (s) => 100 + 0.15 * s }), { maxGradePct: 10 })
    expect(Math.max(...custom.map((p) => p.gradePct))).toBeCloseTo(10, 9)
  })

  it('never changes by more than 1.5 % per 10 m', () => {
    const kink = buildProfile(lineTrack({ lengthM: 3000, spacingM: 10, ele: (s) => (s < 1500 ? 100 : 100 + 0.12 * (s - 1500)) }))
    const steps = gradeSteps(kink)
    expect(Math.max(...steps)).toBeLessThanOrEqual(1.5 + 1e-9)
    expect(steps.some((d) => Math.abs(d - 1.5) < 1e-9)).toBe(true) // the limit actually bites here
    const wall = buildProfile(lineTrack({ lengthM: 2000, spacingM: 10, ele: (s) => (s < 800 ? 100 : s < 1000 ? 100 + 0.4 * (s - 800) : 180) }))
    expect(Math.max(...gradeSteps(wall))).toBeLessThanOrEqual(1.5 + 1e-9)
  })

  it('scales the rate limit with the spacing', () => {
    const coarse = buildProfile(lineTrack({ lengthM: 3000, spacingM: 10, ele: (s) => (s < 1500 ? 100 : 100 + 0.2 * (s - 1500)) }), { spacingM: 20 })
    expect(Math.max(...gradeSteps(coarse))).toBeLessThanOrEqual(3 + 1e-9)
  })
})

describe('elevation gain', () => {
  it('stays under 5 m on 10 km of flat road with +/-1 m noise', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const rnd = mulberry32(seed)
      const pts = lineTrack({ lengthM: 10_000, spacingM: 10, ele: () => 100 + (rnd() * 2 - 1) })
      const summary = summarize(buildProfile(pts))
      expect(summary.elevationGainM).toBeLessThan(5)
      expect(summary.elevationLossM).toBeLessThan(5)
      // Summing every raw rise instead would report hundreds of metres.
      expect(elevationGainLoss(pts.map((p) => p.ele!), 0).gainM).toBeGreaterThan(250)
    }
  })

  it('counts a real climb in full', () => {
    const summary = summarize(buildProfile(lineTrack({ lengthM: 5000, spacingM: 10, ele: climbEle })))
    expect(summary.elevationGainM).toBeCloseTo(180, 0)
    expect(summary.elevationLossM).toBeLessThan(0.5)
  })

  it('uses hysteresis: small wiggles never count, turning points count peak to trough', () => {
    expect(elevationGainLoss([0, 0.5, 0, 0.5, 0], 1)).toEqual({ gainM: 0, lossM: 0 })
    expect(elevationGainLoss([0, 3, 2.5, 6], 1)).toEqual({ gainM: 6, lossM: 0 })
    expect(elevationGainLoss([0, 10, 5, 12, 0], 1)).toEqual({ gainM: 17, lossM: 17 })
    expect(elevationGainLoss([5, 4.2, 9], 1)).toEqual({ gainM: 4.8, lossM: 0 })
    expect(elevationGainLoss([0, 1, 0.5, 2], 0)).toEqual({ gainM: 2.5, lossM: 0.5 })
    expect(elevationGainLoss([7], 1)).toEqual({ gainM: 0, lossM: 0 })
  })
})

describe('recorded speed', () => {
  const grid = gridDistances(1000, 10)
  const timed = (speedMps: (s: number) => number): RoutePoint[] => lineTrack({ lengthM: 1000, spacingM: 10, ele: flat(), speedMps })

  it('follows the recorded speed and is absent without timestamps', () => {
    const speed = recordedSpeed(timed(() => 10), grid)!
    expect(Array.from(speed).every((v) => Math.abs(v - 10) < 1e-9)).toBe(true)
    expect(recordedSpeed(lineTrack({ lengthM: 1000, spacingM: 10, ele: flat() }), grid)).toBeNull()
    expect(buildProfile(timed(() => 10)).every((p) => p.recordedMps !== undefined)).toBe(true)
    expect(buildProfile(lineTrack({ lengthM: 100, spacingM: 10, ele: flat() }))[0]).not.toHaveProperty('recordedMps')
  })

  it('is the harmonic mean over a 100 m window of moving time', () => {
    const speed = recordedSpeed(timed((s) => (s < 500 ? 10 : 5)), grid)!
    expect(speed[20]).toBeCloseTo(10, 9) // 200 m
    expect(speed[80]).toBeCloseTo(5, 9) // 800 m
    expect(speed[50]).toBeCloseTo(100 / (50 / 10 + 50 / 5), 9) // 500 m: 6.67 m/s
  })

  it('does not stall at a stop: each interval counts at >= 1 m/s', () => {
    const stopped = timed(() => 10).map((p) => (p.distM > 500 ? { ...p, t: p.t! + 60_000 } : p))
    const speed = recordedSpeed(stopped, grid)!
    expect(Math.min(...speed)).toBeGreaterThanOrEqual(1)
    expect(speed[50]).toBeCloseTo(100 / 19, 6) // window 450..550: 90 m at 10 m/s + 10 m at 1 m/s
  })

  it('does not teleport: a zero-duration interval counts at the 30 m/s cap', () => {
    const pts = timed(() => 10)
    pts[31] = { ...pts[31]!, t: pts[30]!.t! }
    const speed = recordedSpeed(pts, grid)!
    expect(Math.max(...speed)).toBeLessThan(11)
    expect(Math.max(...speed)).toBeLessThanOrEqual(30)
  })

  it('fills sparse timestamps, but needs at least half the points timed', () => {
    const pts = timed(() => 10)
    const everyOther = pts.map((p, i) => (i % 2 === 0 ? p : { lat: p.lat, lon: p.lon, ele: p.ele, distM: p.distM }))
    expect(Array.from(recordedSpeed(everyOther, grid)!).every((v) => Math.abs(v - 10) < 1e-6)).toBe(true)
    const middleOnly = pts.map((p, i) => (i >= 20 && i <= 80 ? p : { lat: p.lat, lon: p.lon, ele: p.ele, distM: p.distM }))
    expect(Array.from(recordedSpeed(middleOnly, grid)!).every((v) => Math.abs(v - 10) < 1e-6)).toBe(true)
    const twoOnly = pts.map((p, i) => (i === 0 || i === 100 ? p : { lat: p.lat, lon: p.lon, ele: p.ele, distM: p.distM }))
    expect(recordedSpeed(twoOnly, grid)).toBeNull()
  })
})

describe('summarize', () => {
  it('reports distance, gain, loss, grade and elevation range', () => {
    const s = summarize(buildProfile(lineTrack({ lengthM: 5000, spacingM: 10, ele: climbEle })))
    expect(s.distanceM).toBe(5000)
    expect(s.maxGradePct).toBeGreaterThan(5.9)
    expect(s.maxGradePct).toBeLessThan(6.5)
    expect(s.minGradePct).toBeGreaterThan(-0.5)
    expect(s.minEle).toBeCloseTo(100, 0)
    expect(s.maxEle).toBeCloseTo(280, 0)
    expect(summarize([])).toMatchObject({ distanceM: 0, elevationGainM: 0 })
  })
})

describe('validation', () => {
  it('rejects unusable input and options', () => {
    const pts = lineTrack({ lengthM: 100, spacingM: 10, ele: flat() })
    expect(() => buildProfile([])).toThrow(RangeError)
    expect(() => buildProfile(pts.slice(0, 1))).toThrow(RangeError)
    expect(() => buildProfile([pts[0]!, { ...pts[0]! }])).toThrow(/non-zero length/)
    expect(() => buildProfile([pts[1]!, pts[0]!])).toThrow(/non-decreasing/)
    expect(() => buildProfile(pts, { spacingM: 0 })).toThrow(/spacingM/)
    expect(() => buildProfile(pts, { minRecordedMps: 5, maxRecordedMps: 5 })).toThrow(/maxRecordedMps/)
    expect(() => buildProfile(pts, { smoothWindowM: -1 })).toThrow(RangeError)
  })
})
