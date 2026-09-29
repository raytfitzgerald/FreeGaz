// A fake 60-minute workout with a trigger every 2 s: the engine must never spam,
// and interval cues must still get through.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CoachEngine, ENGINE_TIMING } from './engine'
import { PACKS } from './packs'
import { mulberry32 } from './rng'
import { COACH_TRIGGERS, PRIORITY, SEGMENT_KINDS, type CoachData, type CoachLine, type CoachTrigger, type PersonaPack, type SegmentKind } from './types'

interface Segment {
  kind: SegmentKind
  start: number // s
  end: number // s
  targetW: number
  rep?: number
}

const SEGMENTS: Segment[] = [
  { kind: 'warmup', start: 0, end: 600, targetW: 150 },
  ...[0, 1, 2, 3, 4].flatMap((i): Segment[] => {
    const start = 600 + i * 480
    return [
      { kind: 'on', start, end: start + 300, targetW: 300, rep: i + 1 },
      { kind: 'off', start: start + 300, end: start + 480, targetW: 150, rep: i + 1 },
    ]
  }),
  { kind: 'cooldown', start: 3000, end: 3600, targetW: 120 },
]
const HARD = SEGMENTS.filter((s) => s.kind === 'on')
const RIDE_S = 3600

/** Everything else, fired whenever nothing is scheduled: far more often than any real ride would. */
const NOISE: CoachTrigger[] = [
  'idle_banter',
  'under_target',
  'cadence_sag',
  'idle_banter',
  'hr_high',
  'wbal_low',
  'idle_banter',
  'fueling_reminder',
  'hydration_reminder',
  'idle_banter',
  'over_target_early',
  'hr_spike_no_power',
  'idle_banter',
  'intensity_down',
  'stopped_pedaling',
  'resumed',
]

function scheduled(t: number): CoachTrigger | undefined {
  if (t === 0) return 'ride_start'
  if (t === RIDE_S) return 'workout_complete'
  if (t === 2) return 'segment_start' // warmup, right after ride_start
  for (const s of HARD) {
    if (t === s.start - 10) return 'countdown_10s'
    if (t === s.start) return 'segment_start'
    if (t === s.start + 150) return 'halfway'
    if (t === s.start + 240) return 'last_minute'
    if (t === s.end) return s.rep === 2 ? 'segment_end_failed' : 'segment_end_success'
    if (t === s.end + 2) return 'segment_start' // the recovery
  }
  if (t === 3000) return 'segment_start' // cooldown
  return undefined
}

function segmentAt(t: number): Segment {
  // the recovery starts 2 s late (its segment_start fires after segment_end)
  return SEGMENTS.find((s) => t >= s.start && t < s.end) ?? SEGMENTS[SEGMENTS.length - 1]!
}

function dataAt(t: number, trigger: CoachTrigger): CoachData {
  const upcoming = trigger === 'countdown_10s' ? HARD.find((s) => s.start === t + 10) : undefined
  const seg = upcoming ?? (trigger === 'segment_end_success' || trigger === 'segment_end_failed' ? segmentAt(t - 1) : segmentAt(t))
  return {
    segmentKind: seg.kind,
    targetW: seg.targetW,
    remainingS: trigger === 'countdown_10s' ? 10 : seg.end - t,
    durationS: seg.end - seg.start,
    rep: seg.rep,
    reps: seg.rep !== undefined ? 5 : undefined,
    segmentLabel: seg.rep !== undefined ? `Interval ${seg.rep}` : undefined,
    // consistent with each trigger's definition, as a real detector would be
    power:
      trigger === 'over_target_early'
        ? seg.targetW + 40
        : trigger === 'under_target'
          ? seg.targetW - 25
          : trigger === 'hr_spike_no_power'
            ? 40
            : seg.targetW - 4,
    avgW: seg.targetW - (trigger === 'segment_end_failed' ? 40 : 1),
    pct: trigger === 'segment_end_failed' ? 87 : 99,
    cadence: 78,
    cadenceAvg: 92,
    hr: 181,
    hrCap: 172,
    wbalPct: 20,
    elapsedS: t,
    elapsedMin: Math.floor(t / 60),
    pausedS: 20,
    intensityPct: 95,
    erg: true,
    workoutName: 'Five by Five',
    np: 240,
    tss: 70,
    kj: 780,
  }
}

interface Spoken extends CoachLine {
  t: number // s
  inHard: boolean
}

function ride(persona: PersonaPack, spice: 1 | 5, profanity: boolean, seed: number): Spoken[] {
  const engine = new CoachEngine({ persona, spice, profanity, rng: mulberry32(seed) })
  const spoken: Spoken[] = []
  for (let t = 0; t <= RIDE_S; t += 2) {
    const trigger = scheduled(t) ?? NOISE[(t / 2) % NOISE.length]!
    const line = engine.consider({ now: t * 1000, trigger, data: dataAt(t, trigger), rideKind: 'workout', intensityFactor: 0.82 })
    if (line) spoken.push({ ...line, t, inHard: HARD.some((s) => t > s.start && t < s.end) })
  }
  return spoken
}

const maxInWindow = (times: number[], windowS: number): number => {
  let best = 0
  for (let i = 0, j = 0; j < times.length; j++) {
    while (times[j]! - times[i]! >= windowS) i++
    best = Math.max(best, j - i + 1)
  }
  return best
}

