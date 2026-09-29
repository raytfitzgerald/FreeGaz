import { describe, expect, it } from 'vitest'
import { DEFAULT_BIKE, steadySpeedForPower, stepSpeed } from '../physics/bike'
import { lookaheadGrade, sampleAt } from '../routes/lookup'
import type { Route } from '../routes/model'
import type { GhostSample } from '../routes/player'
import { demoRoutes, syntheticRoute } from '../routes/synthetic'
import { IDLE_TICK, type PlanInput } from './plan'
import { RoutePlan, isRouteTick, type RoutePlanOptions, type RouteTick } from './route-plan'
import { recordedPaceTimes, recordedTimeBetween } from './route-course'

const RIDER = { riderKg: 75, bikeKg: 8.5, cda: 0.35, crr: 0.0033, ftpW: 250 }
const BIKE = { ...DEFAULT_BIKE, ...RIDER }
const demos = demoRoutes()
const demo = (id: string): Route => demos.find((r) => r.id === id)!
const flat = (lengthM: number) => syntheticRoute({ name: 'Flat', segments: [{ kind: 'flat', lengthM }] })

type Feed = Partial<Omit<PlanInput, 'movingS'>>
const input = (m: number, f: Feed = {}): PlanInput => ({ now: m * 1000, movingS: m, dtS: 0.25, power: 200, cadence: 90, hr: 140, ...f })

/** Ticks at 4 Hz over moving time (from, to]. */
function run(plan: RoutePlan, from: number, to: number, feed: Feed | ((m: number) => Feed) = {}): RouteTick[] {
  const out: RouteTick[] = []
  for (let k = Math.round(from * 4) + 1; k <= Math.round(to * 4); k++) {
    const m = k / 4
    out.push(plan.tick(input(m, typeof feed === 'function' ? feed(m) : feed)))
  }
  return out
}
const plan = (route: Route, opts: Partial<RoutePlanOptions> = {}) => new RoutePlan(route, { mode: 'reactive', rider: RIDER, ...opts })
const cues = (ticks: RouteTick[]) => ticks.flatMap((t) => (t.cue ? [t.cue] : []))

describe('RoutePlan: Reactive', () => {
  it('moves at the physics speed for the rider’s power, weight and bike', () => {
    const p = plan(flat(5000))
    expect(p.kind).toBe('route')
    expect(p.name).toBe('Flat')
    p.tick(input(0))
    let v = 0
    let d = 0
    for (let k = 1; k <= 480; k++) {
      const v1 = stepSpeed(v, 200, 0, 0.25, BIKE)
      d += ((v + v1) / 2) * 0.25
      v = v1
    }
    const t = run(p, 0, 120).at(-1)!
    expect(t.route.speedMps).toBeCloseTo(v, 9)
    expect(t.route.riddenM).toBeCloseTo(d, 6)
    expect(t.distanceM).toBeCloseTo(d, 6)
    // Two minutes in, the speed has settled on the analytic steady state.
    expect(t.route.speedMps).toBeCloseTo(steadySpeedForPower(200, 0, BIKE), 2)
  })

  it('uses the athlete’s weight: a heavier rider is slower up the same climb', () => {
    const climb = syntheticRoute({ name: 'Climb', segments: [{ kind: 'climb', lengthM: 3000, gradePct: 7 }] })
    const light = plan(climb, { rider: { ...RIDER, riderKg: 60 } })
    const heavy = plan(climb, { rider: { ...RIDER, riderKg: 90 } })
    const a = run(light, 0, 300).at(-1)!
    const b = run(heavy, 0, 300).at(-1)!
    expect(a.route.speedMps).toBeCloseTo(steadySpeedForPower(200, sampleAt(climb.profile, a.route.distM).gradePct, { ...BIKE, riderKg: 60 }), 1)
    expect(b.route.riddenM).toBeLessThan(a.route.riddenM * 0.85)
  })

  it('asks the trainer for the look-ahead grade, unscaled, and records the true grade', () => {
    const r = demo('demo-six-percent')
    const p = plan(r)
    const ticks = run(p, 0, 240, { power: 250 })
    for (const t of ticks.slice(8)) {
      const s = t.route
      expect(t.desired).toEqual({ mode: 'sim', gradePct: expect.closeTo(lookaheadGrade(r.profile, s.distM, s.speedMps * 1.5), 2) })
      expect(t.grade).toBeCloseTo(sampleAt(r.profile, s.distM).gradePct, 2)
      expect(t.altitude).toBeCloseTo(sampleAt(r.profile, s.distM).ele, 1)
      expect(t.targetW).toBeNull()
    }
    // On the climb the trainer is asked for ~6 %.
    const onClimb = ticks.find((t) => t.route.distM > 1000)!
    expect((onClimb.desired as { gradePct: number }).gradePct).toBeCloseTo(6, 0)
  })

  it('coasts when there is no power: missing is not zero watts of progress', () => {
    const p = plan(flat(2000))
    run(p, 0, 60)
    const before = p.tick(input(60.25)).route
    const after = run(p, 60.25, 70, { power: null }).at(-1)!.route
    expect(after.speedMps).toBeLessThan(before.speedMps)
    expect(after.riddenM).toBeGreaterThan(before.riddenM)
  })
})

