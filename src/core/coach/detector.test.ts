import { describe, expect, it } from 'vitest'
import { isHardKind } from '../persona/template'
import { isDataKey, type CoachContext, type CoachData, type CoachTrigger, type SegmentKind } from '../persona/types'
import { IDLE_TICK, type PlanTick } from '../ride/plan'
import type { SessionEvent } from '../ride/session'
import { DETECTOR_RULES, TriggerDetector, prLabel, type DetectorOptions, type DetectorTick } from './detector'
import type { CoachSegment } from './segments'

const FTP = 250
const TPS = 4 // ticks per second, like the engine

interface Step {
  kind: SegmentKind
  s: number
  w: number | null
  hard?: boolean
  label?: string
  rep?: number
  reps?: number
  ftpEffort?: boolean
}

/** A tiny stand-in for WorkoutPlan: steps on a timeline, editable like the real one. */
class Script {
  steps: Step[]
  rev = 0
  constructor(steps: Step[]) {
    this.steps = steps.map((s) => ({ ...s }))
  }
  get total(): number {
    return this.steps.reduce((a, s) => a + s.s, 0)
  }
  start(i: number): number {
    return this.steps.slice(0, i).reduce((a, s) => a + s.s, 0)
  }
  segment = (i: number): CoachSegment | null => {
    const s = this.steps[i]
    if (!s) return null
    return {
      index: i,
      kind: s.kind,
      hard: s.hard ?? isHardKind(s.kind),
      durationS: s.s,
      label: s.label ?? null,
      rep: s.rep ?? null,
      reps: s.reps ?? null,
      ftpEffort: s.ftpEffort ?? false,
      fraction: s.w === null ? null : s.w / FTP,
    }
  }
  plan(pos: number): PlanTick {
    let i = 0
    let start = 0
    while (i < this.steps.length && pos >= start + this.steps[i]!.s) start += this.steps[i++]!.s
    const s = this.steps[i]
    if (!s) return { ...IDLE_TICK, segmentIndex: this.steps.length, segmentLabel: 'Workout complete', segmentKind: 'done', remainingS: 0, finished: true, timelineRev: this.rev }
    const next = this.steps[i + 1]
    const elapsed = pos - start
    return {
      ...IDLE_TICK,
      targetW: s.w,
      segmentIndex: i,
      segmentLabel: s.label ?? null,
      segmentKind: s.kind,
      segmentElapsedS: elapsed,
      segmentRemainingS: s.s - elapsed,
      remainingS: this.total - pos,
      timelineRev: this.rev,
      next: next ? { label: next.label ?? next.kind, durationS: next.s, watts: next.w, endWatts: null, ergOff: next.w === null } : null,
      effort: s.ftpEffort ? { label: s.label ?? 'effort', elapsedS: elapsed, remainingS: s.s - elapsed, avgW: 250, targetW: s.w, projectedFtpW: 238 } : null,
    }
  }
  extend(i: number, seconds: number): void {
    this.steps[i]!.s += seconds
    this.rev++
  }
  /** The rescue breather: split the step at `pos` and rest there. */
  breather(pos: number, restS: number): void {
    let i = 0
    while (pos >= this.start(i + 1)) i++
    const s = this.steps[i]!
    const done = pos - this.start(i)
    this.steps.splice(i, 1, { ...s, s: done }, { kind: 'off', s: restS, w: 125, label: 'Breather' }, { ...s, s: s.s - done })
    this.rev++
  }
}

interface Said {
  t: number
  trigger: CoachTrigger
  data: CoachData
  ctx: CoachContext
}

interface RideOpts {
  toS: number
  fromS?: number
  /** Timeline position for ride time t (skips jump it). */
  pos?: (t: number) => number
  /** The rider and sensors at time t. */
  rider?: (t: number, plan: PlanTick) => Partial<DetectorTick>
  /** Which moments the engine "said" (default all), so retried cues stop. */
  speak?: (c: CoachContext) => boolean
  /** Session events, fired just before the tick at that time. */
  events?: [number, SessionEvent][]
  /** Called before each tick, e.g. to edit the script. */
  before?: (t: number) => void
}

function ride(det: TriggerDetector, script: Script | null, o: RideOpts): Said[] {
  const said: Said[] = []
  const take = (t: number, list: CoachContext[]) => {
    for (const c of list) {
      said.push({ t, trigger: c.trigger, data: c.data, ctx: c })
      if (o.speak ? o.speak(c) : true) det.spoken(c.trigger)
    }
  }
  for (let k = Math.round((o.fromS ?? 0) * TPS); k <= Math.round(o.toS * TPS); k++) {
    const t = k / TPS
    o.before?.(t)
    for (const [at, e] of o.events ?? []) if (Math.abs(at - t) < 1e-9) take(t, det.event(e, t * 1000))
    const plan = script ? script.plan(o.pos ? o.pos(t) : t) : IDLE_TICK
    const target = plan.targetW
    const base: DetectorTick = {
      now: t * 1000,
      state: 'riding',
      plan,
      targetW: target,
      power: target ?? 150,
      cadence: 90,
      power3s: target ?? 150,
      cadence3s: 90,
      hr: 130,
      erg: target !== null,
      intensityPct: 100,
      movingS: t,
      metrics: null,
    }
    const extra = o.rider?.(t, plan) ?? {}
    const tick: DetectorTick = { ...base, ...extra }
    // a rider override of instantaneous values carries into the 3-s averages unless given
    if (extra.power !== undefined && extra.power3s === undefined) tick.power3s = extra.power
    if (extra.cadence !== undefined && extra.cadence3s === undefined) tick.cadence3s = extra.cadence
    take(t, det.tick(tick))
  }
  return said
}

const detector = (script: Script | null, opts: Partial<DetectorOptions> = {}) =>
  new TriggerDetector({ rideKind: script ? 'workout' : 'free', ftpW: FTP, workoutName: 'Test Session', segments: script?.segment, plannedDurationS: script?.total ?? null, ...opts })

const of = (said: Said[], trigger: CoachTrigger) => said.filter((s) => s.trigger === trigger)
const times = (said: Said[], trigger: CoachTrigger) => of(said, trigger).map((s) => s.t)

