import { describe, expect, it } from 'vitest'
import { violatesGuardrails } from '../persona/guardrails'
import { BIBI, PROFESSIONAL, ROAST_COMIC } from '../persona/packs'
import { mulberry32 } from '../persona/rng'
import { PRIORITY, type CoachLine, type CoachLineTemplate, type PersonaPack } from '../persona/types'
import { WorkoutPlan } from '../ride/workout-plan'
import type { SessionEvent } from '../ride/session'
import { BUILTIN_WORKOUTS } from '../workout/builtins'
import type { Workout } from '../workout/model'
import { matchesAny, personaBannedPatterns } from './content'
import type { DetectorTick } from './detector'
import { RideCoach } from './ride-coach'
import { workoutSegments } from './segments'

const FTP = 250
const builtin = (id: string): Workout => structuredClone(BUILTIN_WORKOUTS.find((w) => w.id === `builtin:${id}`)!)

interface Heard extends CoachLine {
  t: number
}

function setup(workout: Workout, persona: PersonaPack, opts: { spice?: number; profanity?: boolean; seed?: number } = {}) {
  const plan = new WorkoutPlan(workout, { ftpW: FTP })
  const coach = new RideCoach({
    rideKind: plan.kind,
    ftpW: FTP,
    workoutName: workout.name,
    plannedDurationS: plan.timeline.durationS,
    segments: workoutSegments(plan),
    persona,
    spice: opts.spice ?? 5,
    profanity: opts.profanity ?? false,
    rng: mulberry32(opts.seed ?? 7),
  })
  return { plan, coach }
}

/** Plays the plan at 4 Hz with an ERG-following rider; `rider` can override the sensors. */
function drive(
  { plan, coach }: ReturnType<typeof setup>,
  o: { toS: number; fromS?: number; rider?: (t: number) => Partial<DetectorTick>; events?: [number, SessionEvent][]; before?: (t: number) => void },
): Heard[] {
  const heard: Heard[] = []
  for (let k = Math.round((o.fromS ?? 0) * 4); k <= o.toS * 4; k++) {
    const t = k / 4
    o.before?.(t)
    for (const [at, e] of o.events ?? []) if (at === t) heard.push(...coach.event(e, t * 1000).map((l) => ({ ...l, t })))
    const extra = o.rider?.(t) ?? {}
    const tick = plan.tick({ now: t * 1000, movingS: t, dtS: 0.25, power: extra.power ?? null, cadence: 90, hr: 140, intensityPct: 100 })
    const power = extra.power !== undefined ? extra.power : (tick.targetW ?? 180)
    const input: DetectorTick = {
      now: t * 1000,
      state: 'riding',
      plan: tick,
      targetW: tick.targetW,
      power,
      cadence: 90,
      power3s: power,
      cadence3s: 90,
      hr: 140,
      erg: tick.desired?.mode === 'erg',
      intensityPct: 100,
      movingS: t,
      metrics: { wbalJ: 20_000, np: 230, tss: 40, kj: 500, if: 0.8 },
      ...extra,
    }
    heard.push(...coach.tick(input).map((l) => ({ ...l, t })))
  }
  return heard
}

