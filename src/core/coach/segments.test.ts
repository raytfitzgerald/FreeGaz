import { describe, expect, it } from 'vitest'
import { IDLE_TICK, type PlanTick } from '../ride/plan'
import { WorkoutPlan } from '../ride/workout-plan'
import { BUILTIN_WORKOUTS } from '../workout/builtins'
import { FTP_TEST_20MIN, rampTest } from '../workout/ftp-tests'
import type { PowerTarget, Workout } from '../workout/model'
import { classifyStep, isAnnounced, isMicro, segmentFromNext, segmentFromTick, workoutSegments, type CoachSegment } from './segments'

const FTP = 250
const ftp = (value: number): PowerTarget => ({ unit: 'ftp', value })
const builtin = (id: string): Workout => BUILTIN_WORKOUTS.find((w) => w.id === `builtin:${id}`)!

function allSegments(plan: WorkoutPlan): CoachSegment[] {
  const resolve = workoutSegments(plan)
  const out: CoachSegment[] = []
  for (let i = 0; ; i++) {
    const s = resolve(i)
    if (!s) return out
    out.push(s)
  }
}

describe('classifyStep', () => {
  it('goes by intensity, not by the step type in the file', () => {
    // the "over" of an over-under is an interval off step, but at 105 % it is hard
    expect(classifyStep({ kind: 'off', from: ftp(1.05), to: ftp(1.05) }, FTP)).toMatchObject({ kind: 'on', hard: true })
    // the long block between endurance surges is an interval on step at 68 %
    expect(classifyStep({ kind: 'on', from: ftp(0.68), to: ftp(0.68) }, FTP)).toMatchObject({ kind: 'steady', hard: false })
    expect(classifyStep({ kind: 'steady', from: ftp(0.95), to: ftp(0.95) }, FTP)).toMatchObject({ kind: 'on', hard: true })
    expect(classifyStep({ kind: 'steady', from: ftp(0.55), to: ftp(0.55) }, FTP)).toMatchObject({ kind: 'off', hard: false })
    expect(classifyStep({ kind: 'off', from: ftp(0.7), to: ftp(0.7) }, FTP)).toMatchObject({ kind: 'off', hard: false })
    expect(classifyStep({ kind: 'steady', from: ftp(0.8), to: ftp(0.8) }, FTP)).toMatchObject({ kind: 'steady', hard: false })
  })

  it('draws the hard line at 88 % FTP, the interval rescue threshold', () => {
    expect(classifyStep({ kind: 'on', from: ftp(0.88), to: ftp(0.88) }, FTP).hard).toBe(true)
    expect(classifyStep({ kind: 'on', from: ftp(0.87), to: ftp(0.87) }, FTP).hard).toBe(false)
  })

  it('reads ramps by role and max efforts as hard, free rides as easy', () => {
    expect(classifyStep({ kind: 'ramp', role: 'warmup', from: ftp(0.45), to: ftp(0.75) }, FTP)).toMatchObject({ kind: 'warmup', hard: false })
    expect(classifyStep({ kind: 'ramp', role: 'cooldown', from: ftp(0.6), to: ftp(0.4) }, FTP)).toMatchObject({ kind: 'cooldown', hard: false })
    expect(classifyStep({ kind: 'ramp', role: 'ramp', from: ftp(0.8), to: ftp(1.2) }, FTP)).toMatchObject({ kind: 'ramp', hard: true })
    expect(classifyStep({ kind: 'ramp', role: 'ramp', from: ftp(0.5), to: ftp(0.7) }, FTP)).toMatchObject({ kind: 'steady', hard: false })
    expect(classifyStep({ kind: 'maxeffort', from: null, to: null }, FTP)).toMatchObject({ kind: 'maxeffort', hard: true, fraction: null })
    expect(classifyStep({ kind: 'freeride', from: null, to: null }, FTP)).toMatchObject({ kind: 'freeride', hard: false })
  })

  it('treats FTP-test efforts as hard: a steady effort, or the ramp', () => {
    expect(classifyStep({ kind: 'freeride', from: null, to: null }, FTP, '20min')).toMatchObject({ kind: 'steady', hard: true })
    expect(classifyStep({ kind: 'steady', from: ftp(0.5), to: ftp(0.5) }, FTP, 'ramp')).toMatchObject({ kind: 'ramp', hard: true })
  })
})

