import { describe, expect, it } from 'vitest'
import { scaleGrade } from '../control/trainer-controller'
import { lineTrack, mulberry32 } from './fixtures/tracks'
import { lookaheadGrade, sampleAt } from './lookup'
import type { ProfilePoint, Route } from './model'
import { RoutePlayer, advanceAtRecordedSpeed, type GhostSample, type RouteState, type SpeedModel } from './player'
import { buildRoute } from './route'
import { syntheticRoute } from './synthetic'

const flatRoute = (lengthM: number): Route => syntheticRoute({ name: 'Flat', segments: [{ kind: 'flat', lengthM }] })
const sixPercent = syntheticRoute({
  name: 'Six',
  segments: [
    { kind: 'flat', lengthM: 500 },
    { kind: 'climb', lengthM: 3000, gradePct: 6 },
    { kind: 'flat', lengthM: 500 },
  ],
})

/** v(t + dt) = v + a dt: speed grows linearly, so distance must be a t^2 / 2. */
const accelerate =
  (a: number): SpeedModel =>
  (_powerW, _gradePct, v, dt) =>
    v + a * dt
const constant =
  (mps: number): SpeedModel =>
  () =>
    mps

/**
 * A steady-state speed table standing in for the physics module (which the
 * player must not import): flat-road speed for a power, and a slower column
 * for grades above 3 %. Linear between rows.
 */
const SPEED_TABLE: [powerW: number, flatMps: number, climbMps: number][] = [
  [0, 0, 0],
  [100, 7.0, 2.4],
  [200, 9.2, 4.3],
  [300, 10.7, 5.9],
  [400, 11.9, 7.3],
]
const tableSpeed = (powerW: number, gradePct: number): number => {
  const col = gradePct > 3 ? 2 : 1
  for (let i = 1; i < SPEED_TABLE.length; i++) {
    const lo = SPEED_TABLE[i - 1]!
    const hi = SPEED_TABLE[i]!
    if (powerW <= hi[0]) return lo[col]! + ((hi[col]! - lo[col]!) * (powerW - lo[0])) / (hi[0] - lo[0])
  }
  return SPEED_TABLE.at(-1)![col]!
}
const speedTable: SpeedModel = (powerW, gradePct) => tableSpeed(powerW, gradePct)

function ride(player: RoutePlayer, seconds: number, dtS = 1, powerW: number | null = 200): RouteState {
  let s = player.state
  for (let t = 0; t < seconds - 1e-9; t += dtS) s = player.step({ dtS, powerW })
  return s
}

function rideToFinish(player: RoutePlayer, dtS = 1, powerW = 200): RouteState {
  let s = player.state
  for (let i = 0; i < 1e6 && !s.finished; i++) s = player.step({ dtS, powerW })
  return s
}

const steadyGhost = (mps: number, untilS = 10_000): GhostSample[] => [
  { tS: 0, distM: 0 },
  { tS: untilS, distM: mps * untilS },
]

