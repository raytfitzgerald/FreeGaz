import { describe, expect, it } from 'vitest'
import { FTP_TEST_20MIN, rampTest } from '../workout/ftp-tests'
import type { PowerTarget, Workout } from '../workout/model'
import type { PlanInput, PlanTick } from './plan'
import { FLAT_ROAD, RESCUE_REST_S, WorkoutPlan, extendStep, insertRest } from './workout-plan'
import { compileWorkout } from '../workout/compile'

const ftp = (value: number): PowerTarget => ({ unit: 'ftp', value })
const FTP = 250

// warm-up [0,60) · 3 × (on 60 @110 % / off 30 @50 %) [60,330) · free ride [330,360) · steady [360,420)
const W: Workout = {
  id: 'test:plan',
  name: 'Plan test',
  tags: [],
  sportType: 'bike',
  source: 'user',
  segments: [
    { kind: 'ramp', role: 'warmup', durationS: 60, from: ftp(0.5), to: ftp(0.7), text: [{ offsetS: 0, message: 'Go' }] },
    { kind: 'intervals', repeat: 3, on: { durationS: 60, power: ftp(1.1) }, off: { durationS: 30, power: ftp(0.5) }, text: [{ offsetS: 30, message: 'Halfway' }] },
    { kind: 'freeride', durationS: 30 },
    { kind: 'steady', durationS: 60, power: ftp(0.6) },
  ],
}

type Feed = Partial<Omit<PlanInput, 'movingS'>>

/** Ticks at 4 Hz over moving time (from, to]; returns the ticks. */
function run(plan: WorkoutPlan, from: number, to: number, feed: Feed | ((m: number) => Feed) = {}): PlanTick[] {
  const out: PlanTick[] = []
  for (let k = Math.round(from * 4) + 1; k <= Math.round(to * 4); k++) {
    const m = k / 4
    const f = typeof feed === 'function' ? feed(m) : feed
    out.push(plan.tick({ now: m * 1000, movingS: m, dtS: 0.25, power: 200, cadence: 90, hr: 140, ...f }))
  }
  return out
}
const at = (plan: WorkoutPlan, m: number, f: Feed = {}) => plan.tick({ now: m * 1000, movingS: m, dtS: 0.25, power: 200, cadence: 90, hr: 140, ...f })
const cues = (ticks: PlanTick[]) => ticks.flatMap((t) => (t.cue ? [t.cue] : []))