describe('workoutSegments', () => {
  it('numbers reps like the player: both halves of an over-under share the rep', () => {
    const segs = allSegments(new WorkoutPlan(builtin('over-unders-3x9'), { ftpW: FTP }))
    const set = segs.filter((s) => s.label === 'Under' || s.label === 'Over').slice(0, 6)
    expect(set.map((s) => [s.label, s.kind, s.hard, s.rep, s.reps])).toEqual([
      ['Under', 'on', true, 1, 3],
      ['Over', 'on', true, 1, 3],
      ['Under', 'on', true, 2, 3],
      ['Over', 'on', true, 2, 3],
      ['Under', 'on', true, 3, 3],
      ['Over', 'on', true, 3, 3],
    ])
  })

  it('sees VO2 reps as hard and their recoveries as recoveries', () => {
    const segs = allSegments(new WorkoutPlan(builtin('vo2max-5x4'), { ftpW: FTP }))
    const reps = segs.filter((s) => s.label === 'VO2 max')
    expect(reps.filter((s) => s.hard).map((s) => [s.rep, s.durationS])).toEqual([1, 2, 3, 4, 5].map((r) => [r, 240]))
    expect(reps.filter((s) => !s.hard).every((s) => s.kind === 'off')).toBe(true)
    expect(segs[0]).toMatchObject({ kind: 'warmup', hard: false })
    expect(segs.at(-1)).toMatchObject({ kind: 'cooldown', hard: false })
  })

  it('makes the surge the hard part of endurance-with-surges', () => {
    const segs = allSegments(new WorkoutPlan(builtin('endurance-surges-60'), { ftpW: FTP }))
    expect(segs.find((s) => s.label === 'Surge')).toMatchObject({ kind: 'on', hard: true, durationS: 30, rep: 1, reps: 5 })
    expect(segs.find((s) => s.label === 'Surges')).toMatchObject({ kind: 'steady', hard: false })
  })

  it('marks FTP-test efforts, and every ramp-test step as one effort', () => {
    const twenty = allSegments(new WorkoutPlan(FTP_TEST_20MIN, { ftpW: FTP }))
    expect(twenty.filter((s) => s.ftpEffort).map((s) => [s.label, s.kind, s.hard, s.durationS])).toEqual([['20-min test effort', 'steady', true, 1200]])
    expect(twenty.find((s) => s.label === 'Blowout')).toMatchObject({ kind: 'maxeffort', hard: true, ftpEffort: false })
    const ramp = allSegments(new WorkoutPlan(rampTest(), { ftpW: FTP }))
    expect(ramp.filter((s) => s.ftpEffort)).toHaveLength(30)
    expect(ramp.filter((s) => s.ftpEffort).every((s) => s.kind === 'ramp' && s.hard)).toBe(true)
  })

  it('follows timeline edits', () => {
    const plan = new WorkoutPlan(builtin('vo2max-5x4'), { ftpW: FTP })
    const resolve = workoutSegments(plan)
    const first = plan.timeline.steps.find((s) => s.kind === 'on')!
    expect(resolve(first.index)?.durationS).toBe(240)
    plan.command({ type: 'extend', seconds: 60 }, first.startS + 10)
    expect(resolve(first.index)?.durationS).toBe(300)
  })
})

describe('micro-intervals', () => {
  it('announces only the first and last of a set of short reps', () => {
    const segs = allSegments(new WorkoutPlan(builtin('thirty-thirties'), { ftpW: FTP }))
    const reps = segs.filter((s) => s.hard && s.reps === 10)
    expect(reps).toHaveLength(20)
    expect(reps.every(isMicro)).toBe(true)
    expect(reps.filter(isAnnounced).map((s) => s.rep)).toEqual([1, 10, 1, 10])
  })

  it('leaves minute-long reps and lone sprints alone', () => {
    const anaerobic = allSegments(new WorkoutPlan(builtin('anaerobic-8x1'), { ftpW: FTP })).filter((s) => s.hard)
    expect(anaerobic.some(isMicro)).toBe(false)
    const sprints = allSegments(new WorkoutPlan(builtin('sprints-6x15'), { ftpW: FTP })).filter((s) => s.hard)
    expect(sprints).toHaveLength(6)
    expect(sprints.every(isAnnounced)).toBe(true)
  })
})

describe('without a timeline', () => {
  const tick = (over: Partial<PlanTick>): PlanTick => ({ ...IDLE_TICK, segmentIndex: 0, segmentElapsedS: 30, segmentRemainingS: 90, ...over })

  it('judges the current step from the tick', () => {
    expect(segmentFromTick(tick({ segmentKind: 'steady', targetW: 240 }), FTP)).toMatchObject({ kind: 'on', hard: true, durationS: 120 })
    expect(segmentFromTick(tick({ segmentKind: 'steady', targetW: 150 }), FTP)).toMatchObject({ kind: 'steady', hard: false })
    expect(segmentFromTick(tick({ segmentKind: 'maxeffort', targetW: null }), FTP)).toMatchObject({ kind: 'maxeffort', hard: true })
    expect(segmentFromTick(tick({ segmentIndex: null }), FTP)).toBeNull()
    expect(segmentFromTick(tick({ finished: true }), FTP)).toBeNull()
  })

  it('judges the next step from the preview', () => {
    expect(segmentFromNext({ label: 'VO2', durationS: 180, watts: 290, endWatts: null, ergOff: false }, 3, FTP)).toMatchObject({ index: 3, hard: true, durationS: 180 })
    expect(segmentFromNext({ label: 'Easy', durationS: 180, watts: 120, endWatts: null, ergOff: false }, 3, FTP).hard).toBe(false)
  })
})