describe('RideCoach', () => {
  it('coaches a VO2 session: every rep start, halfway and last minute, all clean', () => {
    const s = setup(builtin('vo2max-5x4'), PROFESSIONAL)
    const heard = drive(s, { toS: s.plan.timeline.durationS })
    const reps = s.plan.timeline.steps.filter((x) => x.kind === 'on')
    expect(heard[0]).toMatchObject({ t: 0, trigger: 'ride_start', personaId: 'professional' })
    for (const r of reps) {
      expect(heard.some((l) => l.trigger === 'segment_start' && l.t === r.startS), `start ${r.startS}`).toBe(true)
      expect(heard.some((l) => l.trigger === 'countdown_10s' && l.t === r.startS - 10), `countdown ${r.startS}`).toBe(true)
      expect(heard.some((l) => l.trigger === 'halfway' && l.t >= r.startS + 120 && l.t <= r.startS + 130), `halfway ${r.startS}`).toBe(true)
      expect(heard.some((l) => l.trigger === 'last_minute' && l.t === r.startS + 180), `last minute ${r.startS}`).toBe(true)
    }
    for (const l of heard) expect(violatesGuardrails(l.text), l.text).toBeNull()
  })

  it('goes supportive after a sudden stop in a hard rep, and stops pushing', () => {
    const s = setup(builtin('vo2max-5x4'), ROAST_COMIC)
    const rep = s.plan.timeline.steps.find((x) => x.kind === 'on' && x.repIndex === 1)!
    const stopAt = rep.startS + 60
    const heard = drive(s, {
      toS: rep.startS + 400,
      // stops dead for 20 s, then limps on well under target
      rider: (t) => (t >= stopAt && t < stopAt + 20 ? { power: 0, cadence: 0, power3s: 0, cadence3s: 0 } : t >= stopAt + 20 ? { power: 150, power3s: 150 } : {}),
    })
    const distress = heard.filter((l) => l.trigger === 'distress')
    expect(distress).toHaveLength(1)
    expect(distress[0]).toMatchObject({ t: stopAt + 3, priority: PRIORITY.safety, personaId: 'professional' })
    expect(s.coach.isSupportive((stopAt + 60) * 1000)).toBe(true)
    const after = heard.filter((l) => l.t > stopAt)
    expect(after.filter((l) => l.trigger === 'under_target' || l.trigger === 'cadence_sag')).toEqual([])
    expect(after.every((l) => l.personaId === 'professional')).toBe(true)
  })

  it('mute silences everything but safety', () => {
    const s = setup(builtin('vo2max-5x4'), ROAST_COMIC)
    drive(s, { toS: 100 })
    s.coach.mute(100_000)
    const muted = drive(s, { fromS: 100.25, toS: 1500 })
    expect(muted).toEqual([])
    s.coach.unmute()
    expect(drive(s, { fromS: 1500.25, toS: 2200 }).length).toBeGreaterThan(0)
  })

  it('never lets the Bibi parody say a banned name from the workout file', () => {
    const w = builtin('vo2max-5x4')
    w.name = 'Battle of the Bulge'
    for (const seg of w.segments) seg.label = 'Attack'
    const bans = personaBannedPatterns('bibi')
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = setup(w, BIBI, { seed })
      const heard = drive(s, { toS: s.plan.timeline.durationS })
      expect(heard[0]?.trigger).toBe('ride_start')
      for (const l of heard) {
        expect(violatesGuardrails(l.text), l.text).toBeNull()
        if (l.personaId === 'bibi') expect(matchesAny(l.text, bans), l.text).toBe(false)
      }
    }
  })

  it('mixes validated AI lines into the persona for the ride, and drops them on a persona change', () => {
    const s = setup(builtin('endurance-60'), ROAST_COMIC, { spice: 3 })
    const ai: CoachLineTemplate[] = [1, 2, 3].map((n) => ({ id: `ai.idle_banter.${n}`, text: `Fresh banter number ${n}.`, triggers: ['idle_banter'], spice: 3, weight: 2 }))
    expect(s.coach.setExtraLines('bibi', ai)).toBe(false)
    expect(s.coach.setExtraLines('roast-comic', ai)).toBe(true)
    expect(s.coach.extraLineCount).toBe(3)
    const heard = drive(s, { toS: 1800 })
    expect(heard.filter((l) => l.lineId.startsWith('ai.')).length).toBeGreaterThan(0)
    s.coach.setPersona(BIBI)
    expect(s.coach.extraLineCount).toBe(0)
    expect(drive(s, { fromS: 1800.25, toS: 3000 }).filter((l) => l.lineId.startsWith('ai.'))).toEqual([])
  })

  it('applies spice and profanity changes live', () => {
    const s = setup(builtin('endurance-60'), ROAST_COMIC, { spice: 1 })
    const gentle = drive(s, { toS: 900 })
    expect(gentle.length).toBeGreaterThan(0)
    const lineSpice = new Map(ROAST_COMIC.lines.map((l) => [l.id, l.spice]))
    expect(gentle.every((l) => (lineSpice.get(l.lineId) ?? 1) <= 1)).toBe(true)
    s.coach.setSpice(5)
    s.coach.setProfanity(true)
    const spicy = drive(s, { fromS: 900.25, toS: 3000 })
    expect(spicy.some((l) => (lineSpice.get(l.lineId) ?? 1) > 1)).toBe(true)
  })

  it('announces the FTP-test result after the ride', () => {
    const s = setup(builtin('endurance-60'), PROFESSIONAL)
    const [line] = s.coach.ftpResult({ ftpNew: 262, ftpOld: 250 }, 5_000_000)
    expect(line).toMatchObject({ trigger: 'ftp_test_result', priority: PRIORITY.cue })
    expect(line?.text).toMatch(/262/)
  })
})