// warmup 60 s, two 2-min reps at 300 W with 1-min recoveries, cooldown
const REPS = (): Script =>
  new Script([
    { kind: 'warmup', s: 60, w: 150, label: 'Warm-up' },
    { kind: 'on', s: 120, w: 300, label: 'VO2 1/2', rep: 1, reps: 2 },
    { kind: 'off', s: 60, w: 125, label: 'Easy', rep: 1, reps: 2 },
    { kind: 'on', s: 120, w: 300, label: 'VO2 2/2', rep: 2, reps: 2 },
    { kind: 'off', s: 60, w: 125, label: 'Easy', rep: 2, reps: 2 },
    { kind: 'cooldown', s: 60, w: 120, label: 'Cool-down' },
  ])

describe('ride start and segments', () => {
  it('opens with ride_start, naming the workout (not a free ride)', () => {
    const said = ride(detector(REPS()), REPS(), { toS: 1 })
    expect(said[0]).toMatchObject({ t: 0, trigger: 'ride_start', data: { workoutName: 'Test Session', elapsedS: 0 } })
    const free = ride(detector(null), null, { toS: 1 })
    expect(free[0]?.trigger).toBe('ride_start')
    expect(free[0]?.data.workoutName).toBeUndefined()
  })

  it('announces every segment with its kind, hard flag, target, length and rep', () => {
    const script = REPS()
    const said = ride(detector(script), script, { toS: 480 })
    expect(of(said, 'segment_start').map((s) => [s.t, s.data.segmentKind, s.data.hard, s.data.targetW, s.data.remainingS, s.data.durationS, s.data.rep, s.data.reps])).toEqual([
      [0, 'warmup', false, 150, 60, 60, undefined, undefined],
      [60, 'on', true, 300, 120, 120, 1, 2],
      [180, 'off', false, 125, 60, 60, 1, 2],
      [240, 'on', true, 300, 120, 120, 2, 2],
      [360, 'off', false, 125, 60, 60, 2, 2],
      [420, 'cooldown', false, 120, 60, 60, undefined, undefined],
    ])
  })

  it('announces only the first and last reps of a micro-interval set', () => {
    const steps: Step[] = [{ kind: 'warmup', s: 60, w: 150 }]
    for (let r = 1; r <= 5; r++) steps.push({ kind: 'on', s: 30, w: 310, rep: r, reps: 5 }, { kind: 'off', s: 30, w: 125, rep: r, reps: 5 })
    const script = new Script(steps)
    const said = ride(detector(script), script, { toS: script.total })
    const starts = of(said, 'segment_start').filter((s) => s.data.hard)
    expect(starts.map((s) => s.data.rep)).toEqual([1, 5])
    expect(of(said, 'countdown_10s').map((s) => s.data.rep)).toEqual([1, 5])
    // and one verdict for the set, after the last rep
    expect([...of(said, 'segment_end_success'), ...of(said, 'segment_end_failed')].map((s) => s.data.rep)).toEqual([5])
  })
})

describe('countdown_10s', () => {
  it('fires 10 s before a hard segment, describing the upcoming one', () => {
    const script = REPS()
    const said = ride(detector(script), script, { toS: 480 })
    expect(of(said, 'countdown_10s').map((s) => [s.t, s.data])).toEqual([
      [50, { segmentKind: 'on', hard: true, targetW: 300, remainingS: 10, durationS: 120, segmentLabel: 'VO2 1/2', rep: 1, reps: 2 }],
      [230, { segmentKind: 'on', hard: true, targetW: 300, remainingS: 10, durationS: 120, segmentLabel: 'VO2 2/2', rep: 2, reps: 2 }],
    ])
  })

  it('is retried for a few seconds until it is said, then stops', () => {
    const script = REPS()
    const none = ride(detector(script), script, { toS: 60, speak: () => false })
    expect(times(none, 'countdown_10s')).toEqual([50, 51, 52, 53])
    const second = ride(detector(REPS()), REPS(), { toS: 60, speak: (c) => c.trigger !== 'countdown_10s' || c.now >= 51_000 })
    expect(times(second, 'countdown_10s')).toEqual([50, 51])
  })

  it('never fires between two hard segments (over-unders)', () => {
    const script = new Script([
      { kind: 'warmup', s: 60, w: 150 },
      { kind: 'on', s: 120, w: 238, label: 'Under' },
      { kind: 'on', s: 60, w: 263, label: 'Over' },
      { kind: 'off', s: 60, w: 125 },
    ])
    const said = ride(detector(script), script, { toS: script.total })
    expect(times(said, 'countdown_10s')).toEqual([50])
    // no verdict between Under and Over; one after Over
    expect(of(said, 'segment_end_success').map((s) => [s.t, s.data.segmentLabel])).toEqual([[240, 'Over']])
  })
})

describe('halfway and last_minute', () => {
  it('marks the middle of hard segments of at least a minute, with power and target', () => {
    const script = REPS()
    const said = ride(detector(script), script, { toS: 480, rider: () => ({ power: 290 }) })
    expect(of(said, 'halfway').map((s) => [s.t, s.data.power, s.data.targetW, s.data.remainingS, s.data.durationS, s.data.hard])).toEqual([
      [120, 290, 300, 60, 120, true],
      [300, 290, 300, 60, 120, true],
    ])
    // 2-minute reps are too short for a last-minute call
    expect(of(said, 'last_minute')).toEqual([])
  })

  it('calls the last minute of hard segments of 3 minutes or more', () => {
    const script = new Script([
      { kind: 'warmup', s: 60, w: 150 },
      { kind: 'on', s: 240, w: 290 },
      { kind: 'off', s: 120, w: 125 },
      { kind: 'on', s: 45, w: 320 },
      { kind: 'off', s: 60, w: 125 },
    ])
    const said = ride(detector(script), script, { toS: script.total })
    expect(of(said, 'last_minute').map((s) => [s.t, s.data.remainingS, s.data.hard])).toEqual([[240, 60, true]])
    // the 45-s effort gets no halfway either
    expect(times(said, 'halfway')).toEqual([180])
  })

  it('retries halfway for a few seconds when the engine is busy', () => {
    const script = REPS()
    const said = ride(detector(script), script, { toS: 180, speak: (c) => c.trigger !== 'halfway' || c.now >= 123_000 })
    expect(times(said, 'halfway')).toEqual([120, 121, 122, 123])
  })

  it('never fires in easy segments', () => {
    const script = new Script([{ kind: 'steady', s: 600, w: 180 }])
    const said = ride(detector(script), script, { toS: 600 })
    expect([...of(said, 'halfway'), ...of(said, 'last_minute'), ...of(said, 'countdown_10s')]).toEqual([])
  })
})