describe('RoutePlan: moving time', () => {
  it('advances by moving time, whatever the tick spacing', () => {
    const a = plan(flat(5000))
    const b = plan(flat(5000))
    run(a, 0, 60)
    b.tick(input(0))
    // Irregular ticks, including a late one covering 2.5 s.
    for (const m of [0.1, 0.6, 3.1, 3.2, 10, 10.05, 25.5, 60]) b.tick(input(m))
    expect(b.tick(input(60)).route.riddenM).toBeCloseTo(a.tick(input(60)).route.riddenM, 0)
  })

  it('does not move while moving time stands still (a pause)', () => {
    const p = plan(flat(5000))
    const t = run(p, 0, 30).at(-1)!
    const again = p.tick(input(30, { power: 400 }))
    expect(again.route.riddenM).toBe(t.route.riddenM)
    expect(again.route.elapsedS).toBe(30)
  })

  it('records a 1-second mean speed, so the recorded distance stays on the route position', () => {
    // What RideRecorder does: add the tick's speed once per moving second.
    const p = plan(demo('demo-rollers'))
    p.tick(input(0))
    let recorded = 0
    let worst = 0
    for (let k = 1; k <= 4 * 900; k++) {
      const m = k / 4
      const t = p.tick(input(m, { power: m < 300 ? 150 : m < 600 ? 320 : 90 }))
      if (k % 4 === 0) {
        recorded += t.speed
        worst = Math.max(worst, Math.abs(recorded - t.distanceM))
      }
    }
    expect(worst).toBeLessThan(0.5)
  })
})

describe('RoutePlan: Steady', () => {
  it('rides the route’s recorded pace, whatever the power', () => {
    const r = demo('demo-test-loop')
    const p = plan(r, { mode: 'steady' })
    const times = recordedPaceTimes(r.profile)!
    const t = run(p, 0, 300, { power: 0 }).at(-1)!
    expect(t.route.mode).toBe('steady')
    expect(recordedTimeBetween(r.profile, times, 0, t.route.distM)).toBeCloseTo(300, 3)
    expect(t.route.etaS).toBeCloseTo(recordedTimeBetween(r.profile, times, t.route.distM, r.distanceM), 3)
  })

  it('rides at 25 km/h on a route without timestamps, or at a pace you choose', () => {
    const t = run(plan(flat(5000), { mode: 'steady' }), 0, 100, { power: null }).at(-1)!
    expect(t.route.riddenM).toBeCloseTo((25 / 3.6) * 100, 6)
    expect(t.route.etaS).toBeCloseTo((5000 - (25 / 3.6) * 100) / (25 / 3.6), 6)
    const fixed = run(plan(flat(5000), { mode: 'steady', steadyKmh: 36 }), 0, 100).at(-1)!
    expect(fixed.route.riddenM).toBeCloseTo(1000, 6)
  })
})