describe('Reactive mode', () => {
  it('advances by the integral of the model speed (constant acceleration: d = a t^2 / 2)', () => {
    const player = new RoutePlayer(flatRoute(5000), { mode: 'reactive', speedModel: accelerate(0.5) })
    const s = ride(player, 20, 0.25)
    expect(s.elapsedS).toBeCloseTo(20, 9)
    expect(s.speedMps).toBeCloseTo(10, 9)
    expect(s.distM).toBeCloseTo(100, 9)
    expect(s.totalDistM).toBeCloseTo(100, 9)
    expect(s.progress).toBeCloseTo(100 / 5000, 12)
  })

  it('integrates one long tick in sub-steps to the same answer', () => {
    const player = new RoutePlayer(flatRoute(5000), { mode: 'reactive', speedModel: accelerate(0.5) })
    expect(player.step({ dtS: 20, powerW: 200 }).distM).toBeCloseTo(100, 9)
  })

  it.each(SPEED_TABLE.slice(1))('rides the speed table on the flat: %i W -> %f m/s', (powerW, flatMps) => {
    const player = new RoutePlayer(flatRoute(5000), { mode: 'reactive', speedModel: speedTable, initialSpeedMps: flatMps })
    const s = ride(player, 60, 1, powerW)
    expect(s.speedMps).toBeCloseTo(flatMps, 12)
    expect(s.distM).toBeCloseTo(flatMps * 60, 9)
  })

  it('slows on the climb, because the model gets the true grade at the rider’s position', () => {
    const seen: number[] = []
    const expected: number[] = []
    const player = new RoutePlayer(sixPercent, {
      mode: 'reactive',
      initialSpeedMps: 9.2,
      speedModel: (powerW, gradePct) => {
        seen.push(gradePct)
        return tableSpeed(powerW, gradePct)
      },
    })
    let s = player.state
    for (let t = 0; t < 400; t++) {
      expected.push(sampleAt(sixPercent.profile, s.distM).gradePct)
      s = player.step({ dtS: 1, powerW: 200 })
    }
    expect(seen).toEqual(expected)
    expect(Math.max(...seen)).toBeGreaterThan(5.9) // a quadratic SG overshoots a sharp kink slightly
    expect(Math.max(...seen)).toBeLessThan(6.3)
    expect(s.gradePct).toBeCloseTo(6, 1)
    expect(s.speedMps).toBeCloseTo(4.3, 12)
  })

  it('coasts when power is missing: the model gets 0 W', () => {
    const powers: number[] = []
    const player = new RoutePlayer(flatRoute(1000), {
      mode: 'reactive',
      speedModel: (powerW) => {
        powers.push(powerW)
        return 5
      },
    })
    player.step({ dtS: 1, powerW: null })
    player.step({ dtS: 1, powerW: Number.NaN })
    player.step({ dtS: 1, powerW: 180 })
    expect(powers).toEqual([0, 0, 180])
  })

  it('never rolls backwards, whatever the model returns', () => {
    const backwards = new RoutePlayer(flatRoute(1000), { mode: 'reactive', speedModel: constant(-3), startDistM: 100 })
    expect(ride(backwards, 5)).toMatchObject({ distM: 100, speedMps: 0 })
    const broken = new RoutePlayer(flatRoute(1000), { mode: 'reactive', speedModel: constant(Number.NaN), initialSpeedMps: 4 })
    expect(broken.step({ dtS: 1, powerW: 200 })).toMatchObject({ distM: 2, speedMps: 0 })
  })
})

describe('trainer grade', () => {
  it('is the mean grade over the next speed x 1.5 s', () => {
    const player = new RoutePlayer(sixPercent, { mode: 'reactive', speedModel: constant(10), initialSpeedMps: 10, startDistM: 480 })
    const s = player.state
    expect(s.lookaheadGradePct).toBeCloseTo(lookaheadGrade(sixPercent.profile, 480, 15), 12)
    expect(s.lookaheadGradePct).toBeGreaterThan(s.gradePct + 0.5) // the climb is coming
  })

  it('is the true grade when the rider is stopped or lookahead is off', () => {
    const stopped = new RoutePlayer(sixPercent, { mode: 'reactive', speedModel: constant(0), startDistM: 480 })
    expect(stopped.state.lookaheadGradePct).toBeCloseTo(stopped.state.gradePct, 12)
    const off = new RoutePlayer(sixPercent, { mode: 'reactive', speedModel: constant(10), initialSpeedMps: 10, startDistM: 480, lookaheadS: 0 })
    expect(off.state.lookaheadGradePct).toBeCloseTo(off.state.gradePct, 12)
  })

  it('is reported before slope scaling, which the trainer controller applies; speed keeps the true grade', () => {
    const descent = syntheticRoute({
      segments: [
        { kind: 'flat', lengthM: 500 },
        { kind: 'climb', lengthM: 2000, gradePct: -8 },
        { kind: 'flat', lengthM: 500 },
      ],
    })
    const seen: number[] = []
    const player = new RoutePlayer(descent, {
      mode: 'reactive',
      initialSpeedMps: 12,
      startDistM: 1500,
      speedModel: (_p, gradePct) => {
        seen.push(gradePct)
        return 12
      },
    })
    const s = player.step({ dtS: 1, powerW: 150 })
    expect(s.lookaheadGradePct).toBeCloseTo(-8, 6)
    expect(seen[0]).toBeCloseTo(-8, 6)
    const slope = { uphillPct: 100, downhillPct: 50, limitPct: 20 }
    expect(scaleGrade(s.lookaheadGradePct, slope)).toBeCloseTo(-4, 6)
    const climb = new RoutePlayer(sixPercent, { mode: 'steady', speedModel: constant(0), startDistM: 2000 }).state
    expect(scaleGrade(climb.lookaheadGradePct, { uphillPct: 50, downhillPct: 50, limitPct: 20 })).toBeCloseTo(3, 6)
  })
})