describe('segment verdicts', () => {
  it('judges a hard segment by its average against the target', () => {
    const script = REPS()
    const said = ride(detector(script), script, { toS: 480, rider: (t) => ({ power: t < 180 ? 280 : 250 }) })
    expect(of(said, 'segment_end_success').map((s) => [s.t, s.data.avgW, s.data.targetW, s.data.pct, s.data.rep])).toEqual([[180, 280, 300, 93.3, 1]])
    // 250 / 300 = 83 %: below the 90 % line
    expect(of(said, 'segment_end_failed').map((s) => [s.t, s.data.avgW, s.data.pct, s.data.rep, s.data.reps])).toEqual([[360, 250, 83.3, 2, 2]])
  })

  it('ignores the ERG settling seconds at the start of a step', () => {
    const script = REPS()
    // the trainer takes a couple of seconds to reach the target
    const said = ride(detector(script), script, { toS: 200, rider: (t, plan) => ({ power: (plan.segmentElapsedS ?? 0) < 2.5 ? 150 : 300 }) })
    expect(of(said, 'segment_end_success')[0]?.data.pct).toBe(100)
  })

  it('gives no verdict on easy segments', () => {
    const script = new Script([
      { kind: 'steady', s: 120, w: 180 },
      { kind: 'off', s: 120, w: 125 },
    ])
    const said = ride(detector(script), script, { toS: 240 })
    expect([...of(said, 'segment_end_success'), ...of(said, 'segment_end_failed')]).toEqual([])
  })
})

describe('skip, back and edits', () => {
  it('calls a skipped hard interval by name, with no verdict', () => {
    const script = REPS()
    const said = ride(detector(script), script, { toS: 200, pos: (t) => (t < 100 ? t : t + 80) })
    expect(of(said, 'skipped_interval').map((s) => [s.t, s.data.segmentLabel, s.data.hard])).toEqual([[100, 'VO2 1/2', true]])
    expect([...of(said, 'segment_end_success'), ...of(said, 'segment_end_failed')]).toEqual([])
    expect(of(said, 'segment_start').map((s) => s.t)).toEqual([0, 60, 100, 160])
  })

  it('stays quiet about skipping an easy segment', () => {
    const script = REPS()
    const said = ride(detector(script), script, { toS: 70, pos: (t) => (t < 20 ? t : t + 40) })
    expect(of(said, 'skipped_interval')).toEqual([])
    expect(of(said, 'segment_start').map((s) => [s.t, s.data.segmentKind])).toEqual([
      [0, 'warmup'],
      [20, 'on'],
    ])
  })

  it('reports an extension with the seconds added', () => {
    const script = REPS()
    const said = ride(detector(script), script, { toS: 260, before: (t) => t === 100 && script.extend(1, 60) })
    expect(of(said, 'extended_interval').map((s) => [s.t, s.data.extraS, s.data.hard])).toEqual([[100, 60, true]])
    // the verdict comes when the longer interval ends
    expect(times(said, 'segment_end_success')).toEqual([240])
  })

  it('treats the rescue breather as an edit: no verdict, no skip, and a countdown back in', () => {
    const script = REPS()
    const said = ride(detector(script), script, { toS: 170, before: (t) => t === 120 && script.breather(120, 30) })
    expect([...of(said, 'segment_end_success'), ...of(said, 'segment_end_failed'), ...of(said, 'skipped_interval')]).toEqual([])
    expect(of(said, 'segment_start').map((s) => [s.t, s.data.segmentKind, s.data.remainingS])).toEqual([
      [0, 'warmup', 60],
      [60, 'on', 120],
      [120, 'off', 30],
      [150, 'on', 60],
    ])
    expect(times(said, 'countdown_10s')).toEqual([50, 140])
  })

  it('rides a segment again after going back to its start', () => {
    const script = REPS()
    const said = ride(detector(script), script, { toS: 130, pos: (t) => (t < 100 ? t : t - 40) })
    expect(of(said, 'segment_start').map((s) => [s.t, s.data.segmentKind])).toEqual([
      [0, 'warmup'],
      [60, 'on'],
      [100, 'on'],
    ])
    expect(of(said, 'skipped_interval')).toEqual([])
  })
})

describe('under_target', () => {
  const steady = () =>
    new Script([
      { kind: 'warmup', s: 30, w: 150 },
      { kind: 'steady', s: 300, w: 200 },
      { kind: 'steady', s: 300, w: 180 },
    ])

  it('fires after 8 s more than 5 % under, once the 8 s grace after a target change is over', () => {
    const script = steady()
    const said = ride(detector(script), script, { toS: 80, rider: (t) => ({ power: t >= 30 ? 180 : 150 }) })
    const under = of(said, 'under_target')
    expect(under[0]).toMatchObject({ t: 46, data: { power: 180, targetW: 200, erg: true } })
    // re-sent while it holds, at most once a second (the engine paces what is said)
    expect(under.map((s) => s.t).slice(0, 4)).toEqual([46, 47, 48, 49])
    for (const s of under) expect(s.data.power as number).toBeLessThan(0.95 * (s.data.targetW as number))
  })

  it('stays quiet within 5 %, outside ERG and when power is missing', () => {
    const script = steady()
    expect(of(ride(detector(script), script, { toS: 200, rider: () => ({ power: 192 }) }), 'under_target')).toEqual([])
    expect(of(ride(detector(steady()), steady(), { toS: 200, rider: () => ({ power: 150, erg: false }) }), 'under_target')).toEqual([])
    expect(of(ride(detector(steady()), steady(), { toS: 200, rider: () => ({ power: null, power3s: null }) }), 'under_target')).toEqual([])
  })

  it('restarts the grace when the target changes, or the intensity does', () => {
    const script = steady()
    // under from the start of the second steady block (330 s): grace 8 s + hold 8 s
    const said = ride(detector(script), script, { fromS: 0, toS: 360, rider: (t) => ({ power: t >= 330 ? 160 : t >= 30 ? 200 : 150 }) })
    expect(times(said, 'under_target')[0]).toBe(346)
    const intensity = ride(detector(steady()), steady(), {
      toS: 120,
      rider: (t) => ({ intensityPct: t >= 90 ? 95 : 100, power: t >= 90 ? 170 : 200, targetW: t >= 90 ? 190 : 200 }),
    })
    expect(times(intensity, 'under_target')[0]).toBe(106)
  })

  it('waits while the rider answers an interval-rescue offer', () => {
    const script = steady()
    const said = ride(detector(script), script, {
      toS: 90,
      rider: (t) => ({ power: t >= 30 ? 170 : 150 }),
      events: [[40, { type: 'rescue', offer: { key: 'k', reason: 'low-power', message: 'm' } }]],
    })
    expect(times(said, 'under_target')[0]).toBe(68)
  })
})