describe('WorkoutPlan', () => {
  it('plays the steps in order with look-ahead ERG, labels and next-step info', () => {
    const plan = new WorkoutPlan(W, { ftpW: FTP })
    expect(plan.kind).toBe('workout')
    const t = at(plan, 10)
    expect(t.segmentLabel).toBe('Warm-up')
    expect(t.targetW).toBe(133) // 0.5 + 0.2 × 10/60 of 250 W
    expect(t.desired).toEqual({ mode: 'erg', watts: expect.closeTo(134.17, 1) }) // one second ahead
    expect(t.next).toEqual({ label: 'Interval 1/3', durationS: 60, watts: 275, endWatts: null, ergOff: false })
    expect(t.nextLabel).toBe('Interval 1/3 · 1:00 · 275 W')
    expect(t.remainingS).toBe(410)

    // The step change goes out a second early; the recorded target does not.
    const edge = at(plan, 59.5)
    expect(edge.desired).toEqual({ mode: 'erg', watts: 275 })
    expect(edge.targetW).toBe(175)

    const on = at(plan, 70, { intensityPct: 110 })
    expect(on.segmentLabel).toBe('Interval 1/3')
    expect(on.targetW).toBe(303) // 275 W × 110 %: the controller scales ERG, the target shows it
    expect(on.desired).toEqual({ mode: 'erg', watts: 275 })
    expect(at(plan, 130).segmentLabel).toBe('Recovery')
    expect(at(plan, 250).segmentLabel).toBe('Interval 3/3')
  })

  it('turns ERG off on free-ride steps: flat road by default, or the configured level', () => {
    expect(at(new WorkoutPlan(W, { ftpW: FTP }), 340).desired).toEqual(FLAT_ROAD)
    const level = new WorkoutPlan(W, { ftpW: FTP, ergOff: { mode: 'resistance', pct: 30 } })
    const t = at(level, 340)
    expect(t.desired).toEqual({ mode: 'resistance', pct: 30 })
    expect(t.targetW).toBeNull()
    expect(t.segmentLabel).toBe('Free ride')
  })

  it('fires each text cue once as it is crossed, and never for skipped content', () => {
    const plan = new WorkoutPlan(W, { ftpW: FTP })
    at(plan, 0)
    expect(cues(run(plan, 0, 100))).toEqual(['Go', 'Halfway'])
    // Skip on1's successor... then come back: cues after the new position re-arm.
    const plan2 = new WorkoutPlan(W, { ftpW: FTP })
    at(plan2, 0)
    run(plan2, 0, 70)
    plan2.command({ type: 'skip' }, 70) // on1 → off1 at 120; "Halfway" at 90 is skipped
    expect(cues(run(plan2, 70, 75))).toEqual([])
    plan2.command({ type: 'back' }, 75) // 5 s into off1 → restart off1
    plan2.command({ type: 'back' }, 75) // within 3 s of its start → back to on1 at 60
    expect(at(plan2, 75.25).segmentLabel).toBe('Interval 1/3')
    expect(cues(run(plan2, 75.25, 110))).toEqual(['Halfway'])
  })

  it('skips, goes back and extends', () => {
    const plan = new WorkoutPlan(W, { ftpW: FTP })
    run(plan, 0, 70)
    expect(plan.command({ type: 'skip' }, 70)).toBe(true)
    expect(at(plan, 70).positionS).toBe(120)
    expect(plan.command({ type: 'back' }, 80)).toBe(true) // 10 s into off1 → its start
    expect(at(plan, 80).positionS).toBe(120)
    expect(plan.command({ type: 'extend', seconds: 30 }, 80)).toBe(true)
    const t = at(plan, 90)
    expect(t.segmentLabel).toBe('Recovery')
    expect(t.segmentRemainingS).toBe(50) // 30 s step + 30 s, 10 s in
    expect(plan.timeline.durationS).toBe(450)
    expect(plan.revision).toBe(1)
    expect(plan.timeline.steps[3]!.startS).toBe(180)
  })

  it('lets the rider ride the workout on level or slope and nudge it', () => {
    const plan = new WorkoutPlan(W, { ftpW: FTP })
    expect(plan.command({ type: 'mode', mode: 'resistance' }, 10)).toBe(true)
    expect(plan.command({ type: 'nudge', delta: 5 }, 10)).toBe(true)
    let t = at(plan, 10)
    expect(t.desired).toEqual({ mode: 'resistance', pct: 30 })
    expect(t.targetW).toBe(133) // the target is still shown and recorded
    plan.command({ type: 'mode', mode: 'sim' }, 10)
    plan.command({ type: 'nudge', delta: 1.5 }, 10)
    expect(at(plan, 11).desired).toEqual({ mode: 'sim', gradePct: 1.5 })
    expect(plan.command({ type: 'mode', mode: 'hr' }, 11)).toBe(false)
    plan.command({ type: 'mode', mode: 'erg' }, 11)
    t = at(plan, 12)
    expect(t.desired?.mode).toBe('erg')
    expect(plan.command({ type: 'nudge', delta: 5 }, 12)).toBe(false)
  })

  it('finishes once past the end, holding an easy spin', () => {
    const plan = new WorkoutPlan(W, { ftpW: FTP })
    const t = run(plan, 0, 421).at(-1)!
    expect(t.finished).toBe(true)
    expect(t.segmentIndex).toBe(9)
    expect(t.segmentLabel).toBe('Workout complete')
    expect(t.desired).toEqual({ mode: 'erg', watts: 125 }) // min(last 150 W, 50 % FTP)
  })

  describe('interval rescue', () => {
    const HARD: Workout = {
      ...W,
      segments: [{ kind: 'intervals', repeat: 2, on: { durationS: 120, power: ftp(1.05) }, off: { durationS: 60, power: ftp(0.45) } }],
    }

    it('offers help once when a hard interval fails, and the breather resumes the interval', () => {
      const plan = new WorkoutPlan(HARD, { ftpW: FTP })
      const ticks = run(plan, 0, 40, { power: 200 }) // 76 % of 262.5 W
      const offers = ticks.filter((t) => t.rescue)
      expect(offers).toHaveLength(1)
      expect(offers[0]!.positionS).toBe(25) // 15 s grace + 10 s of trouble
      expect(offers[0]!.rescue).toMatchObject({ reason: 'low-power' })

      expect(plan.command({ type: 'rescue', choice: 'rest' }, 40)).toBe(true)
      const rest = at(plan, 50)
      expect(rest.segmentLabel).toBe('Breather')
      expect(rest.targetW).toBe(113) // the set's own 45 % recovery
      expect(rest.cue).toMatch(/breathe/)
      const back = at(plan, 75)
      expect(back.segmentLabel).toBe('Interval 1/2')
      expect(back.segmentRemainingS).toBe(75) // the 80 s left when the rider stopped, 5 s in
      expect(plan.timeline.durationS).toBe(360 + RESCUE_REST_S)
      // The same interval is never offered twice, even while struggling again.
      expect(run(plan, 75, 145, { power: 150 }).some((t) => t.rescue)).toBe(false)
      // The next interval can be.
      expect(run(plan, 210, 250, { power: 150 }).some((t) => t.rescue)).toBe(true)
    })

    it('treats a collapsing cadence as trouble, ignores easy steps, and stays out of FTP tests', () => {
      const plan = new WorkoutPlan(HARD, { ftpW: FTP })
      expect(run(plan, 0, 30, { power: 262, cadence: 40 }).find((t) => t.rescue)?.rescue?.reason).toBe('low-cadence')
      expect(run(new WorkoutPlan(HARD, { ftpW: FTP }), 120, 170, { power: 20 }).some((t) => t.rescue)).toBe(false)
      expect(run(new WorkoutPlan(HARD, { ftpW: FTP, rescue: false }), 0, 40, { power: 100 }).some((t) => t.rescue)).toBe(false)
      expect(run(new WorkoutPlan(FTP_TEST_20MIN, { ftpW: FTP }), 2400, 2460, { power: 50 }).some((t) => t.rescue)).toBe(false)
    })
  })

  describe('FTP tests', () => {
    it('runs the 20-minute effort ERG-off with a pacing target and live projection', () => {
      const plan = new WorkoutPlan(FTP_TEST_20MIN, { ftpW: FTP })
      expect(plan.kind).toBe('ftp-test')
      const ticks = run(plan, 0, 2500, (m) => ({ power: m >= 2400 ? 270 : 150 }))
      const t = ticks.at(-1)!
      expect(t.segmentLabel).toBe('20-min test effort')
      expect(t.desired).toEqual(FLAT_ROAD)
      expect(t.targetW).toBe(263) // 250 / 0.95
      expect(t.effort).toEqual({ label: '20-min test effort', elapsedS: 100, remainingS: 1100, avgW: 270, targetW: 263, projectedFtpW: 257 })
      expect(ticks.find((x) => x.positionS === 2400.25)?.cue).toMatch(/Twenty minutes/)
    })

    it('computes FTP from the records even after the warm-up was extended', () => {
      const plan = new WorkoutPlan(FTP_TEST_20MIN, { ftpW: FTP })
      // The rider rides 270 W whenever the plan says the effort is on.
      const fed = new Map<number, number>()
      let effort = false
      for (let k = 1; k <= 4300 * 4; k++) {
        const m = k / 4
        if (k === 400) plan.command({ type: 'extend', seconds: 60 }, m)
        fed.set(m, effort ? 270 : 150)
        effort = at(plan, m, { power: fed.get(m)! }).segmentLabel === '20-min test effort'
      }
      const records = Array.from({ length: 4300 }, (_, t) => ({ t, power: fed.get(t + 0.5) ?? null }))
      const r = plan.ftpResult(records)!
      expect(r.valid).toBe(true)
      expect(r.ftpW).toBeCloseTo(256.5, 5)
    })

    it('ends the ramp test when the rider can no longer turn the pedals', () => {
      const ramp = rampTest({ startW: 100, stepW: 20, maxSteps: 10 }) // warm-up [0,300), steps [300,900), cool-down
      const plan = new WorkoutPlan(ramp, { ftpW: FTP })
      const targetAt = (m: number) => (m < 300 ? 80 : 100 + Math.floor((m - 300) / 60) * 20)
      const feed = (m: number): Feed => (m < 500 ? { power: targetAt(m), cadence: 90 } : m < 503 ? { power: 100, cadence: 40 } : { power: 90, cadence: 85 })
      const ticks = run(plan, 0, 520, feed)
      const bestSoFar = ticks.findLast((t) => t.effort)?.effort
      expect(bestSoFar?.projectedFtpW).toBe(Math.round(bestSoFar!.avgW! * 0.75))
      expect(plan.rampEndedAtS).toBe(502.5)
      expect(ticks.at(-1)!.segmentLabel).toBe('Cool-down')
      expect(ticks.some((t) => t.cue?.includes('ramp done'))).toBe(true)

      const records = Array.from({ length: 520 }, (_, k) => ({ t: k, power: feed(k + 0.5).power ?? null }))
      const aligned = plan.alignToTimeline(records, (r) => r.power)
      let best = 0
      for (let i = 300; i + 60 <= 503; i++) best = Math.max(best, aligned.slice(i, i + 60).reduce<number>((a, v) => a + (v ?? 0), 0) / 60)
      const r = plan.ftpResult(records)!
      expect(r.ftpW).toBeCloseTo(0.75 * best, 6)
      // Skipping during the ramp also ends it rather than stepping up.
      const plan2 = new WorkoutPlan(ramp, { ftpW: FTP })
      run(plan2, 0, 320, { power: 100, cadence: 90 })
      plan2.command({ type: 'skip' }, 320)
      expect(at(plan2, 321).segmentLabel).toBe('Cool-down')
    })
  })

  it('maps records onto the final timeline through skips, repeats and extensions', () => {
    const plan = new WorkoutPlan(W, { ftpW: FTP })
    run(plan, 0, 70)
    plan.command({ type: 'extend', seconds: 30 }, 70) // on1 now [60,150)
    run(plan, 70, 100)
    plan.command({ type: 'skip' }, 100) // → off1 at 150
    run(plan, 100, 110)
    plan.command({ type: 'back' }, 110) // 10 s into off1 → restart it
    run(plan, 110, 120)
    const records = Array.from({ length: 120 }, (_, k) => ({ t: k }))
    const aligned = plan.alignToTimeline(records, (r) => r.t)
    expect(aligned).toHaveLength(450)
    expect(aligned.slice(0, 100)).toEqual(Array.from({ length: 100 }, (_, k) => k))
    expect(aligned.slice(100, 150).every((v) => v === null)).toBe(true)
    expect(aligned.slice(150, 160)).toEqual(Array.from({ length: 10 }, (_, k) => 110 + k)) // the repeat wins
    expect(aligned[160]).toBeNull()
  })
})