describe('Steady mode', () => {
  it('advances at the fixed pace whatever the power: distance = pace x time', () => {
    const player = new RoutePlayer(sixPercent, {
      mode: 'steady',
      steadyKmh: 36,
      speedModel: () => {
        throw new Error('Steady mode must not use the speed model')
      },
    })
    const rnd = mulberry32(5)
    let s = player.state
    for (let t = 0; t < 100; t++) s = player.step({ dtS: 1, powerW: rnd() * 400 })
    expect(s.distM).toBeCloseTo(1000, 9)
    expect(s.speedMps).toBe(10)
    expect(s.elapsedS).toBe(100)
  })

  it('still follows the gradient', () => {
    const s = ride(new RoutePlayer(sixPercent, { mode: 'steady', steadyKmh: 36, speedModel: constant(0) }), 200)
    expect(s.distM).toBeCloseTo(2000, 9)
    expect(s.gradePct).toBeCloseTo(6, 6)
    expect(s.lookaheadGradePct).toBeCloseTo(6, 6)
  })

  it('defaults to 25 km/h on a route without timestamps', () => {
    const player = new RoutePlayer(flatRoute(5000), { mode: 'steady', speedModel: constant(0) })
    expect(player.state.speedMps).toBeCloseTo(25 / 3.6, 12)
    expect(ride(player, 36).distM).toBeCloseTo(250, 9)
  })

  it('replays the recorded speed when the route has timestamps', () => {
    const points = lineTrack({ lengthM: 2000, spacingM: 10, ele: () => 100, speedMps: (s) => (s < 1000 ? 10 : 5) })
    const route = buildRoute(points, { name: 'Timed', source: 'gpx' })
    expect(route.hasTimes).toBe(true)
    const player = new RoutePlayer(route, { mode: 'steady', speedModel: constant(0) })
    expect(player.state.speedMps).toBeCloseTo(10, 9)
    expect(ride(player, 50).distM).toBeCloseTo(500, 6)
    const s = rideToFinish(player)
    expect(s.elapsedS).toBeCloseTo(300, 1) // 100 s at 10 m/s + 200 s at 5 m/s
    expect(s.speedMps).toBeCloseTo(5, 9)
  })

  it('lets an explicit pace override the recorded speed', () => {
    const route = buildRoute(lineTrack({ lengthM: 1000, spacingM: 10, ele: () => 100, speedMps: () => 10 }), { name: 'Timed', source: 'gpx' })
    const player = new RoutePlayer(route, { mode: 'steady', steadyKmh: 18, speedModel: constant(0) })
    expect(ride(player, 10).distM).toBeCloseTo(50, 9)
  })
})

describe('advanceAtRecordedSpeed', () => {
  const ramp: ProfilePoint[] = [
    { distM: 0, ele: 0, gradePct: 0, lat: 45, lon: 7, recordedMps: 5 },
    { distM: 100, ele: 0, gradePct: 0, lat: 45, lon: 7.001, recordedMps: 10 },
    { distM: 200, ele: 0, gradePct: 0, lat: 45, lon: 7.002, recordedMps: 10 },
  ]
  const k = 5 / 100 // dv/dx on the first segment, 1/s

  it('integrates a speed that changes linearly with distance exactly', () => {
    expect(advanceAtRecordedSpeed(ramp, 0, 5)).toEqual({ distM: expect.closeTo((5 * Math.expm1(k * 5)) / k, 9), usedS: 5 })
    const across = advanceAtRecordedSpeed(ramp, 0, Math.log(2) / k + 3)
    expect(across.distM).toBeCloseTo(130, 9) // the first segment, then 3 s at 10 m/s
  })

  it('stops at the end and reports the time it used', () => {
    const r = advanceAtRecordedSpeed(ramp, 150, 60)
    expect(r.distM).toBe(200)
    expect(r.usedS).toBeCloseTo(5, 12)
    expect(advanceAtRecordedSpeed(ramp, 200, 10)).toEqual({ distM: 200, usedS: 0 })
    expect(() => advanceAtRecordedSpeed(flatRoute(100).profile, 0, 1)).toThrow(RangeError)
  })
})