describe('a 60-minute ride with a trigger every 2 s', () => {
  const runs = PACKS.flatMap((p) => [
    [p.meta.id, 5, true, p] as const,
    [p.meta.id, 1, false, p] as const,
  ])

  it.each(runs)('%s at spice %i (profanity %s) never spams and still calls every interval', (_id, spice, profanity, persona) => {
    const spoken = ride(persona, spice, profanity, 99)
    const times = spoken.map((l) => l.t)
    const nonCue = spoken.filter((l) => l.priority <= PRIORITY.coaching)
    const banter = spoken.filter((l) => l.priority === PRIORITY.banter)

    // at most one banter line per minute; coaching outranks banter, but banter still gets a word in
    for (let i = 1; i < banter.length; i++) expect(banter[i]!.t - banter[i - 1]!.t).toBeGreaterThanOrEqual(60)
    expect(banter.length).toBeGreaterThan(0)

    // during hard efforts, non-cue lines are at least a minute apart
    for (let i = 1; i < nonCue.length; i++) {
      if (nonCue[i]!.inHard) expect(nonCue[i]!.t - nonCue[i - 1]!.t).toBeGreaterThanOrEqual(60)
    }
    // anywhere: never more than two non-cue lines, or four lines in all, in any minute
    expect(maxInWindow(nonCue.map((l) => l.t), 60)).toBeLessThanOrEqual(2)
    expect(maxInWindow(times, 60)).toBeLessThanOrEqual(4)

    // the same coaching trigger never repeats inside its cooldown
    const lastByTrigger = new Map<string, number>()
    for (const l of nonCue) {
      if (l.priority !== PRIORITY.coaching || l.trigger === 'segment_start') continue
      const prev = lastByTrigger.get(l.trigger)
      if (prev !== undefined) expect(l.t - prev).toBeGreaterThanOrEqual(180)
      lastByTrigger.set(l.trigger, l.t)
    }

    // every interval cue got through, on time
    const saidAt = (trigger: CoachTrigger, t: number): boolean => spoken.some((l) => l.trigger === trigger && l.t === t)
    expect(saidAt('ride_start', 0)).toBe(true)
    expect(saidAt('workout_complete', RIDE_S)).toBe(true)
    for (const s of HARD) {
      expect(saidAt('countdown_10s', s.start - 10), `countdown before ${s.start}`).toBe(true)
      expect(saidAt('segment_start', s.start), `start at ${s.start}`).toBe(true)
      expect(saidAt('last_minute', s.start + 240), `last minute of ${s.start}`).toBe(true)
    }
    // all from the chosen persona: its packs cover every trigger, so Professional never has to step in
    expect(spoken.filter((l) => l.personaId !== persona.meta.id).map((l) => `${l.trigger}@${l.t}: ${l.text}`)).toEqual([])
  })
})

describe('a quiet ride', () => {
  it('banters about once a minute when nothing else is happening, never more', () => {
    for (const persona of PACKS) {
      const engine = new CoachEngine({ persona, spice: 3, profanity: false, rng: mulberry32(5) })
      const times: number[] = []
      for (let t = 0; t < RIDE_S; t += 2) {
        const line = engine.consider({ now: t * 1000, trigger: 'idle_banter', data: { elapsedMin: Math.floor(t / 60), power: 180, cadence: 88 }, rideKind: 'free' })
        if (line) times.push(t)
      }
      expect(times.length, persona.meta.id).toBe(60)
      expect(maxInWindow(times, 60)).toBe(1)
    }
  })
})

describe('pacing invariants hold for any stream of moments', () => {
  const event = fc.record({
    dtMs: fc.integer({ min: 0, max: 12_000 }),
    trigger: fc.constantFrom(...COACH_TRIGGERS),
    kind: fc.constantFrom(...SEGMENT_KINDS),
    hard: fc.boolean(),
  })

  it('never breaks the banter cooldown, the coaching gap, the per-trigger cooldowns or the hard-effort limit', () => {
    fc.assert(
      fc.property(fc.array(event, { minLength: 1, maxLength: 300 }), fc.integer(), fc.constantFrom(...PACKS), (events, seed, persona) => {
        const engine = new CoachEngine({ persona, spice: 5, profanity: true, rng: mulberry32(seed) })
        let now = 0
        let lastAny = -Infinity
        let lastNonCue = -Infinity
        const lastKey = new Map<string, number>()
        for (const ev of events) {
          now += ev.dtMs
          const data: CoachData = { segmentKind: ev.kind, hard: ev.hard, targetW: 300, power: 260, remainingS: 200, cadence: 75, cadenceAvg: 90 }
          const line = engine.consider({ now, trigger: ev.trigger, data, rideKind: 'workout' })
          if (!line) continue
          const key = ev.trigger === 'segment_start' ? `${ev.trigger}:${ev.kind}` : ev.trigger
          if (line.priority === PRIORITY.banter) expect(now - lastAny).toBeGreaterThanOrEqual(ENGINE_TIMING.defaultCooldownMs)
          if (line.priority === PRIORITY.coaching) {
            expect(now - lastAny).toBeGreaterThanOrEqual(ENGINE_TIMING.coachingGapMs)
            expect(now - (lastKey.get(key) ?? -Infinity)).toBeGreaterThanOrEqual(ENGINE_TIMING.defaultPerTriggerCooldownMs)
          }
          const endsSegment = ['segment_end_success', 'segment_end_failed', 'skipped_interval', 'ride_start', 'workout_complete', 'ride_bailed'].includes(ev.trigger)
          if (line.priority <= PRIORITY.coaching && ev.hard && !endsSegment) {
            expect(now - lastNonCue).toBeGreaterThanOrEqual(ENGINE_TIMING.hardEffortGapMs)
          }
          if (line.priority === PRIORITY.cue) expect(now - (lastKey.get(key) ?? -Infinity)).toBeGreaterThanOrEqual(30_000)
          lastAny = now
          if (line.priority <= PRIORITY.coaching) lastNonCue = now
          lastKey.set(key, now)
        }
      }),
      { numRuns: 60 },
    )
  })
})
