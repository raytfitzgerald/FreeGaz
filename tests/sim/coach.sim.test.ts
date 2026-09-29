// The live coach on the simulated KICKR: a real built-in workout through the
// real drivers, controller, RideSession and WorkoutPlan, with the trigger
// detector feeding the persona engine (fixed seed) exactly as the app does.
import { describe, expect, it } from 'vitest'
import { RideCoach, RideProbe, workoutSegments } from '@core/coach'
import {
  BIBI,
  BIBI_BANNED_PATTERNS,
  DEFAULT_TRIGGER_COOLDOWNS_MS,
  ENGINE_TIMING,
  PRIORITY,
  ROAST_COMIC,
  THE_OVERLORD,
  detectProfanity,
  mulberry32,
  normalizeForMatching,
  violatesGuardrails,
  type CoachLine,
  type PersonaPack,
} from '@core/persona'
import { RideSession, type JournalSink } from '@core/ride/session'
import { WorkoutPlan } from '@core/ride/workout-plan'
import type { RiderBehavior } from '@core/sim/world'
import { BUILTIN_WORKOUTS } from '@core/workout/builtins'
import type { AthleteSnapshot } from '@core/ride/types'
import { simRig } from './rig'

const journal: JournalSink = { begin: async () => undefined, append: async (_id, seq) => seq, close: async () => undefined }
const FTP = 250
const VO2 = BUILTIN_WORKOUTS.find((w) => w.id === 'builtin:vo2max-5x4')!

interface Heard extends CoachLine {
  /** Seconds since the ride started. */
  t: number
}

interface RideOpts {
  persona: PersonaPack
  spice?: number
  profanity?: boolean
  seed?: number
  athlete?: Partial<AthleteSnapshot>
  /** Bests before the ride, as the app loads them for PR detection. */
  bests?: Partial<Record<number, number>>
  /** Rider behaviour changes at ride seconds. */
  script?: [number, RiderBehavior][]
  /** Finish the ride this many seconds in (default: the whole workout plus a short spin). */
  untilS?: number
}

async function coachedRide(o: RideOpts) {
  const rig = simRig({ ftpW: FTP })
  await rig.connect('trainer')
  await rig.connect('hr')
  const plan = new WorkoutPlan(VO2, { ftpW: FTP })
  const athlete: AthleteSnapshot = { ftpW: FTP, weightKg: 75, ...o.athlete }
  const session = new RideSession(
    { clock: rig.clock, hub: rig.hub, controller: rig.controller, journal, setPaused: (p) => rig.engine.setPaused(p) },
    { rideId: 'sim-coach', name: VO2.name, kind: plan.kind, simulated: true, athlete, autoPause: true, plan, bests: o.bests },
  )
  const coach = new RideCoach({
    rideKind: plan.kind,
    ftpW: FTP,
    lthr: athlete.lthr,
    maxHr: athlete.maxHr,
    workoutName: VO2.name,
    plannedDurationS: plan.timeline.durationS,
    segments: workoutSegments(plan),
    fueling: { enabled: true, carbsPerHourG: 60, drinkEveryMin: 15 },
    bests: session.options.bests,
    persona: o.persona,
    spice: o.spice ?? 5,
    profanity: o.profanity ?? false,
    rng: mulberry32(o.seed ?? 11),
  })
  const probe = new RideProbe(session, rig.hub, rig.controller)
  const heard: Heard[] = []
  let startAt = 0
  const hear = (lines: CoachLine[]) => {
    for (const l of lines) heard.push({ ...l, t: (rig.clock.now() - startAt) / 1000 })
  }
  session.on((e) => hear(coach.event(e, rig.clock.now())))
  rig.engine.onTick((now) => session.tick(now))
  rig.engine.onTick((now) => hear(coach.tick(probe.read(now))))
  startAt = rig.clock.now()
  session.start()

  const endS = o.untilS ?? plan.timeline.durationS + 20
  let at = 0
  for (const [s, behavior] of [...(o.script ?? [])].sort((a, b) => a[0] - b[0])) {
    await rig.advance((s - at) * 1000, 250)
    rig.world.setBehavior(behavior)
    at = s
  }
  await rig.advance((endS - at) * 1000, 250)
  await rig.until(session.finish())
  rig.engine.stop()
  rig.devices.disconnectAll()
  rig.world.stop()
  const reps = plan.timeline.steps.filter((s) => s.kind === 'on')
  return { heard, coach, plan, reps, startAt }
}