describe('Challenge mode', () => {
  it('reports how far and how long the rider is ahead of the ghost', () => {
    const player = new RoutePlayer(flatRoute(20_000), { mode: 'challenge', speedModel: constant(9), initialSpeedMps: 9, ghost: steadyGhost(8) })
    expect(player.state.ghost).toEqual({ distM: 0, gapS: 0, gapM: 0 })
    const s = ride(player, 100)
    expect(s.ghost!.distM).toBeCloseTo(800, 9)
    expect(s.ghost!.gapM).toBeCloseTo(100, 9)
    expect(s.ghost!.gapS).toBeCloseTo(900 / 8 - 100, 9) // +12.5 s: the ghost reaches 900 m at 112.5 s
    expect(player.ghostDistM(50)).toBeCloseTo(400, 9)
  })

  it('flips the gap sign when the ghost comes past in a scripted race', () => {
    let target = 10
    const player = new RoutePlayer(flatRoute(20_000), { mode: 'challenge', speedModel: () => target, initialSpeedMps: 10, ghost: steadyGhost(8) })
    let s = ride(player, 60)
    expect(s.ghost!.gapM).toBeCloseTo(120, 9)
    expect(s.ghost!.gapS).toBeCloseTo(15, 9)
    target = 6 // 8 m while slowing through the next second, then 6 m/s
    s = ride(player, 61)
    expect(s.ghost!.gapM).toBeCloseTo(0, 9)
    expect(s.ghost!.gapS).toBeCloseTo(0, 9)
    s = ride(player, 29)
    expect(s.elapsedS).toBeCloseTo(150, 9)
    expect(s.ghost!.gapM).toBeCloseTo(-58, 9)
    expect(s.ghost!.gapS).toBeCloseTo(1142 / 8 - 150, 9) // -7.25 s
  })

  it('reports the final gap at the finish and then freezes', () => {
    const player = new RoutePlayer(flatRoute(2000), { mode: 'challenge', speedModel: constant(10), initialSpeedMps: 10, ghost: steadyGhost(8, 300) })
    const s = rideToFinish(player, 0.7)
    expect(s.elapsedS).toBeCloseTo(200, 9)
    expect(s.ghost!.gapS).toBeCloseTo(250 - 200, 9) // the ghost finishes at 250 s
    expect(s.ghost!.gapM).toBeCloseTo(2000 - 1600, 9)
    expect(player.step({ dtS: 5, powerW: 300 })).toBe(s)
  })

  it('wraps the ghost’s position on a loop but measures the gaps unwrapped', () => {
    const player = new RoutePlayer(flatRoute(1000), { mode: 'challenge', loop: true, speedModel: constant(10), initialSpeedMps: 10, ghost: steadyGhost(8) })
    const s = ride(player, 150)
    expect(s.lap).toBe(1)
    expect(s.distM).toBeCloseTo(500, 9)
    expect(s.ghost!.distM).toBeCloseTo(200, 9) // 1200 m unwrapped
    expect(s.ghost!.gapM).toBeCloseTo(300, 9)
    expect(s.ghost!.gapS).toBeCloseTo(1500 / 8 - 150, 9)
  })

  it('cleans up ghost data, and ignores ghosts outside challenge mode', () => {
    const messy: GhostSample[] = [
      { tS: 20, distM: 150 },
      { tS: 0, distM: 0 },
      { tS: 10, distM: 80 },
      { tS: 10, distM: 90 },
      { tS: 15, distM: 85 },
      { tS: Number.NaN, distM: 5 },
    ]
    const player = new RoutePlayer(flatRoute(1000), { mode: 'challenge', speedModel: constant(5), ghost: messy })
    expect(player.ghostDistM(10)).toBe(90) // a repeated time keeps the furthest distance
    expect(player.ghostDistM(15)).toBe(90) // a ghost never goes backwards
    expect(player.ghostDistM(17.5)).toBeCloseTo(120, 9)
    expect(player.ghostDistM(99)).toBe(150)
    expect(player.ghostDistM(-5)).toBe(0)
    const reactive = new RoutePlayer(flatRoute(1000), { mode: 'reactive', speedModel: constant(5), ghost: messy })
    expect(reactive.state).not.toHaveProperty('ghost')
    expect(reactive.ghostDistM(10)).toBeNull()
    const single = new RoutePlayer(flatRoute(1000), { mode: 'challenge', speedModel: constant(5), ghost: [{ tS: 0, distM: 0 }] })
    expect(single.state).not.toHaveProperty('ghost')
    const noGhost = new RoutePlayer(flatRoute(1000), { mode: 'challenge', speedModel: constant(5) })
    expect(noGhost.step({ dtS: 1, powerW: 100 })).not.toHaveProperty('ghost')
  })

  it('races a recorded effort: the same ride again is dead level all the way', () => {
    const speedModel: SpeedModel = (powerW, gradePct) => tableSpeed(powerW, gradePct)
    const first = new RoutePlayer(sixPercent, { mode: 'reactive', speedModel, initialSpeedMps: 9.2 })
    const samples: GhostSample[] = [first.ghostSample()]
    while (!first.state.finished) {
      first.step({ dtS: 1, powerW: 200 })
      samples.push(first.ghostSample())
    }
    const rematch = new RoutePlayer(sixPercent, { mode: 'challenge', speedModel, initialSpeedMps: 9.2, ghost: samples })
    let worst = 0
    let s = rematch.state
    while (!s.finished) {
      s = rematch.step({ dtS: 1, powerW: 200 })
      worst = Math.max(worst, Math.abs(s.ghost!.gapS), Math.abs(s.ghost!.gapM))
    }
    expect(worst).toBeLessThan(1e-6)
  })
})