describe('RoutePlan: switching Reactive and Steady mid-ride', () => {
  it('keeps position, speed and time continuous, and announces the change', () => {
    const p = plan(flat(8000))
    run(p, 0, 120)
    const before = p.tick(input(120)).route
    expect(p.setMode('steady')).toBe(true)
    expect(p.setMode('steady')).toBe(false)
    const right = p.tick(input(120))
    expect(right.route.riddenM).toBeCloseTo(before.riddenM, 9)
    expect(right.route.mode).toBe('steady')
    expect(right.cue).toBe('Steady: the route sets the pace now.')
    const steady = run(p, 120, 180, { power: 0 }).at(-1)!.route
    expect(steady.riddenM - before.riddenM).toBeCloseTo((25 / 3.6) * 60, 6)
    expect(steady.elapsedS).toBeCloseTo(180, 9)
    p.setMode('reactive')
    const back = run(p, 180, 181).at(-1)!.route
    expect(back.mode).toBe('reactive')
    expect(back.speedMps).toBeGreaterThan(6.5) // carried the Steady speed over, not a standing start
  })
})

describe('RoutePlan: finishing', () => {
  it('finishes at the end of the route, then rides flat until you stop', () => {
    const p = plan(flat(1000))
    const ticks = run(p, 0, 200)
    const i = ticks.findIndex((t) => t.finished)
    expect(i).toBeGreaterThan(0)
    const done = ticks[i]!
    expect(done.segmentLabel).toBe('Route complete')
    expect(done.segmentKind).toBe('done')
    expect(done.desired).toEqual({ mode: 'sim', gradePct: 0 })
    expect(done.remainingS).toBe(0)
    expect(done.route.remainingM).toBe(0)
    expect(done.distanceM).toBe(1000)
    expect(cues(ticks)).toContain('Route complete!')
    // The finish time is interpolated inside the step.
    const prev = ticks[i - 1]!.route
    const finishedAt = p.finishedAtS!
    expect(finishedAt).toBeGreaterThan((i + 1) / 4 - 0.25)
    expect(finishedAt).toBeLessThanOrEqual((i + 1) / 4)
    expect(finishedAt).toBeCloseTo(prev.elapsedS + (1000 - prev.riddenM) / prev.speedMps, 1)
    // The cool-down keeps its speed from physics; the route position stays at the line.
    const last = ticks.at(-1)!
    expect(last.distanceM).toBe(1000)
    expect(last.speed).toBeCloseTo(steadySpeedForPower(200, 0, BIKE), 1)
    expect(last.route.elapsedS).toBeCloseTo(finishedAt, 9)
  })

  it('splits a point-to-point ride at km markers', () => {
    const ticks = run(plan(flat(2500)), 0, 400)
    const first = ticks[0]!
    expect(first).toMatchObject({ segmentIndex: 0, segmentLabel: '0–1 km', segmentKind: 'km', nextLabel: '1–2 km' })
    const third = ticks.find((t) => t.segmentIndex === 2)!
    expect(third).toMatchObject({ segmentLabel: '2–2.5 km', nextLabel: 'Finish' })
    expect(ticks.find((t) => t.finished)!.segmentIndex).toBe(3)
    // Time to the next marker, at the recent power.
    const mid = ticks.find((t) => t.route.riddenM > 1200)!
    expect(mid.segmentRemainingS).toBeCloseTo((2000 - mid.route.riddenM) / steadySpeedForPower(200, 0, BIKE), -0.5)
  })
})