const maxInWindow = (times: number[], windowS: number): number => {
  let best = 0
  for (let i = 0, j = 0; j < times.length; j++) {
    while (times[j]! - times[i]! >= windowS) i++
    best = Math.max(best, j - i + 1)
  }
  return best
}

const cueCooldownS = (trigger: string): number => (DEFAULT_TRIGGER_COOLDOWNS_MS[trigger as keyof typeof DEFAULT_TRIGGER_COOLDOWNS_MS] ?? ENGINE_TIMING.defaultPerTriggerCooldownMs) / 1000

describe('the coach on a simulated VO2 Max 5×4', () => {
  it('calls every rep: countdown, start, halfway and last minute, from the chosen persona', async () => {
    // a 5-s best the openers will beat, so a PR shows up among the cues
    const { heard, reps } = await coachedRide({ persona: ROAST_COMIC, profanity: true, bests: { 5: 200, 60: 1000, 300: 1000, 1200: 1000 } })
    expect(reps).toHaveLength(5)
    const near = (trigger: string, from: number, to: number) => heard.some((l) => l.trigger === trigger && l.t >= from && l.t <= to)
    expect(heard[0]?.trigger).toBe('ride_start')
    expect(heard[0]!.t).toBeLessThan(0.5)
    for (const r of reps) {
      expect(near('countdown_10s', r.startS - 10.5, r.startS - 6), `countdown before ${r.startS}`).toBe(true)
      expect(near('segment_start', r.startS - 0.5, r.startS + 1), `start at ${r.startS}`).toBe(true)
      expect(near('halfway', r.startS + 119.5, r.startS + 131), `halfway of ${r.startS}`).toBe(true)
      expect(near('last_minute', r.startS + 179.5, r.startS + 191), `last minute of ${r.startS}`).toBe(true)
    }
    expect(heard.filter((l) => l.trigger === 'workout_complete')).toHaveLength(1)
    // only the 5-s best was beatable, and a record is announced once
    expect(heard.filter((l) => l.trigger === 'pr')).toHaveLength(1)
    // reminders ride along in the recoveries
    expect(heard.some((l) => l.trigger === 'hydration_reminder')).toBe(true)
    expect(heard.some((l) => l.trigger === 'fueling_reminder')).toBe(true)
    // the persona covers everything; the Professional fallback never had to step in
    expect(heard.filter((l) => l.personaId !== 'roast-comic').map((l) => `${l.trigger}@${l.t}`)).toEqual([])
  }, 60_000)

  it('respects the engine cooldowns and never banters into a countdown', async () => {
    const { heard, reps } = await coachedRide({ persona: THE_OVERLORD, seed: 5 })
    const inHard = (t: number) => reps.some((r) => t > r.startS && t < r.endS)
    const lastByTrigger = new Map<string, number>()
    let lastAny = -Infinity
    let lastNonCue = -Infinity
    for (const l of heard) {
      const gap = l.t - lastAny
      if (l.priority === PRIORITY.banter) expect(gap, `banter at ${l.t}`).toBeGreaterThanOrEqual(ENGINE_TIMING.defaultCooldownMs / 1000 - 0.01)
      if (l.priority === PRIORITY.coaching) expect(gap, `${l.trigger} at ${l.t}`).toBeGreaterThanOrEqual(ENGINE_TIMING.coachingGapMs / 1000 - 0.01)
      if (l.priority <= PRIORITY.coaching && inHard(l.t)) expect(l.t - lastNonCue, `${l.trigger} at ${l.t}`).toBeGreaterThanOrEqual(ENGINE_TIMING.hardEffortGapMs / 1000 - 0.01)
      const key = l.trigger === 'segment_start' ? `segment_start:${l.priority}` : l.trigger
      const prev = lastByTrigger.get(key)
      // banter has no per-trigger cooldown: the global one paces it
      if (prev !== undefined && l.trigger !== 'segment_start' && l.priority !== PRIORITY.banter) {
        const need = l.priority === PRIORITY.cue ? cueCooldownS(l.trigger) : ENGINE_TIMING.defaultPerTriggerCooldownMs / 1000
        expect(l.t - prev, `${l.trigger} at ${l.t}`).toBeGreaterThanOrEqual(need - 0.01)
      }
      lastByTrigger.set(key, l.t)
      lastAny = l.t
      if (l.priority <= PRIORITY.coaching) lastNonCue = l.t
    }
    expect(maxInWindow(heard.map((l) => l.t), 60)).toBeLessThanOrEqual(4)
    // banter happens, but never in a hard rep or in the 10 s countdown before one
    const banter = heard.filter((l) => l.trigger === 'idle_banter')
    expect(banter.length).toBeGreaterThan(5)
    for (const b of banter) {
      expect(inHard(b.t), `banter in a rep at ${b.t}`).toBe(false)
      for (const r of reps) expect(b.t > r.startS - 10.5 && b.t <= r.startS, `banter in the countdown to ${r.startS}`).toBe(false)
    }
  }, 60_000)

  it('never says anything off-limits, whatever the persona and spice', async () => {
    for (const [persona, profanity] of [
      [ROAST_COMIC, true],
      [BIBI, true],
      [ROAST_COMIC, false],
    ] as const) {
      const { heard } = await coachedRide({ persona, profanity, seed: 3 })
      expect(heard.length).toBeGreaterThan(40)
      for (const l of heard) {
        expect(violatesGuardrails(l.text), l.text).toBeNull()
        expect(violatesGuardrails(l.speech), l.speech).toBeNull()
        const level = detectProfanity(l.text)
        expect(level === 'strong' || (level === 'mild' && !profanity), l.text).toBe(false)
        if (persona === BIBI && l.personaId === 'bibi') {
          expect(BIBI_BANNED_PATTERNS.filter((p) => p.test(l.text) || p.test(normalizeForMatching(l.text))).map(String), l.text).toEqual([])
        }
      }
    }
  }, 120_000)
})