describe('over_target_early', () => {
  const effort = () =>
    new Script([
      { kind: 'warmup', s: 30, w: 150 },
      { kind: 'steady', s: 600, w: 263, hard: true },
    ])

  it('fires when more than 10 % over in the first 20 % of a long interval without ERG', () => {
    const script = effort()
    const said = ride(detector(script), script, { toS: 200, rider: () => ({ erg: false, power: 300 }) })
    expect(of(said, 'over_target_early').map((s) => [s.t, s.data.power, s.data.targetW, s.data.erg])).toEqual([[43, 300, 263, false]])
  })

  it('keeps trying through the early window until it is said', () => {
    const script = effort()
    const said = ride(detector(script), script, { toS: 200, rider: () => ({ erg: false, power: 300 }), speak: (c) => c.trigger !== 'over_target_early' || c.now >= 45_000 })
    expect(times(said, 'over_target_early')).toEqual([43, 44, 45])
  })

  it('ignores surges late in the interval, in ERG, and in short intervals', () => {
    const late = ride(detector(effort()), effort(), { toS: 400, rider: (t) => ({ erg: false, power: t > 180 ? 320 : 263 }) })
    expect(of(late, 'over_target_early')).toEqual([])
    const erg = ride(detector(effort()), effort(), { toS: 200, rider: () => ({ power: 320 }) })
    expect(of(erg, 'over_target_early')).toEqual([])
    const short = new Script([
      { kind: 'warmup', s: 30, w: 150 },
      { kind: 'on', s: 120, w: 263 },
    ])
    expect(of(ride(detector(short), short, { toS: 150, rider: () => ({ erg: false, power: 320 }) }), 'over_target_early')).toEqual([])
  })
})

describe('cadence_sag', () => {
  const steady = () => new Script([{ kind: 'steady', s: 600, w: 200 }])

  it('fires 10 rpm below the segment average, held for 5 s', () => {
    const said = ride(detector(steady()), steady(), { toS: 160, rider: (t) => ({ cadence: t >= 100 ? 78 : 90 }) })
    const sag = of(said, 'cadence_sag')
    expect(sag[0]).toMatchObject({ t: 105, data: { cadence: 78, cadenceAvg: 90 } })
    for (const s of sag) expect((s.data.cadenceAvg as number) - (s.data.cadence as number)).toBeGreaterThanOrEqual(10)
  })

  it('does not count stopping as sagging, nor the first seconds of a segment', () => {
    expect(of(ride(detector(steady()), steady(), { toS: 160, rider: (t) => ({ cadence: t >= 100 ? 20 : 90 }) }), 'cadence_sag')).toEqual([])
    const script = new Script([
      { kind: 'steady', s: 100, w: 200 },
      { kind: 'steady', s: 100, w: 200 },
    ])
    // a new segment brings a new baseline: the drop at its start is not a sag
    expect(of(ride(detector(script), script, { toS: 130, rider: (t) => ({ cadence: t >= 100 ? 75 : 90 }) }), 'cadence_sag')).toEqual([])
  })
})

describe('heart rate', () => {
  const endurance = () => new Script([{ kind: 'steady', s: 1200, w: 170 }])

  it('hr_high: drift above the zone cap in steady aerobic work', () => {
    // 170 W is Z2 at FTP 250; Friel Z2 tops out at 90 % of LTHR = 153
    const said = ride(detector(endurance(), { lthr: 170 }), endurance(), { toS: 240, rider: () => ({ hr: 158 }) })
    const high = of(said, 'hr_high')
    expect(high[0]).toMatchObject({ t: 150, data: { hr: 158, hrCap: 153 } })
    for (const s of high) expect(s.data.hr as number).toBeGreaterThan(s.data.hrCap as number)
    // with only max HR known, LTHR is taken as 90 % of it
    const byMax = ride(detector(endurance(), { maxHr: 190 }), endurance(), { toS: 200, rider: () => ({ hr: 158 }) })
    expect(of(byMax, 'hr_high')[0]?.data.hrCap).toBe(154)
  })

  it('hr_high: never in hard efforts, recoveries, or without HR zones', () => {
    const vo2 = new Script([{ kind: 'on', s: 600, w: 290 }])
    expect(of(ride(detector(vo2, { lthr: 170 }), vo2, { toS: 400, rider: () => ({ hr: 180 }) }), 'hr_high')).toEqual([])
    const rest = new Script([{ kind: 'off', s: 600, w: 120 }])
    expect(of(ride(detector(rest, { lthr: 170 }), rest, { toS: 400, rider: () => ({ hr: 160 }) }), 'hr_high')).toEqual([])
    expect(of(ride(detector(endurance()), endurance(), { toS: 400, rider: () => ({ hr: 175 }) }), 'hr_high')).toEqual([])
  })

  it('hr_spike_no_power: a sudden jump without the power to match, once per spike', () => {
    const said = ride(detector(endurance(), { maxHr: 190 }), endurance(), {
      toS: 400,
      rider: (t) => ({ power: 120, hr: (t >= 100 && t < 150) || t >= 300 ? 178 : 120 }),
    })
    expect(of(said, 'hr_spike_no_power').map((s) => [s.t, s.data.hr, s.data.power])).toEqual([
      [100, 178, 120],
      [300, 178, 120],
    ])
    // the same jump during a sprint is just a sprint
    const sprint = ride(detector(endurance(), { maxHr: 190 }), endurance(), { toS: 200, rider: (t) => ({ power: t >= 100 ? 500 : 120, hr: t >= 100 ? 178 : 120 }) })
    expect(of(sprint, 'hr_spike_no_power')).toEqual([])
  })

  it('distress: heart rate above max for 15 s, repeated only every 4 minutes', () => {
    const said = ride(detector(endurance(), { maxHr: 180 }), endurance(), { toS: 400, rider: (t) => ({ hr: t >= 100 ? 190 : 140 }) })
    expect(of(said, 'distress').map((s) => [s.t, s.data.hr])).toEqual([
      [115, 190],
      [355, 190],
    ])
    // an implausible reading is not joked about as a glitch
    expect(of(said, 'hr_spike_no_power')).toEqual([])
    // no max HR on file: an absolute limit
    const fallback = ride(detector(endurance()), endurance(), { toS: 200, rider: (t) => ({ hr: t >= 100 ? 212 : 140 }) })
    expect(times(fallback, 'distress')).toEqual([115])
    expect(of(ride(detector(endurance(), { maxHr: 180 }), endurance(), { toS: 200, rider: () => ({ hr: 184 }) }), 'distress')).toEqual([])
  })
})

