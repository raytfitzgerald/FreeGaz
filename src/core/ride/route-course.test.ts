import { describe, expect, it } from 'vitest'
import { DEFAULT_BIKE, steadySpeedForPower } from '../physics/bike'
import { mulberry32 } from '../routes/fixtures/tracks'
import { RoutePlayer } from '../routes/player'
import { buildRoute } from '../routes/route'
import { elevationGainLoss } from '../routes/smooth'
import { demoRoutes, syntheticPoints, syntheticRoute } from '../routes/synthetic'
import {
  LOOP_CLOSE_M,
  chunkSpeeds,
  cumulativeGain,
  gradeChunks,
  isLoopRoute,
  markerSpacingM,
  recordedPaceTimes,
  recordedTimeBetween,
  timeAtSpeeds,
  valueAtDistance,
} from './route-course'

const demos = demoRoutes()
const demo = (id: string) => demos.find((r) => r.id === id)!

describe('isLoopRoute', () => {
  it('is true only when the finish is back at the start', () => {
    expect(isLoopRoute(demo('demo-test-loop'))).toBe(true)
    expect(isLoopRoute(demo('demo-flat-five'))).toBe(false)
    expect(isLoopRoute(demo('demo-six-percent'))).toBe(false)
  })

  it('accepts a small gap at the line but not a short stub', () => {
    const loop = syntheticPoints({ shape: 'loop', segments: [{ kind: 'flat', lengthM: 3000 }] })
    const open = loop.slice(0, -2) // ends 20 m before the start
    expect(isLoopRoute(buildRoute(open, { name: 'Almost', source: 'synthetic' }))).toBe(true)
    const gapped = loop.slice(0, -Math.ceil(LOOP_CLOSE_M / 10) - 2)
    expect(isLoopRoute(buildRoute(gapped, { name: 'Open', source: 'synthetic' }))).toBe(false)
    const tiny = syntheticRoute({ shape: 'loop', segments: [{ kind: 'flat', lengthM: 300 }] })
    expect(isLoopRoute(tiny)).toBe(false)
  })
})

describe('cumulativeGain', () => {
  it('ends at the route summary’s elevation gain, so gained + to go always matches the card', () => {
    for (const r of demos) {
      const gain = cumulativeGain(r.profile.map((p) => p.ele))
      expect(gain.at(-1)).toBeCloseTo(r.elevationGainM, 9)
    }
  })

  it('matches the hysteresis total on noisy profiles and never goes down', () => {
    const rng = mulberry32(11)
    for (let trial = 0; trial < 20; trial++) {
      let e = 100
      const ele = Array.from({ length: 400 }, () => (e += (rng() - 0.45) * 3))
      const gain = cumulativeGain(ele)
      expect(gain.at(-1)).toBeCloseTo(elevationGainLoss(ele, 2).gainM, 9)
      for (let i = 1; i < gain.length; i++) expect(gain[i]!).toBeGreaterThanOrEqual(gain[i - 1]!)
    }
  })

  it('climbs with the road: 3 km at 6 % is 180 m gained at the top', () => {
    const r = demo('demo-six-percent')
    const gain = cumulativeGain(r.profile.map((p) => p.ele))
    expect(valueAtDistance(r.profile, gain, 500)).toBeLessThan(2.5)
    expect(valueAtDistance(r.profile, gain, 2000)).toBeCloseTo(90, 0)
    expect(valueAtDistance(r.profile, gain, 3600)).toBeCloseTo(180, 0)
  })

  it('sums every rise when the threshold is 0', () => {
    expect(Array.from(cumulativeGain([0, 1, 0.5, 2], 0))).toEqual([0, 1, 1, 2.5])
  })
})

describe('travel time', () => {
  const bike = { ...DEFAULT_BIKE, riderKg: 75 }

  it('splits the profile into chunks carrying their mean grade', () => {
    const r = demo('demo-six-percent')
    const chunks = gradeChunks(r.profile, 100)
    expect(chunks.gradePct).toHaveLength(40)
    expect(chunks.gradePct[1]).toBeCloseTo(0, 1)
    expect(chunks.gradePct[20]).toBeCloseTo(6, 1)
  })

  it('times a flat route at a steady power exactly: length / steady speed', () => {
    const r = demo('demo-flat-five')
    const chunks = gradeChunks(r.profile)
    const v = steadySpeedForPower(200, 0, bike)
    expect(timeAtSpeeds(chunks, chunkSpeeds(chunks, 200, bike), 0, 5000)).toBeCloseTo(5000 / v, 6)
    expect(timeAtSpeeds(chunks, chunkSpeeds(chunks, 200, bike), 1234, 1734)).toBeCloseTo(500 / v, 6)
    expect(timeAtSpeeds(chunks, chunkSpeeds(chunks, 200, bike), 3000, 3000)).toBe(0)
  })

  it('is infinite when the rider cannot move on a climb', () => {
    const r = demo('demo-six-percent')
    const chunks = gradeChunks(r.profile)
    expect(timeAtSpeeds(chunks, chunkSpeeds(chunks, 0, bike), 0, 4000)).toBe(Number.POSITIVE_INFINITY)
  })

  it('times the recorded pace the way Steady mode rides it', () => {
    const r = demo('demo-test-loop')
    const times = recordedPaceTimes(r.profile)!
    expect(times).not.toBeNull()
    const player = new RoutePlayer(r, { mode: 'steady', speedModel: () => 0 })
    let s = player.state
    while (!s.finished) s = player.step({ dtS: 1, powerW: null })
    expect(recordedTimeBetween(r.profile, times, 0, r.distanceM)).toBeCloseTo(s.elapsedS, 6)
    // Part-way: the player's own clock at 2.5 km.
    const p2 = new RoutePlayer(r, { mode: 'steady', speedModel: () => 0 })
    let t = 0
    while (p2.state.distM < 2500) t = p2.step({ dtS: 0.05, powerW: null }).elapsedS
    expect(recordedTimeBetween(r.profile, times, 0, p2.state.distM)).toBeCloseTo(t, 3)
  })

  it('has no recorded pace on untimed routes', () => {
    expect(recordedPaceTimes(demo('demo-flat-five').profile)).toBeNull()
  })
})

describe('markerSpacingM', () => {
  it('keeps a ride to a sensible number of km markers', () => {
    expect(markerSpacingM(5000)).toBe(1000)
    expect(markerSpacingM(30_000)).toBe(1000)
    expect(markerSpacingM(80_000)).toBe(5000)
    expect(markerSpacingM(200_000)).toBe(10_000)
  })
})