describe('finish and loop', () => {
  it('clamps at the finish with an interpolated finish time, then stays put', () => {
    const player = new RoutePlayer(flatRoute(1000), { mode: 'reactive', speedModel: constant(10), initialSpeedMps: 10 })
    const s = rideToFinish(player, 3)
    expect(s).toMatchObject({ distM: 1000, progress: 1, finished: true })
    expect(s.elapsedS).toBeCloseTo(100, 9)
    expect(s.totalDistM).toBeCloseTo(1000, 9)
    expect(player.step({ dtS: 3, powerW: 200 })).toBe(s)
    expect(player.state).toBe(s)
  })

  it('interpolates the finish inside an accelerating step', () => {
    const s = rideToFinish(new RoutePlayer(flatRoute(50), { mode: 'reactive', speedModel: accelerate(1) }), 3)
    expect(s.elapsedS).toBeCloseTo(10, 9) // 50 m = t^2 / 2
    expect(s.speedMps).toBeCloseTo(10, 9)
  })

  it('finishes Steady mode exactly too', () => {
    const s = rideToFinish(new RoutePlayer(flatRoute(1000), { mode: 'steady', steadyKmh: 36, speedModel: constant(0) }), 3)
    expect(s).toMatchObject({ distM: 1000, finished: true })
    expect(s.elapsedS).toBeCloseTo(100, 9)
  })

  it('loops: laps count up, the position wraps and the ride never finishes', () => {
    const player = new RoutePlayer(flatRoute(1000), { mode: 'reactive', loop: true, speedModel: constant(10), initialSpeedMps: 10 })
    const s = ride(player, 250)
    expect(s).toMatchObject({ lap: 2, finished: false })
    expect(s.distM).toBeCloseTo(500, 6)
    expect(s.progress).toBeCloseTo(0.5, 6)
    expect(s.totalDistM).toBeCloseTo(2500, 6)
    expect(player.step({ dtS: 10, powerW: 200 }).lap).toBe(2)
  })

  it('loops in Steady mode, at the recorded speed of a timed loop', () => {
    const route = syntheticRoute({
      shape: 'loop',
      segments: [
        { kind: 'flat', lengthM: 500, speedKmh: 36 },
        { kind: 'flat', lengthM: 500, speedKmh: 18 },
      ],
    })
    const player = new RoutePlayer(route, { mode: 'steady', loop: true, speedModel: constant(0) })
    const s = ride(player, 400)
    expect(s.lap).toBe(2)
    expect(s.finished).toBe(false)
    expect(s.totalDistM).toBeCloseTo(2000 + s.distM, 6)
  })

  it('looks ahead across the start line of a loop', () => {
    const route = syntheticRoute({
      segments: [
        { kind: 'climb', lengthM: 1000, gradePct: 5 },
        { kind: 'flat', lengthM: 1000 },
      ],
    })
    const opts = { mode: 'steady', steadyKmh: 36, speedModel: constant(0), startDistM: 1995 } as const
    expect(new RoutePlayer(route, opts).state.lookaheadGradePct).toBeCloseTo(0, 6)
    const loop = new RoutePlayer(route, { ...opts, loop: true }).state
    expect(loop.lookaheadGradePct).toBeCloseTo(lookaheadGrade(route.profile, 1995, 15, { loop: true }), 12)
    expect(loop.lookaheadGradePct).toBeGreaterThan(3)
  })
})

