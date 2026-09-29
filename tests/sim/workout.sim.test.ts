import { describe, expect, it } from 'vitest'
import { RideSession, type JournalSink, type SessionEvent } from '@core/ride/session'
import { WorkoutPlan } from '@core/ride/workout-plan'
import { BUILTIN_WORKOUTS } from '@core/workout/builtins'
import { targetAt } from '@core/workout/compile'
import { FTP_TEST_20MIN, rampTest } from '@core/workout/ftp-tests'
import type { Workout } from '@core/workout/model'
import { workoutStats } from '@core/workout/stats'
import { simRig } from './rig'

const journal: JournalSink = { begin: async () => undefined, append: async (_id, seq) => seq, close: async () => undefined }
const FTP = 250

async function rideWorkout(workout: Workout, opts: { extraS?: number; behavior?: Parameters<ReturnType<typeof simRig>['world']['setBehavior']>[0] } = {}) {
  const rig = simRig({ ftpW: FTP })
  await rig.connect('trainer')
  await rig.connect('hr')
  if (opts.behavior) rig.world.setBehavior(opts.behavior)
  const plan = new WorkoutPlan(workout, { ftpW: FTP })
  const session = new RideSession(
    { clock: rig.clock, hub: rig.hub, controller: rig.controller, journal, setPaused: (p) => rig.engine.setPaused(p) },
    { rideId: 'sim-ride', name: workout.name, kind: plan.kind, simulated: true, athlete: { ftpW: FTP, weightKg: 75 }, autoPause: true, plan },
  )
  const events: SessionEvent[] = []
  session.on((e) => events.push(e))
  rig.engine.onTick((now) => session.tick(now))
  session.start()
  const durationS = plan.timeline.durationS
  await rig.advance((durationS + (opts.extraS ?? 30)) * 1000, 250)
  const { records } = await rig.until(session.finish())
  rig.engine.stop()
  rig.devices.disconnectAll()
  rig.world.stop()
  return { plan, records, events, durationS }
}

const np = (xs: (number | null)[]) => {
  const v = xs.map((x) => x ?? 0)
  const rolling: number[] = []
  let sum = 0
  for (let i = 0; i < v.length; i++) {
    sum += v[i]!
    if (i >= 30) sum -= v[i - 30]!
    if (i >= 29) rolling.push(sum / 30)
  }
  return (rolling.reduce((a, r) => a + r ** 4, 0) / rolling.length) ** 0.25
}

describe('workouts on the simulated KICKR', () => {
  it('rides a 60-minute over-under session in ERG: a lap per step, targets recorded, NP on plan', async () => {
    const workout = BUILTIN_WORKOUTS.find((w) => w.id === 'builtin:over-unders-3x9')!
    const { plan, records, events, durationS } = await rideWorkout(workout)
    const steps = plan.timeline.steps

    expect(records.length).toBeGreaterThanOrEqual(durationS + 25)
    // One lap per step, plus the easy spin after the workout.
    expect(new Set(records.map((r) => r.lap)).size).toBe(steps.length + 1)
    expect(events.filter((e) => e.type === 'segment')).toHaveLength(steps.length + 1)
    expect(events.filter((e) => e.type === 'plan-finished')).toHaveLength(1)

    const inWorkout = records.filter((r) => r.t < durationS)
    const onTarget = inWorkout.filter((r) => Math.abs((r.targetW ?? -99) - targetAt(plan.timeline, r.t + 0.5, FTP)!.watts!) <= 3)
    expect(onTarget.length / inWorkout.length).toBeGreaterThan(0.97)

    const planned = workoutStats(plan.timeline, FTP).np!
    expect(Math.abs(np(inWorkout.map((r) => r.power)) - planned)).toBeLessThan(1)
  }, 30_000)

  it('20-minute FTP test: the rider holds 250 W with ERG off and FTP comes out at 95 %', async () => {
    const { plan, records } = await rideWorkout(FTP_TEST_20MIN, { behavior: { kind: 'hold', watts: 250 } })
    const effort = plan.timeline.steps.find((s) => s.label === '20-min test effort')!
    const during = records.filter((r) => r.t >= effort.startS + 5 && r.t < effort.endS)
    expect(during.every((r) => r.targetW === 263)).toBe(true) // pacing target: 250 / 0.95
    const result = plan.ftpResult(records)!
    expect(result.valid).toBe(true)
    expect(Math.abs(result.ftpW - 237.5)).toBeLessThan(1)
  }, 30_000)

  it('ramp test to failure: the test ends itself and FTP is 75 % of the best minute', async () => {
    const { plan, records } = await rideWorkout(rampTest(), { behavior: { kind: 'auto', exhausted: 'give-up' }, extraS: 0 })
    expect(plan.rampEndedAtS).not.toBeNull()
    const result = plan.ftpResult(records)!
    // Independent check: best 60 s of the recorded power before the test ended.
    const ended = records.findIndex((r) => r.t >= 1 && plan.positionAt(r.t + 0.5) >= plan.timeline.steps.at(-1)!.startS)
    let best = 0
    for (let i = 0; i + 60 <= ended; i++) best = Math.max(best, records.slice(i, i + 60).reduce((a, r) => a + (r.power ?? 0), 0) / 60)
    expect(result.ftpW).toBeGreaterThan(0.75 * best - 3)
    expect(result.ftpW).toBeLessThan(0.75 * best + 3)
    // A CP-250 / W'-20 kJ rider fails in the 340–380 W steps.
    expect(result.basisW).toBeGreaterThan(320)
    expect(result.basisW).toBeLessThan(380)
  }, 30_000)
})