describe('stops', () => {
  const hard = () =>
    new Script([
      { kind: 'warmup', s: 60, w: 150 },
      { kind: 'on', s: 240, w: 300 },
      { kind: 'off', s: 240, w: 125 },
    ])
  const zeroFrom = (from: number, to = Infinity) => (t: number) => (t >= from && t < to ? { power: 0, cadence: 0 } : {})

  it('a sudden stop during a hard effort is distress, not a roast', () => {
    const said = ride(detector(hard()), hard(), { toS: 200, rider: zeroFrom(150) })
    expect(of(said, 'distress').map((s) => [s.t, s.data.hard])).toEqual([[153, true]])
    expect(of(said, 'stopped_pedaling')).toEqual([])
  })

  it('stopping in an easy segment is just a stop, and resuming is welcomed back', () => {
    const said = ride(detector(hard()), hard(), { toS: 480, rider: zeroFrom(400, 430) })
    expect(of(said, 'stopped_pedaling').map((s) => [s.t, s.data.elapsedS])).toEqual([[403, 403]])
    expect(of(said, 'resumed').map((s) => [s.t, s.data.pausedS])).toEqual([[430, 30]])
    expect(of(said, 'distress')).toEqual([])
  })

  it('follows the session through auto-pause, and a user pause is never distress', () => {
    const auto = ride(detector(hard()), hard(), {
      toS: 200,
      rider: zeroFrom(150),
      events: [[152.5, { type: 'state', state: 'paused', reason: 'auto' }]],
    })
    expect(times(auto, 'distress')).toEqual([152.5])
    const user = ride(detector(hard()), hard(), {
      toS: 200,
      events: [
        [150, { type: 'state', state: 'paused', reason: 'user' }],
        [170, { type: 'state', state: 'riding' }],
      ],
      rider: (t) => (t >= 150 && t < 170 ? { state: 'paused' } : {}),
    })
    expect(times(user, 'stopped_pedaling')).toEqual([150])
    expect(of(user, 'resumed').map((s) => [s.t, s.data.pausedS])).toEqual([[170, 20]])
    expect(of(user, 'distress')).toEqual([])
  })

  it('stays silent for sleep, sensor loss, short stops and the first seconds of a ride', () => {
    const sleep = ride(detector(hard()), hard(), {
      toS: 200,
      events: [
        [150, { type: 'state', state: 'paused', reason: 'system' }],
        [180, { type: 'state', state: 'riding' }],
      ],
      rider: (t) => (t >= 150 && t < 180 ? { state: 'paused' } : {}),
    })
    const lost = ride(detector(hard()), hard(), { toS: 200, events: [[150, { type: 'state', state: 'paused', reason: 'sensor-lost' }]] })
    for (const said of [sleep, lost]) expect([...of(said, 'stopped_pedaling'), ...of(said, 'resumed'), ...of(said, 'distress')]).toEqual([])
    const early = ride(detector(hard()), hard(), { toS: 40, rider: zeroFrom(10, 20) })
    expect([...of(early, 'stopped_pedaling'), ...of(early, 'resumed')]).toEqual([])
    const blip = ride(detector(hard()), hard(), { toS: 480, rider: zeroFrom(400, 404) })
    expect(of(blip, 'stopped_pedaling')).toHaveLength(1)
    expect(of(blip, 'resumed')).toEqual([])
  })

  it('never treats missing power as a stop', () => {
    const said = ride(detector(hard()), hard(), { toS: 480, rider: (t) => (t >= 400 ? { power: null, power3s: null, cadence: null, cadence3s: null } : {}) })
    expect([...of(said, 'stopped_pedaling'), ...of(said, 'distress')]).toEqual([])
  })

  it('says nothing but distress while stopped', () => {
    const said = ride(detector(hard()), hard(), { toS: 480, rider: zeroFrom(400) })
    expect(said.filter((s) => s.t > 403).map((s) => s.trigger)).toEqual([])
  })
})

describe('intensity changes', () => {
  const steady = () => new Script([{ kind: 'steady', s: 600, w: 200 }])

  it('announces the settled value once, with its direction', () => {
    const down = ride(detector(steady()), steady(), { toS: 60, rider: (t) => ({ intensityPct: t >= 30.5 ? 90 : t >= 30 ? 95 : 100 }) })
    expect(of(down, 'intensity_down').map((s) => [s.t, s.data.intensityPct])).toEqual([[32, 90]])
    const up = ride(detector(steady()), steady(), { toS: 60, rider: (t) => ({ intensityPct: t >= 30 ? 105 : 100 }) })
    expect(of(up, 'intensity_up').map((s) => [s.t, s.data.intensityPct])).toEqual([[31.5, 105]])
    // down and straight back up: nothing to say
    const undo = ride(detector(steady()), steady(), { toS: 60, rider: (t) => ({ intensityPct: t >= 30 && t < 31 ? 95 : 100 }) })
    expect([...of(undo, 'intensity_down'), ...of(undo, 'intensity_up')]).toEqual([])
  })
})

