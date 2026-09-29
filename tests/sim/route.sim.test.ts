import { describe, expect, it } from 'vitest'
import { DEFAULT_BIKE, steadySpeedForPower } from '@core/physics/bike'
import { RideSession, type JournalSink, type SessionEvent } from '@core/ride/session'
import { ghostFromDistances, ghostTimeAt } from '@core/ride/route-ghost'
import { RoutePlan, isRouteTick, type RoutePlanOptions, type RouteTick } from '@core/ride/route-plan'
import type { RideRecord } from '@core/ride/recorder'
import { sampleAt } from '@core/routes/lookup'
import type { Route } from '@core/routes/model'
import type { GhostSample } from '@core/routes/player'
import { syntheticRoute } from '@core/routes/synthetic'
import { simRig } from './rig'

// M6 exit criteria, headless: a synthetic route ridden in Reactive mode on the
// simulated KICKR, through the real FTMS driver, controller and session.
const journal: JournalSink = { begin: async () => undefined, append: async (_id, seq) => seq, close: async () => undefined }
const RIDER = { riderKg: 75, bikeKg: 8.5, cda: 0.35, crr: 0.0033, ftpW: 250 }
const BIKE = { ...DEFAULT_BIKE, riderKg: 75, bikeKg: 8.5, cda: 0.35, crr: 0.0033 }

/** Flat to settle, a 6 % climb, a wall past the 20 % limit, a descent that gets halved, flat to the line. */
const COURSE = syntheticRoute({
  id: 'sim-course',
  name: 'Sim Course',
  segments: [
    { kind: 'flat', lengthM: 2500 },
    { kind: 'climb', lengthM: 1500, gradePct: 6 },
    { kind: 'climb', lengthM: 300, gradePct: 24 },
    { kind: 'climb', lengthM: 2000, gradePct: -5 },
    { kind: 'flat', lengthM: 500 },
  ],
})

interface Ride {
  plan: RoutePlan
  records: RideRecord[]
  ticks: { t: number; tick: RouteTick }[]
  events: SessionEvent[]
  simulation: { t: number; gradePct: number }[]
}

async function rideRoute(route: Route, opts: Omit<RoutePlanOptions, 'rider'>, watts: (movingS: number) => number, seconds: number): Promise<Ride> {
  const rig = simRig({ ftpW: 250 })
  await rig.connect('trainer')
  await rig.connect('hr')
  rig.world.trainer.commandLog.length = 0
  rig.world.setBehavior({ kind: 'hold', watts: watts(0) })
  const plan = new RoutePlan(route, { ...opts, rider: RIDER })
  const session = new RideSession(
    { clock: rig.clock, hub: rig.hub, controller: rig.controller, journal, setPaused: (p) => rig.engine.setPaused(p) },
    { rideId: 'sim-route', name: route.name, kind: plan.kind, simulated: true, athlete: { ftpW: 250, weightKg: 75 }, autoPause: true, plan },
  )
  const events: SessionEvent[] = []
  session.on((e) => events.push(e))
  const ticks: Ride['ticks'] = []
  rig.engine.onTick((now) => {
    session.tick(now)
    const tick = session.planTick
    if (isRouteTick(tick)) ticks.push({ t: now, tick })
  })
  session.start()
  for (let s = 0; s < seconds; s += 5) {
    rig.world.setBehavior({ kind: 'hold', watts: watts(s) })
    await rig.advance(5000, 250)
  }
  const { records } = await rig.until(session.finish())
  const simulation = rig.world.trainer.commandLog.flatMap((c) =>
    c.op === 'simulation' ? [{ t: c.t, gradePct: (c.detail as { gradePct: number }).gradePct }] : [],
  )
  rig.engine.stop()
  rig.devices.disconnectAll()
  rig.world.stop()
  return { plan, records, ticks, events, simulation }
}

/** The default feel: uphill 100 %, downhill 50 %, both capped at 20 %. */
const feel = (g: number) => (g >= 0 ? Math.min(g, 20) : Math.max(g * 0.5, -20))