describe('options', () => {
  it('can start part-way along the route', () => {
    const s = new RoutePlayer(sixPercent, { mode: 'reactive', speedModel: constant(0), startDistM: 1234 }).state
    expect(s).toMatchObject({ distM: 1234, elapsedS: 0, totalDistM: 0, lap: 0, speedMps: 0 })
    expect(s.progress).toBeCloseTo(1234 / 4000, 12)
    expect(s.ele).toBeCloseTo(sampleAt(sixPercent.profile, 1234).ele, 12)
  })

  it('wraps a start past the end on a loop, and is already finished otherwise', () => {
    expect(new RoutePlayer(flatRoute(1000), { mode: 'reactive', loop: true, speedModel: constant(5), startDistM: 2300 }).state.distM).toBeCloseTo(300, 9)
    const done = new RoutePlayer(flatRoute(1000), { mode: 'reactive', speedModel: constant(5), startDistM: 2300 })
    expect(done.state).toMatchObject({ distM: 1000, finished: true })
  })

  it('ignores empty or invalid ticks', () => {
    const player = new RoutePlayer(flatRoute(1000), { mode: 'reactive', speedModel: constant(5) })
    const s = player.state
    expect(player.step({ dtS: 0, powerW: 200 })).toBe(s)
    expect(player.step({ dtS: -1, powerW: 200 })).toBe(s)
    expect(player.step({ dtS: Number.NaN, powerW: 200 })).toBe(s)
    expect(player.step({ dtS: Number.POSITIVE_INFINITY, powerW: 200 })).toBe(s)
  })

  it('rejects invalid options and unusable routes', () => {
    const route = flatRoute(1000)
    const base = { mode: 'reactive', speedModel: constant(5) } as const
    expect(() => new RoutePlayer(route, { ...base, mode: 'steady', steadyKmh: 0 })).toThrow(/steadyKmh/)
    expect(() => new RoutePlayer(route, { ...base, lookaheadS: -1 })).toThrow(/lookaheadS/)
    expect(() => new RoutePlayer(route, { ...base, startDistM: -5 })).toThrow(/startDistM/)
    expect(() => new RoutePlayer(route, { ...base, initialSpeedMps: Number.NaN })).toThrow(/initialSpeedMps/)
    expect(() => new RoutePlayer({ ...route, profile: route.profile.slice(0, 1) }, base)).toThrow(RangeError)
    const shifted = route.profile.map((p) => ({ ...p, distM: p.distM + 10 }))
    expect(() => new RoutePlayer({ ...route, profile: shifted }, base)).toThrow(/starts at 0 m/)
  })
})