describe('W′bal', () => {
  const vo2 = () => new Script([{ kind: 'on', s: 600, w: 300 }])
  const wbal = (pct: (t: number) => number) => (t: number) => ({ metrics: { wbalJ: pct(t) * 200, np: null, tss: null, kj: null, if: null } })

  it('is low below 25 % and empty at zero, while it is being spent', () => {
    const said = ride(detector(vo2()), vo2(), { toS: 100, rider: wbal((t) => Math.max(-5, 40 - t)) })
    const low = of(said, 'wbal_low')
    expect(low[0]).toMatchObject({ t: 15.25, data: { wbalPct: 24 } })
    for (const s of low) expect(s.data.wbalPct as number).toBeLessThan(25)
    expect(of(said, 'wbal_empty')[0]).toMatchObject({ t: 39, data: { wbalPct: 1 } })
    for (const s of of(said, 'wbal_empty')) expect(s.data.wbalPct as number).toBeLessThanOrEqual(1)
  })

  it('stays quiet while recovering', () => {
    const rest = new Script([{ kind: 'off', s: 600, w: 120 }])
    expect([...of(ride(detector(rest), rest, { toS: 100, rider: wbal(() => 10) }), 'wbal_low')]).toEqual([])
  })
})

describe('PRs', () => {
  it('waits for the effort to stop improving the record; the longest duration wins', () => {
    const script = new Script([{ kind: 'maxeffort', s: 600, w: null }])
    const said = ride(detector(script, { bests: { 5: 850, 60: 400 } }), script, {
      toS: 30,
      events: [
        [10, { type: 'pr', durationS: 5, watts: 900, previous: 850 }],
        [11, { type: 'pr', durationS: 5, watts: 950, previous: 900 }],
        [11, { type: 'pr', durationS: 60, watts: 420, previous: 400 }],
      ],
    })
    expect(of(said, 'pr').map((s) => [s.t, s.data.prLabel, s.data.power])).toEqual([[14, '1-minute', 420]])
  })

  it('needs a real record to beat, and announces each duration once per ride', () => {
    const script = new Script([{ kind: 'steady', s: 3600, w: 200 }])
    // no history: the session reports this ride improving on itself, which is no record
    const fresh = ride(detector(script), script, { toS: 30, events: [[10, { type: 'pr', durationS: 1200, watts: 210, previous: 205 }]] })
    expect(of(fresh, 'pr')).toEqual([])
    const said = ride(detector(script, { bests: { 1200: 240 } }), script, {
      toS: 400,
      events: [
        [10, { type: 'pr', durationS: 1200, watts: 242, previous: 240 }],
        [200, { type: 'pr', durationS: 1200, watts: 250, previous: 242 }],
      ],
    })
    expect(of(said, 'pr').map((s) => [s.t, s.data.prLabel, s.data.power])).toEqual([[13, '20-minute', 242]])
  })

  it('labels durations the way lines read them', () => {
    expect([5, 30, 60, 90, 300, 1200].map(prLabel)).toEqual(['5-second', '30-second', '1-minute', '90-second', '5-minute', '20-minute'])
  })
})

describe('FTP tests', () => {
  it('calls every minute of a 20-minute effort with the projection, instead of interval cues', () => {
    const script = new Script([
      { kind: 'warmup', s: 60, w: 150 },
      { kind: 'steady', s: 1200, w: 263, hard: true, label: '20-min test effort', ftpEffort: true },
      { kind: 'cooldown', s: 60, w: 120 },
    ])
    const det = detector(script, { rideKind: 'ftp-test', ftpTestProtocol: '20min' })
    const said = ride(det, script, { toS: script.total, rider: () => ({ erg: false, power: 250 }) })
    const minutes = of(said, 'ftp_test_minute')
    expect(minutes.map((s) => s.data.minute)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1))
    expect(minutes[0]).toMatchObject({ t: 120, data: { minute: 1, projectedFtp: 238, ftpOld: 250, remainingS: 1140, hard: true } })
    expect(minutes[0]?.ctx.rideKind).toBe('ftp-test')
    expect([...of(said, 'halfway'), ...of(said, 'last_minute'), ...of(said, 'segment_end_success'), ...of(said, 'segment_end_failed')]).toEqual([])
    expect(of(said, 'segment_start').map((s) => [s.data.segmentKind, s.data.hard])).toContainEqual(['steady', true])
    expect(det.ftpResult({ ftpNew: 262, ftpOld: 250 }, 9e6)).toMatchObject([{ trigger: 'ftp_test_result', data: { ftpNew: 262, ftpOld: 250 } }])
  })

  it('treats the ramp test as one effort: one start, then a mark per step', () => {
    const steps: Step[] = [{ kind: 'warmup', s: 60, w: 150 }]
    for (let n = 1; n <= 8; n++) steps.push({ kind: 'ramp', s: 60, w: 125 + 15 * n, hard: true, label: `Ramp step ${n}`, ftpEffort: true })
    steps.push({ kind: 'cooldown', s: 120, w: 100 })
    const script = new Script(steps)
    const det = detector(script, { rideKind: 'ftp-test', ftpTestProtocol: 'ramp' })
    // the rider fails in step 6: the player jumps to the cool-down
    const failAt = 60 + 5 * 60 + 30
    const said = ride(det, script, { toS: 600, pos: (t) => (t < failAt ? t : t + (60 + 8 * 60 - failAt)) })
    expect(of(said, 'segment_start').filter((s) => s.data.hard).map((s) => s.data.segmentLabel)).toEqual(['Ramp step 1'])
    expect(of(said, 'ftp_test_minute').map((s) => [s.t, s.data.minute, s.data.remainingS])).toEqual([1, 2, 3, 4, 5].map((m) => [60 + 60 * m, m, undefined]))
    expect(of(said, 'skipped_interval')).toEqual([])
  })
})