describe('timeline edits', () => {
  const tl = compileWorkout(W)

  it('extendStep lengthens one step and shifts the rest, cues included', () => {
    const e = extendStep(tl, 1, 20)
    expect(e.steps[1]).toMatchObject({ startS: 60, endS: 140, durationS: 80 })
    expect(e.steps[2]).toMatchObject({ startS: 140, endS: 170 })
    expect(e.durationS).toBe(440)
    expect(e.texts.map((t) => t.atS)).toEqual([0, 90]) // "Halfway" is inside the extended step
    expect(tl.durationS).toBe(420) // the original is untouched
  })

  it('insertRest splits a ramp at its interpolated target', () => {
    const r = insertRest(tl, 30, 30, ftp(0.4), 'Breather', FTP)
    expect(r.steps.slice(0, 3).map((s) => [s.kind, s.startS, s.endS])).toEqual([
      ['ramp', 0, 30],
      ['off', 30, 60],
      ['ramp', 60, 90],
    ])
    expect(r.steps[0]!.to).toEqual({ unit: 'ftp', value: expect.closeTo(0.6, 9) })
    expect(r.steps[2]!.from).toEqual({ unit: 'ftp', value: expect.closeTo(0.6, 9) })
    expect(r.steps.map((s) => s.index)).toEqual(r.steps.map((_, i) => i))
    expect(r.texts.map((t) => [t.atS, t.stepIndex])).toEqual([
      [0, 0],
      [120, 3],
    ])
    expect(r.durationS).toBe(450)
  })
})