describe('RoutePlan: laps', () => {
  const loop = demo('demo-test-loop')

  it('rides a loop for N laps, with a segment and a cue per lap', () => {
    const p = plan(loop, { laps: 2, mode: 'steady' })
    expect(p.laps).toBe(2)
    expect(p.totalM).toBeCloseTo(2 * loop.distanceM, 9)
    const ticks = run(p, 0, 2000, { power: 0 })
    expect(ticks[0]).toMatchObject({ segmentIndex: 0, segmentLabel: 'Lap 1 of 2', segmentKind: 'lap', nextLabel: 'Lap 2 of 2' })
    const second = ticks.find((t) => t.segmentIndex === 1)!
    expect(second).toMatchObject({ segmentLabel: 'Lap 2 of 2', nextLabel: 'Finish' })
    expect(second.route.lap).toBe(1)
    expect(second.route.distM).toBeLessThan(10)
    expect(cues(ticks)).toContain('Last lap: 2 of 2.')
    const done = ticks.find((t) => t.finished)!
    expect(done.route.lap).toBe(2)
    const lap = recordedTimeBetween(loop.profile, recordedPaceTimes(loop.profile)!, 0, loop.distanceM)
    expect(p.finishedAtS).toBeCloseTo(2 * lap, 1)
  })

  it('counts climbing per lap: gained + to go is the lap gain × laps', () => {
    const p = plan(loop, { laps: 3 })
    for (const t of run(p, 0, 900, { power: 280 })) {
      expect(t.route.gainedM + t.route.remainingGainM).toBeCloseTo(3 * loop.elevationGainM, 6)
    }
  })

  it('never looks past the last finish line', () => {
    const p = plan(loop, { laps: 2, mode: 'steady' })
    const ticks = run(p, 0, 2000, { power: 0 })
    const nearEnd = ticks.filter((t) => !t.finished && t.route.lap === 1 && t.route.distM > loop.distanceM - 15)
    expect(nearEnd.length).toBeGreaterThan(0)
    for (const t of nearEnd) expect(t.route.lookaheadGradePct).toBeCloseTo(lookaheadGrade(loop.profile, t.route.distM, t.route.speedMps * 1.5), 9)
  })

  it('rides a point-to-point route once, whatever you ask for', () => {
    expect(plan(demo('demo-flat-five'), { laps: 3 }).laps).toBe(1)
  })
})

describe('RoutePlan: Challenge', () => {
  const pacer = (mps: number, untilS = 5000): GhostSample[] => [
    { tS: 0, distM: 0 },
    { tS: untilS, distM: mps * untilS },
  ]

  it('reports the gap to the ghost in seconds and metres', () => {
    const p = plan(flat(8000), { mode: 'challenge', ghost: pacer(8), ghostLabel: 'Pacer' })
    expect(p.racing).toBe(true)
    for (const t of run(p, 0, 300).slice(4)) {
      const s = t.route
      expect(s.mode).toBe('challenge')
      expect(s.ghost!.gapM).toBeCloseTo(s.riddenM - 8 * s.elapsedS, 6)
      expect(s.ghost!.gapS).toBeCloseTo(s.riddenM / 8 - s.elapsedS, 6)
      expect(s.ghost!.distM).toBeCloseTo(8 * s.elapsedS, 6)
    }
  })

  it('hides the race while Steady and resumes it with the true gap', () => {
    const p = plan(flat(8000), { mode: 'challenge', ghost: pacer(8) })
    run(p, 0, 100)
    p.setMode('steady')
    const steady = run(p, 100, 160).at(-1)!.route
    expect(steady.ghost).toBeNull()
    expect(steady.challenge).toBe(true)
    p.setMode('reactive')
    const back = run(p, 160, 200).at(-1)!.route
    expect(back.mode).toBe('challenge')
    expect(back.ghost!.gapM).toBeCloseTo(back.riddenM - 8 * back.elapsedS, 6)
    expect(back.ghost!.gapS).toBeCloseTo(back.riddenM / 8 - back.elapsedS, 6)
  })

  it('keeps the gap right across laps, and says who won', () => {
    const loop = demo('demo-test-loop')
    const p = plan(loop, { mode: 'challenge', laps: 2, ghost: pacer(5, 20_000) })
    const ticks = run(p, 0, 2500, { power: 260 })
    for (const t of ticks.filter((x) => !x.finished).slice(4)) {
      const s = t.route
      expect(s.ghost!.gapM).toBeCloseTo(s.riddenM - 5 * s.elapsedS, 6)
    }
    expect(ticks.some((t) => t.finished)).toBe(true)
    expect(cues(ticks).find((c) => c.startsWith('Route complete'))).toMatch(/^Route complete! \d+:\d\d ahead of your ghost\.$/)
  })

  it('announces passing the ghost', () => {
    // The ghost starts fast and fades, so the rider passes it once.
    const ghost: GhostSample[] = [
      { tS: 0, distM: 0 },
      { tS: 60, distM: 700 },
      { tS: 600, distM: 2500 },
    ]
    const p = plan(flat(8000), { mode: 'challenge', ghost })
    expect(cues(run(p, 0, 400))).toContain('You passed your ghost.')
  })

  it('races nobody without a usable ghost', () => {
    const p = plan(flat(5000), { mode: 'challenge', ghost: [{ tS: 0, distM: 0 }] })
    expect(p.racing).toBe(false)
    expect(run(p, 0, 10).at(-1)!.route.ghost).toBeNull()
  })
})