describe('the end of the ride', () => {
  const metrics = { wbalJ: 20_000, np: 240, tss: 70, kj: 780, if: 0.82 }

  it('workout_complete when the plan finishes, with the ride numbers', () => {
    const script = REPS()
    const det = detector(script)
    const said = ride(det, script, { toS: 481, rider: () => ({ metrics }), events: [[481, { type: 'plan-finished' }]] })
    const done = of(said, 'workout_complete')
    expect(done.map((s) => [s.t, s.data])).toEqual([[481, { elapsedS: 481, np: 240, tss: 70, kj: 780, workoutName: 'Test Session' }]])
    expect(done[0]?.ctx.intensityFactor).toBe(0.82)
    expect(det.event({ type: 'state', state: 'finished' }, 490_000)).toEqual([])
  })

  it('ride_bailed when a planned ride ends early, but not seconds in', () => {
    const script = REPS()
    const det = detector(script)
    ride(det, script, { toS: 200 })
    expect(det.event({ type: 'state', state: 'finished' }, 200_000)).toMatchObject([{ trigger: 'ride_bailed', data: { elapsedS: 200, remainingS: 280 } }])
    const quick = detector(REPS())
    ride(quick, REPS(), { toS: 60 })
    expect(quick.event({ type: 'state', state: 'finished' }, 60_000)).toEqual([])
  })

  it('stopping in the cool-down with the work done is finishing, not bailing', () => {
    const script = REPS()
    const det = detector(script)
    ride(det, script, { toS: 440, rider: () => ({ metrics }) })
    expect(det.event({ type: 'state', state: 'finished' }, 440_000)).toMatchObject([{ trigger: 'workout_complete', data: { elapsedS: 440, np: 240, workoutName: 'Test Session' } }])
  })

  it('a free ride of 5 minutes or more counts as complete', () => {
    const det = detector(null)
    ride(det, null, { toS: 400 })
    expect(det.event({ type: 'state', state: 'finished' }, 400_000)).toMatchObject([{ trigger: 'workout_complete', data: { elapsedS: 400 } }])
    const short = detector(null)
    ride(short, null, { toS: 200 })
    expect(short.event({ type: 'state', state: 'finished' }, 200_000)).toEqual([])
  })

  it('ignores ticks after the finish', () => {
    const det = detector(REPS())
    ride(det, REPS(), { toS: 100 })
    det.event({ type: 'state', state: 'finished' }, 100_000)
    expect(ride(det, REPS(), { fromS: 101, toS: 300 })).toEqual([])
  })
})

describe('fueling and hydration', () => {
  const long = () => new Script([{ kind: 'steady', s: 5400, w: 180 }])
  const fueling = { enabled: true, carbsPerHourG: 60, drinkEveryMin: 15 }

  it('reminds to drink and eat on the schedule from the prefs', () => {
    const said = ride(detector(long(), { fueling }), long(), { toS: 3000 })
    // 60 g/h in 20-g portions: every 20 minutes
    expect(times(said, 'fueling_reminder')).toEqual([1200, 2400])
    // drinks every 15 minutes of riding since the last one
    expect(times(said, 'hydration_reminder')).toEqual([900, 1800, 2700])
    expect(of(said, 'fueling_reminder')[0]?.data).toEqual({ elapsedS: 1200 })
  })

  it('offers a reminder again until it is said', () => {
    const said = ride(detector(long(), { fueling }), long(), { toS: 940, speak: (c) => c.trigger !== 'hydration_reminder' || c.now >= 920_000 })
    expect(times(said, 'hydration_reminder')).toEqual([900, 910, 920])
  })

  it('fuels only on long rides, holds reminders during hard efforts and near the end', () => {
    const short = new Script([{ kind: 'steady', s: 3000, w: 180 }])
    const s1 = ride(detector(short, { fueling }), short, { toS: 3000 })
    expect(of(s1, 'fueling_reminder')).toEqual([])
    // hydration at 15, 30 and 45 minutes, but not in the last 5 minutes
    expect(times(s1, 'hydration_reminder')).toEqual([900, 1800, 2700])
    const hard = new Script([
      { kind: 'steady', s: 890, w: 180 },
      { kind: 'on', s: 60, w: 300 },
      { kind: 'steady', s: 3000, w: 180 },
    ])
    expect(times(ride(detector(hard, { fueling }), hard, { toS: 1000 }), 'hydration_reminder')).toEqual([950])
    // due 10 s before an interval: it waits for the recovery rather than run into the countdown
    const runUp = new Script([
      { kind: 'steady', s: 910, w: 180 },
      { kind: 'on', s: 60, w: 300 },
      { kind: 'steady', s: 3000, w: 180 },
    ])
    expect(times(ride(detector(runUp, { fueling }), runUp, { toS: 1000 }), 'hydration_reminder')).toEqual([970])
    const open = ride(detector(null, { fueling }), null, { toS: 2800 })
    expect(times(open, 'fueling_reminder')).toEqual([2700])
    expect(of(ride(detector(long(), { fueling: { ...fueling, enabled: false } }), long(), { toS: 3000 }), 'hydration_reminder')).toEqual([])
  })

  it('applies new prefs mid-ride', () => {
    const det = detector(long(), { fueling })
    ride(det, long(), { toS: 100 })
    det.setFueling({ ...fueling, drinkEveryMin: 5 })
    expect(times(ride(det, long(), { fromS: 100.25, toS: 700 }), 'hydration_reminder')).toEqual([300, 600])
  })
})

describe('idle_banter', () => {
  it('is offered every few seconds in easy riding once the ride is under way', () => {
    const script = new Script([{ kind: 'steady', s: 600, w: 180 }])
    const said = ride(detector(script), script, { toS: 90 })
    expect(times(said, 'idle_banter')).toEqual([60, 65, 70, 75, 80, 85, 90])
    expect(of(said, 'idle_banter')[0]?.data).toMatchObject({ elapsedS: 60, power: 180, cadence: 90, segmentKind: 'steady', hard: false })
  })

  it('is never offered in hard efforts, just after a start, or in the run-up to a countdown', () => {
    const script = REPS()
    const said = ride(detector(script), script, { toS: 480 })
    for (const t of times(said, 'idle_banter').filter((t) => t < script.total)) {
      const plan = script.plan(t)
      const seg = script.segment(plan.segmentIndex!)!
      expect(seg.hard, `banter at ${t}`).toBe(false)
      expect(plan.segmentElapsedS!, `banter at ${t}`).toBeGreaterThanOrEqual(DETECTOR_RULES.banterQuietAfterStartS)
      const next = script.segment(plan.segmentIndex! + 1)
      if (next?.hard) expect(plan.segmentRemainingS!, `banter at ${t}`).toBeGreaterThan(30)
    }
    expect(times(said, 'idle_banter').length).toBeGreaterThan(0)
  })
})