describe('a route on the simulated KICKR', () => {
  it('Reactive: the trainer gets the look-ahead grade × the slope scaling, and speed is the physics speed', async () => {
    const ride = await rideRoute(COURSE, { mode: 'reactive' }, () => 200, 1500)
    const { ticks, simulation } = ride
    expect(ticks.at(-1)!.tick.finished).toBe(true)

    // Every SIM command the KICKR received carries the grade the plan asked
    // for. Each engine tick runs the controller before the session, so the
    // command decided on tick D (and written a few ms later) is the grade
    // the plan set on the tick before D.
    expect(simulation.length).toBeGreaterThan(100)
    let checked = 0
    for (const cmd of simulation) {
      const decided = ticks.findLastIndex((x) => x.t <= cmd.t)
      const asked = ticks[decided - 1]
      if (!asked) continue
      const g = asked.tick.finished ? 0 : asked.tick.route.lookaheadGradePct
      expect(Math.abs(cmd.gradePct - feel(g))).toBeLessThanOrEqual(0.2)
      checked++
    }
    expect(checked).toBeGreaterThan(100)
    // The course exercised all three rules: uphill as is, the 20 % cap, downhill halved.
    const sent = simulation.map((c) => c.gradePct)
    expect(sent.some((g) => Math.abs(g - 6) < 0.3)).toBe(true)
    expect(Math.max(...sent)).toBe(20)
    expect(sent.some((g) => Math.abs(g + 2.5) < 0.3)).toBe(true)
    expect(Math.min(...sent)).toBeGreaterThanOrEqual(-2.6)

    // Steady state on the flat and on the 6 % climb: the rider's virtual
    // speed sits within 0.5 km/h of the analytic speed for the power ridden.
    const settled = (fromM: number, toM: number) => ticks.filter((x) => !x.tick.finished && x.tick.route.distM >= fromM && x.tick.route.distM <= toM)
    const meanPower = (from: number, to: number) => {
      const p = ride.records.filter((r) => r.t >= from && r.t < to && r.power !== null).map((r) => r.power!)
      return p.reduce((a, b) => a + b, 0) / p.length
    }
    for (const [fromM, toM] of [
      [1200, 2400],
      [3000, 3900],
    ] as const) {
      const window = settled(fromM, toM)
      expect(window.length).toBeGreaterThan(200)
      const t0 = Math.floor(window[0]!.tick.route.elapsedS)
      const t1 = Math.floor(window.at(-1)!.tick.route.elapsedS)
      const power = meanPower(t0, t1)
      for (const { tick } of window.filter((_, i) => i % 8 === 0)) {
        const expected = steadySpeedForPower(power, sampleAt(COURSE.profile, tick.route.distM).gradePct, BIKE)
        expect(Math.abs(tick.route.speedMps - expected) * 3.6).toBeLessThan(0.5)
      }
    }

    // The ride was recorded with the route's grade, elevation and virtual
    // speed, one lap per km marker, and the recorded distance is the route's.
    const r = ride.records
    const onClimb = r.find((x) => x.distance > 3200)!
    expect(onClimb.grade).toBeCloseTo(6, 0)
    expect(onClimb.altitude).toBeGreaterThan(100 + 0.06 * 600)
    const finish = r.findIndex((x) => x.distance >= COURSE.distanceM - 1e-6)
    expect(finish).toBeGreaterThan(0)
    expect(Math.abs(finish + 1 - ride.plan.finishedAtS!)).toBeLessThan(2)
    expect(new Set(r.filter((x) => x.t < ride.plan.finishedAtS!).map((x) => x.lap)).size).toBe(Math.ceil(COURSE.distanceM / 1000))
    expect(ride.events.filter((e) => e.type === 'plan-finished')).toHaveLength(1)
  }, 60_000)

  it('Challenge: a scripted race against a recorded ghost reports the right gap', async () => {
    const route = syntheticRoute({
      id: 'sim-race',
      name: 'Sim Race',
      segments: [
        { kind: 'flat', lengthM: 1500 },
        { kind: 'climb', lengthM: 1500, gradePct: 4 },
        { kind: 'flat', lengthM: 1000 },
      ],
    })
    // Ride 1, the ghost: a steady 200 W.
    const first = await rideRoute(route, { mode: 'reactive' }, () => 200, 900)
    // Its records put it where its plan did, so a ghost from records is honest.
    for (const { tick } of first.ticks.filter((x, i) => i % 40 === 0 && !x.tick.finished)) {
      const second = Math.floor(tick.route.elapsedS)
      const rec = first.records[second - 1]
      if (!rec || second < 2) continue
      const at = first.ticks.findLast((x) => x.tick.route.elapsedS <= second)!.tick.route.riddenM
      expect(Math.abs(rec.distance - at)).toBeLessThan(2)
    }
    const ghost: GhostSample[] = ghostFromDistances(
      first.records.map((r) => r.distance),
      route.distanceM,
    )
    const ghostFinish = ghostTimeAt(ghost, route.distanceM)!
    expect(ghostFinish).toBeCloseTo(first.plan.finishedAtS!, -0.5)

    // Ride 2: start slower than the ghost, then attack from 4 minutes.
    const second = await rideRoute(route, { mode: 'challenge', ghost, ghostLabel: 'Ride 1' }, (s) => (s < 240 ? 170 : 300), 900)
    const racing = second.ticks.filter((x) => !x.tick.finished && x.tick.route.ghost)
    expect(racing.length).toBeGreaterThan(1000)
    const ghostAt = (tS: number) => {
      const i = ghost.findIndex((g) => g.tS >= tS)
      if (i <= 0) return i === 0 ? ghost[0]!.distM : ghost.at(-1)!.distM
      const a = ghost[i - 1]!
      const b = ghost[i]!
      return a.distM + ((b.distM - a.distM) * (tS - a.tS)) / (b.tS - a.tS)
    }
    for (const { tick } of racing.filter((_, i) => i % 20 === 0)) {
      const s = tick.route
      expect(s.ghost!.gapM).toBeCloseTo(s.riddenM - ghostAt(s.elapsedS), 3)
      const reached = ghostTimeAt(ghost, s.riddenM)
      if (reached !== null) expect(s.ghost!.gapS).toBeCloseTo(reached - s.elapsedS, 3)
    }
    // Behind while holding back, ahead after the attack, and told so.
    const at = (t: number) => racing.find((x) => x.tick.route.elapsedS >= t)!.tick.route.ghost!
    expect(at(200).gapM).toBeLessThan(-10)
    expect(at(200).gapS).toBeLessThan(0)
    const end = racing.at(-1)!.tick.route.ghost!
    expect(end.gapM).toBeGreaterThan(10)
    expect(end.gapS).toBeGreaterThan(0)
    const cues = second.events.flatMap((e) => (e.type === 'cue' ? [e.text] : []))
    expect(cues).toContain('You passed your ghost.')
    // The result: the rider's finish against the ghost's.
    expect(second.plan.finishedAtS).not.toBeNull()
    const verdict = cues.find((c) => c.startsWith('Route complete!'))!
    expect(verdict).toMatch(/ahead of your ghost\.$/)
    expect(ghostFinish - second.plan.finishedAtS!).toBeGreaterThan(0)
  }, 60_000)
})