describe('RoutePlan: trainer overrides', () => {
  it('holds a level or a wattage while the route keeps playing, and hands back to the route', () => {
    const p = plan(demo('demo-six-percent'))
    run(p, 0, 60, { power: 180 })
    expect(p.command({ type: 'mode', mode: 'resistance' })).toBe(true)
    expect(p.tick(input(60.25)).desired).toEqual({ mode: 'resistance', pct: 25 })
    expect(p.command({ type: 'nudge', delta: 5 })).toBe(true)
    expect(p.tick(input(60.5)).desired).toEqual({ mode: 'resistance', pct: 30 })

    expect(p.command({ type: 'mode', mode: 'erg' })).toBe(true)
    const erg = p.tick(input(60.75, { intensityPct: 90 }))
    expect(erg.desired).toEqual({ mode: 'erg', watts: 180 }) // the last 30 s, rounded to 5 W
    expect(erg.targetW).toBe(162)
    expect(erg.route.override).toEqual({ mode: 'erg', watts: 180 })
    p.command({ type: 'nudge', delta: -25 })
    const moving = run(p, 60.75, 90, { power: 155 }).at(-1)!
    expect(moving.desired).toEqual({ mode: 'erg', watts: 155 })
    expect(moving.route.riddenM).toBeGreaterThan(erg.route.riddenM + 100) // still Reactive

    expect(p.command({ type: 'mode', mode: 'sim' })).toBe(true)
    expect(p.tick(input(90.25)).desired).toMatchObject({ mode: 'sim' })
    // Coming back to a level remembers it.
    p.command({ type: 'mode', mode: 'resistance' })
    expect(p.tick(input(90.5)).desired).toEqual({ mode: 'resistance', pct: 30 })
  })

  it('starts ERG from FTP when there is no recent power, and ignores what makes no sense on a route', () => {
    const p = plan(flat(5000))
    p.tick(input(0, { power: null }))
    p.command({ type: 'mode', mode: 'erg' })
    expect(p.tick(input(0.25, { power: null })).desired).toEqual({ mode: 'erg', watts: 150 })
    expect(p.command({ type: 'mode', mode: 'hr' })).toBe(false)
    expect(p.command({ type: 'skip' })).toBe(false)
    expect(p.command({ type: 'extend', seconds: 30 })).toBe(false)
    p.command({ type: 'mode', mode: 'sim' })
    expect(p.command({ type: 'nudge', delta: 1 })).toBe(false)
  })
})

describe('RoutePlan: progress', () => {
  it('reports elevation gained and to go', () => {
    const r = demo('demo-six-percent')
    const ticks = run(plan(r), 0, 1500, { power: 300 })
    const top = ticks.find((t) => t.route.distM >= 3600)!
    expect(top.route.gainedM).toBeCloseTo(180, 0)
    for (const t of ticks) expect(t.route.gainedM + t.route.remainingGainM).toBeCloseTo(r.elevationGainM, 6)
  })

  it('estimates the time to the finish at the recent power', () => {
    const p = plan(flat(10_000))
    const t = run(p, 0, 120).at(-1)!
    expect(t.remainingS).toBeCloseTo(t.route.remainingM / steadySpeedForPower(200, 0, BIKE), 0)
    // Unknown until there is power to go on.
    const cold = plan(flat(10_000))
    expect(run(cold, 0, 2, { power: null }).at(-1)!.remainingS).toBeNull()
  })

  it('marks its ticks for the HUD', () => {
    const t = plan(flat(1000)).tick(input(0))
    expect(isRouteTick(t)).toBe(true)
    expect(isRouteTick(IDLE_TICK)).toBe(false)
    expect(isRouteTick(null)).toBe(false)
  })
})