describe('rounding never contradicts a trigger', () => {
  it('decides on the numbers it sends', () => {
    const steady = () => new Script([{ kind: 'steady', s: 600, w: 200 }])
    // 190.2 W is under 95 % of 200 only before rounding; 189.6 W is under either way and is sent as 189
    expect(of(ride(detector(steady()), steady(), { toS: 60, rider: () => ({ power: 190.2 }) }), 'under_target')).toEqual([])
    expect(of(ride(detector(steady()), steady(), { toS: 60, rider: () => ({ power: 189.6 }) }), 'under_target')[0]?.data).toMatchObject({ power: 189, targetW: 200 })
    // an HR of 153.3 against a cap of 153 would read "153, above your cap of 153"
    const long = () => new Script([{ kind: 'steady', s: 1200, w: 170 }])
    expect(of(ride(detector(long(), { lthr: 170 }), long(), { toS: 200, rider: () => ({ hr: 153.3 }) }), 'hr_high')).toEqual([])
    expect(of(ride(detector(long(), { lthr: 170 }), long(), { toS: 200, rider: () => ({ hr: 153.6 }) }), 'hr_high')[0]?.data).toMatchObject({ hr: 154, hrCap: 153 })
    // 89.96 % is reported as 90 %: that is a success, not "failed at 90 %"
    const rep = () =>
      new Script([
        { kind: 'on', s: 120, w: 300 },
        { kind: 'off', s: 60, w: 125 },
      ])
    const said = ride(detector(rep()), rep(), { toS: 130, rider: () => ({ power: 269.88 }) })
    expect(of(said, 'segment_end_failed')).toEqual([])
    expect(of(said, 'segment_end_success')[0]?.data.pct).toBe(90)
  })
})

describe('every moment carries data that matches its trigger', () => {
  it('uses only the standard data keys, and each trigger means what it says', () => {
    const steps: Step[] = [{ kind: 'warmup', s: 300, w: 150 }]
    for (let r = 1; r <= 4; r++) steps.push({ kind: 'on', s: 240, w: 300, rep: r, reps: 4 }, { kind: 'off', s: 180, w: 125, rep: r, reps: 4 })
    steps.push({ kind: 'steady', s: 900, w: 180 }, { kind: 'cooldown', s: 300, w: 120 })
    const script = new Script(steps)
    // a messy rider: fades on the reps, sags, spikes, stops once
    const rider = (t: number, plan: PlanTick): Partial<DetectorTick> => {
      const target = plan.targetW ?? 150
      const hardNow = (plan.targetW ?? 0) >= 250
      const phase = t % 97
      return {
        power: t > 2000 && t < 2010 ? 0 : hardNow ? target * (t % 240 < 120 ? 1 : 0.85) : target * (phase < 50 ? 1 : 1.02),
        cadence: t > 2000 && t < 2010 ? 0 : phase > 70 ? 76 : 90,
        hr: t % 600 > 590 ? 185 : 140 + (hardNow ? 30 : 0),
        metrics: { wbalJ: 20_000 * (1 - ((t % 480) / 480) * 0.9), np: 230, tss: 50, kj: 600, if: 0.8 },
      }
    }
    const det = detector(script, { lthr: 165, maxHr: 190, fueling: { enabled: true, carbsPerHourG: 60, drinkEveryMin: 15 } })
    const said = ride(det, script, { toS: script.total + 2, rider, events: [[script.total + 1, { type: 'plan-finished' }]] })
    expect(new Set(said.map((s) => s.trigger)).size).toBeGreaterThan(12)
    for (const s of said) {
      for (const k of Object.keys(s.data)) expect(isDataKey(k), `${s.trigger}.${k}`).toBe(true)
      const d = s.data as Record<string, number | string | boolean | undefined>
      const n = (k: string) => d[k] as number
      switch (s.trigger) {
        case 'under_target':
          expect(n('power')).toBeLessThan(n('targetW') * 0.95)
          expect(d.erg).toBe(true)
          break
        case 'over_target_early':
          expect(n('power')).toBeGreaterThan(n('targetW') * 1.1)
          break
        case 'halfway':
        case 'last_minute':
        case 'countdown_10s':
          expect(d.hard, `${s.trigger}@${s.t}`).toBe(true)
          break
        case 'segment_end_failed':
          expect(n('pct')).toBeLessThan(90)
          break
        case 'segment_end_success':
          if (d.pct !== undefined) expect(n('pct')).toBeGreaterThanOrEqual(90)
          break
        case 'cadence_sag':
          expect(n('cadenceAvg') - n('cadence')).toBeGreaterThanOrEqual(10)
          break
        case 'hr_high':
          expect(n('hr')).toBeGreaterThan(n('hrCap'))
          break
        case 'wbal_low':
          expect(n('wbalPct')).toBeLessThan(25)
          break
        default:
          break
      }
    }
  })
})

describe('journey milestones', () => {
  it('passes a milestone on to the coach once, with the place and the distances', () => {
    const det = detector(null)
    const milestone = { name: 'Lyon', kind: 'place' as const, atM: 465_000, journeyName: 'Paris → Rome', kmDone: 465, kmLeft: 956 }
    const said = ride(det, null, { toS: 20, rider: (t) => (Math.abs(t - 10) < 1e-9 ? { plan: { ...IDLE_TICK, milestone } } : {}) })
    const hit = of(said, 'journey_milestone')
    expect(hit).toHaveLength(1)
    expect(hit[0]!.data).toEqual({ place: 'Lyon', milestoneKind: 'place', journeyName: 'Paris → Rome', kmDone: 465, kmLeft: 956 })
  })
})