describe('distress on the simulator', () => {
  it('a sudden stop in a hard rep switches to the supportive tone', async () => {
    const plan = new WorkoutPlan(VO2, { ftpW: FTP })
    const rep2 = plan.timeline.steps.filter((s) => s.kind === 'on')[1]!
    const stopAt = rep2.startS + 90
    const { heard, coach, startAt } = await coachedRide({
      persona: ROAST_COMIC,
      script: [
        [stopAt, { kind: 'coast' }],
        [stopAt + 40, { kind: 'auto' }],
      ],
      untilS: stopAt + 480,
    })
    const distress = heard.filter((l) => l.trigger === 'distress')
    expect(distress).toHaveLength(1)
    const d = distress[0]!
    expect(d.priority).toBe(PRIORITY.safety)
    expect(d.personaId).toBe('professional')
    expect(d.t).toBeGreaterThan(stopAt)
    expect(d.t).toBeLessThan(stopAt + 6)
    // no roast about stopping, and the next five minutes stay calm and professional
    expect(heard.filter((l) => l.trigger === 'stopped_pedaling')).toEqual([])
    const window = heard.filter((l) => l.t > d.t && l.t < d.t + ENGINE_TIMING.distressSupportMs / 1000)
    expect(window.length).toBeGreaterThan(0)
    expect(window.filter((l) => l.personaId !== 'professional').map((l) => `${l.trigger}: ${l.text}`)).toEqual([])
    expect(window.filter((l) => l.trigger === 'under_target' || l.trigger === 'cadence_sag')).toEqual([])
    expect(coach.isSupportive(startAt + (d.t + 60) * 1000)).toBe(true)
    // and the ride that ended early is called as such
    expect(heard.at(-1)?.trigger).toBe('ride_bailed')
  }, 60_000)

  it('heart rate above the rider’s max is distress too', async () => {
    // the simulated rider's heart reaches ~185 bpm in the VO2 reps; this profile says 170 is max
    const { heard } = await coachedRide({ persona: BIBI, athlete: { maxHr: 170, lthr: 155 }, untilS: 1500 })
    const distress = heard.filter((l) => l.trigger === 'distress')
    expect(distress.length).toBeGreaterThan(0)
    expect(distress[0]!.personaId).toBe('professional')
    const after = heard.filter((l) => l.t > distress[0]!.t && l.t < distress[0]!.t + 300)
    expect(after.every((l) => l.personaId === 'professional')).toBe(true)
  }, 60_000)
})
