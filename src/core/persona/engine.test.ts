import { describe, expect, it } from 'vitest'
import { CoachEngine, DISTRESS_FALLBACK, ENGINE_TIMING, priorityOf, spiceAffinity, weightedPick, type CoachEngineOptions } from './engine'
import { detectProfanity, violatesGuardrails } from './guardrails'
import { DRILL_SERGEANT, PACKS, PROFESSIONAL, ROAST_COMIC } from './packs'
import { mulberry32 } from './rng'
import { sampleContext } from './samples'
import { buildFacts } from './template'
import {
  COACH_TRIGGERS,
  PRIORITY,
  type CoachContext,
  type CoachData,
  type CoachLine,
  type CoachLineTemplate,
  type CoachTrigger,
  type PersonaPack,
  type RideKind,
  type Spice,
} from './types'

const S = 1000
const MIN = 60 * S

const pack = (lines: CoachLineTemplate[], id = 'test-pack'): PersonaPack => ({ meta: { id, name: 'Test', tagline: '' }, lines })
const line = (id: string, text: string, triggers: CoachTrigger[], spice: Spice = 1, extra: Partial<CoachLineTemplate> = {}): CoachLineTemplate => ({
  id,
  text,
  triggers,
  spice,
  ...extra,
})
const engine = (persona: PersonaPack, opts: Partial<CoachEngineOptions> = {}): CoachEngine =>
  new CoachEngine({ persona, spice: 5, profanity: false, rng: mulberry32(42), ...opts })
const at = (now: number, trigger: CoachTrigger, data: CoachData = {}, rideKind: RideKind = 'workout'): CoachContext => ({
  now,
  trigger,
  data,
  rideKind,
})
/** A non-hard moment, so the hard-effort limit stays out of the way. */
const EASY = { segmentKind: 'steady', targetW: 200, power: 150, cadence: 70, cadenceAvg: 90, hr: 180, hrCap: 170 } as const

describe('line selection', () => {
  const ladder = pack([
    line('generic', 'Generic.', ['idle_banter']),
    line('one', 'One criterion.', ['idle_banter'], 1, { criteria: [{ key: 'pct', op: '>=', value: 90 }] }),
    line('two', 'Two criteria.', ['idle_banter'], 1, {
      criteria: [
        { key: 'pct', op: '>=', value: 90 },
        { key: 'cadence', op: '>', value: 80 },
      ],
    }),
    line('never', 'Never.', ['idle_banter'], 1, { criteria: [{ key: 'pct', op: '<', value: 50 }] }),
  ])

  it('picks the most specific line, then walks down as memory excludes used ones', () => {
    const e = engine(ladder)
    const data = { power: 300, targetW: 300, cadence: 90 }
    const ids = [0, 1, 2, 3].map((i) => e.consider(at(i * MIN, 'idle_banter', data))?.lineId)
    // all three used recently: repeat the one said longest ago
    expect(ids).toEqual(['two', 'one', 'generic', 'two'])
  })

  it('fails criteria on missing facts, even for !=', () => {
    const e = engine(pack([line('ne', 'Not ninety.', ['idle_banter'], 1, { criteria: [{ key: 'cadence', op: '!=', value: 90 }] }), line('plain', 'Plain.', ['idle_banter'])]))
    expect(e.consider(at(0, 'idle_banter', {}))?.lineId).toBe('plain')
    expect(e.consider(at(MIN, 'idle_banter', { cadence: 80 }))?.lineId).toBe('ne')
  })

  it('skips lines whose placeholders the moment cannot fill', () => {
    const e = engine(pack([line('both', '{power} at {cadence} rpm.', ['idle_banter']), line('plain', 'Plain.', ['idle_banter'])]))
    expect(e.consider(at(0, 'idle_banter', { power: 200 }))?.lineId).toBe('plain')
    const only = engine(pack([line('both', '{power} at {cadence} rpm.', ['idle_banter'])]))
    expect(only.consider(at(0, 'idle_banter', { power: 200 }))).toBeNull()
  })

  it('fills placeholders with the rounding rules: integer watts, m:ss from 60 s', () => {
    const e = engine(pack([line('seg', '{targetW} watts for {remainingS}.', ['segment_start'], 1, { criteria: [{ key: 'hard', op: '==', value: true }] })]))
    const a = e.consider(at(0, 'segment_start', { segmentKind: 'on', targetW: 287.6, remainingS: 125 }))
    expect(a?.text).toBe('288 watts for 2:05.')
    expect(a?.speech).toBe('288 watts for 2 minutes 5 seconds.')
    const b = e.consider(at(MIN, 'segment_start', { segmentKind: 'on', targetW: 300, remainingS: 45 }))
    expect(b?.text).toBe('300 watts for 45 seconds.')
  })

  it('breaks ties by weight', () => {
    const e = engine(pack([line('heavy', 'Heavy.', ['idle_banter'], 1, { weight: 9 }), line('light', 'Light.', ['idle_banter'])]), { memorySize: 0 })
    let heavy = 0
    for (let i = 0; i < 1000; i++) if (e.consider(at(i * MIN, 'idle_banter'))?.lineId === 'heavy') heavy++
    expect(heavy).toBeGreaterThan(850)
    expect(heavy).toBeLessThan(950)
  })

  it('never repeats a line within the last 40 while alternatives exist', () => {
    const fifty = pack(Array.from({ length: 50 }, (_, i) => line(`l${i}`, `Line ${i}.`, ['idle_banter'])))
    const e = engine(fifty)
    const ids = Array.from({ length: 200 }, (_, i) => e.consider(at(i * MIN, 'idle_banter'))?.lineId)
    for (let i = 0; i + 41 <= ids.length; i++) expect(new Set(ids.slice(i, i + 41)).size).toBe(41)
  })

  it('cycles in least-recently-used order when the pool is smaller than the memory', () => {
    const e = engine(pack(['a', 'b', 'c'].map((id) => line(id, `${id}.`, ['idle_banter']))))
    const ids = Array.from({ length: 9 }, (_, i) => e.consider(at(i * MIN, 'idle_banter'))?.lineId)
    expect(ids.slice(3)).toEqual([...ids.slice(0, 3), ...ids.slice(0, 3)])
  })
})

describe('spice and profanity', () => {
  const spicy = pack([
    ...([1, 2, 3, 4, 5] as const).flatMap((s) => [line(`s${s}a`, `Spice ${s} a.`, ['idle_banter'], s), line(`s${s}b`, `Spice ${s} b.`, ['idle_banter'], s)]),
    line('swear', 'Pedal, damn it.', ['idle_banter'], 1, { profanity: true }),
  ])
  const picks = (e: CoachEngine, n = 300): CoachLine[] =>
    Array.from({ length: n }, (_, i) => e.consider(at(i * MIN, 'idle_banter'))).filter((l): l is CoachLine => l !== null)

  it('never uses a line above the chosen spice level', () => {
    const lines = picks(engine(spicy, { spice: 2 }))
    expect(lines.every((l) => /^s[12]/.test(l.lineId))).toBe(true)
  })

  it('favours lines written for the chosen level', () => {
    const counts = new Map<string, number>()
    for (const l of picks(engine(spicy, { spice: 5, memorySize: 0 }), 2000)) {
      const level = l.lineId.slice(0, 2)
      counts.set(level, (counts.get(level) ?? 0) + 1)
    }
    expect(counts.get('s5') ?? 0).toBeGreaterThan(counts.get('s1') ?? 0)
    expect(spiceAffinity(5, 5)).toBe(1)
    expect(spiceAffinity(1, 5)).toBe(0.2)
    expect(spiceAffinity(3, 1)).toBe(1)
  })

  it('keeps profane lines out unless profanity is on', () => {
    const e = engine(spicy, { spice: 1, memorySize: 0 })
    expect(picks(e).some((l) => l.lineId === 'swear')).toBe(false)
    e.setProfanity(true)
    expect(picks(e).some((l) => l.lineId === 'swear')).toBe(true)
  })

  it('never swears in any built-in pack with profanity off', () => {
    for (const p of PACKS) {
      const e = new CoachEngine({ persona: p, spice: 5, profanity: false, rng: mulberry32(3), memorySize: 0 })
      for (let i = 0; i < 400; i++) {
        const trigger = COACH_TRIGGERS[i % COACH_TRIGGERS.length]!
        const l = e.consider(sampleContext(trigger, i * 10 * MIN))
        if (l) expect(detectProfanity(l.text), l.text).toBeNull()
      }
    }
  })

  it('checks the rendered text, so labels from workout files cannot smuggle anything in', () => {
    const labelled = pack([
      line('label', 'Next: {segmentLabel}.', ['skipped_interval'], 1, { criteria: [{ key: 'segmentLabel', op: '!=', value: '' }] }),
      line('plain', 'Skipped.', ['skipped_interval']),
    ])
    const say = (label: string, profanity: boolean): string | undefined =>
      engine(labelled, { profanity }).consider(at(0, 'skipped_interval', { segmentLabel: label }))?.lineId
    expect(say('VO2 #3', false)).toBe('label')
    expect(say('Hell Hill', false)).toBe('plain')
    expect(say('Hell Hill', true)).toBe('label')
    expect(say('Pray Hill', false)).toBe('plain')
    expect(say('Pray Hill', true)).toBe('label')
    expect(say('Shit Hill', false)).toBe('plain')
    expect(say('Shit Hill', true)).toBe('label')
  })
})

describe('pacing', () => {
  it('makes banter wait out the global cooldown', () => {
    const e = engine(ROAST_COMIC)
    expect(e.consider(sampleContext('idle_banter', 0))).not.toBeNull()
    expect(e.consider(sampleContext('idle_banter', 30 * S))).toBeNull()
    expect(e.consider(sampleContext('idle_banter', 59_999))).toBeNull()
    expect(e.consider(sampleContext('idle_banter', MIN))).not.toBeNull()
  })

  it('clamps the global cooldown to 45–90 s', () => {
    const short = engine(ROAST_COMIC, { cooldownMs: 10 * S })
    short.consider(sampleContext('idle_banter', 0))
    expect(short.consider(sampleContext('idle_banter', 44 * S))).toBeNull()
    expect(short.consider(sampleContext('idle_banter', 45 * S))).not.toBeNull()
    const long = engine(ROAST_COMIC, { cooldownMs: 10 * MIN })
    long.consider(sampleContext('idle_banter', 0))
    expect(long.consider(sampleContext('idle_banter', 89 * S))).toBeNull()
    expect(long.consider(sampleContext('idle_banter', 90 * S))).not.toBeNull()
  })

  it('lets coaching skip the global cooldown, but keeps a 30 s gap and a 180 s per-trigger cooldown', () => {
    const e = engine(DRILL_SERGEANT)
    expect(e.consider(at(0, 'idle_banter', EASY))).not.toBeNull()
    expect(e.consider(at(10 * S, 'under_target', EASY))).toBeNull()
    expect(e.consider(at(30 * S, 'under_target', EASY))?.priority).toBe(PRIORITY.coaching)
    expect(e.consider(at(40 * S, 'cadence_sag', EASY))).toBeNull()
    expect(e.consider(at(60 * S, 'cadence_sag', EASY))).not.toBeNull()
    expect(e.consider(at(120 * S, 'under_target', EASY))).toBeNull()
    expect(e.consider(at(209 * S, 'under_target', EASY))).toBeNull()
    expect(e.consider(at(210 * S, 'under_target', EASY))).not.toBeNull()
  })

  it('lets cues skip the global cooldown and the hard-effort limit, but not their own cooldown', () => {
    const e = engine(DRILL_SERGEANT)
    expect(e.consider(sampleContext('idle_banter', 0))).not.toBeNull()
    expect(e.consider(sampleContext('countdown_10s', 1 * S))?.priority).toBe(PRIORITY.cue)
    expect(e.consider(sampleContext('segment_start', 11 * S))?.priority).toBe(PRIORITY.cue)
    expect(e.consider(sampleContext('countdown_10s', 20 * S))).toBeNull()
    expect(e.consider(sampleContext('countdown_10s', 31 * S))).not.toBeNull()
    expect(e.consider(sampleContext('pr', 32 * S))).not.toBeNull()
    expect(e.consider(sampleContext('pr', 33 * S))).toBeNull()
  })

  it('allows at most one non-cue line per minute during a hard effort', () => {
    const e = engine(DRILL_SERGEANT)
    const hard = { segmentKind: 'on', targetW: 300, power: 250, cadence: 70, cadenceAvg: 90, hr: 180, hrCap: 170, remainingS: 300 }
    expect(e.consider(at(0, 'segment_start', hard))).not.toBeNull()
    expect(e.consider(at(31 * S, 'under_target', hard))).not.toBeNull()
    expect(e.consider(at(62 * S, 'cadence_sag', hard))).toBeNull()
    expect(e.consider(at(90 * S, 'cadence_sag', hard))).toBeNull()
    expect(e.consider(at(91 * S, 'cadence_sag', hard))).not.toBeNull()
    expect(e.consider(at(100 * S, 'last_minute', hard))).not.toBeNull()
    // the segment ends: back to the 30 s coaching gap
    expect(e.consider(at(151 * S, 'segment_end_success', { ...hard, avgW: 301, pct: 100 }))).not.toBeNull()
    expect(e.consider(at(181 * S, 'hr_high', EASY))).not.toBeNull()
  })

  it('tracks the hard effort from segment_start when later moments omit the segment', () => {
    const e = engine(DRILL_SERGEANT)
    expect(e.consider(at(0, 'segment_start', { segmentKind: 'on', targetW: 300, remainingS: 300 }))).not.toBeNull()
    expect(e.consider(at(31 * S, 'fueling_reminder', { elapsedMin: 20 }))).not.toBeNull()
    expect(e.consider(at(62 * S, 'hydration_reminder', { elapsedMin: 21 }))).toBeNull()
    // the tracked segment ended at 300 s
    expect(e.consider(at(301 * S, 'hydration_reminder', { elapsedMin: 25 }))).not.toBeNull()
  })

  it('paces easy segment starts per kind, as coaching', () => {
    const e = engine(DRILL_SERGEANT)
    const off = { segmentKind: 'off', targetW: 150, remainingS: 60 }
    expect(e.consider(at(0, 'segment_start', off))?.priority).toBe(PRIORITY.coaching)
    expect(e.consider(at(2 * MIN, 'segment_start', off))).toBeNull()
    expect(e.consider(at(2 * MIN + 1, 'segment_start', { segmentKind: 'on', targetW: 300, remainingS: 60 }))).not.toBeNull()
    expect(e.consider(at(3 * MIN, 'segment_start', off))).not.toBeNull()
  })

  it('ranks triggers into four tiers', () => {
    const f = (data: CoachData) => buildFacts(at(0, 'segment_start', data))
    expect(priorityOf('distress', f({}))).toBe(PRIORITY.safety)
    expect(priorityOf('countdown_10s', f({}))).toBe(PRIORITY.cue)
    expect(priorityOf('ftp_test_minute', f({}))).toBe(PRIORITY.cue)
    expect(priorityOf('segment_start', f({ segmentKind: 'maxeffort' }))).toBe(PRIORITY.cue)
    expect(priorityOf('segment_start', f({ segmentKind: 'cooldown' }))).toBe(PRIORITY.coaching)
    expect(priorityOf('under_target', f({}))).toBe(PRIORITY.coaching)
    expect(priorityOf('cadence_sag', f({}))).toBe(PRIORITY.coaching)
    expect(priorityOf('workout_complete', f({}))).toBe(PRIORITY.cue)
    expect(priorityOf('idle_banter', f({}))).toBe(PRIORITY.banter)
  })
})

describe('distress', () => {
  it('always speaks, muted or not, straight after another line', () => {
    const e = engine(DRILL_SERGEANT)
    expect(e.consider(sampleContext('idle_banter', 0))).not.toBeNull()
    e.mute(10 * MIN)
    const l = e.consider(sampleContext('distress', 1))
    expect(l?.priority).toBe(PRIORITY.safety)
    expect(l?.personaId).toBe('professional')
  })

  it('forces the Professional tone for five minutes, then hands back to the persona', () => {
    const e = engine(DRILL_SERGEANT)
    e.consider(sampleContext('distress', 0))
    expect(e.isSupportive(4 * MIN)).toBe(true)
    expect(e.consider(sampleContext('idle_banter', MIN))?.personaId).toBe('professional')
    expect(e.consider(sampleContext('countdown_10s', 4 * MIN))?.personaId).toBe('professional')
    expect(e.consider(sampleContext('countdown_10s', 5 * MIN + 1))?.personaId).toBe('drill-sergeant')
    expect(e.isSupportive(5 * MIN + 1)).toBe(false)
  })

  it('silences push-harder coaching while supportive', () => {
    const e = engine(DRILL_SERGEANT)
    e.consider(sampleContext('distress', 0))
    expect(e.consider(at(MIN, 'under_target', EASY))).toBeNull()
    expect(e.consider(at(2 * MIN, 'cadence_sag', EASY))).toBeNull()
    expect(e.consider(at(6 * MIN, 'under_target', EASY))?.personaId).toBe('drill-sergeant')
  })

  it('treats a burst of distress triggers as one episode that extends the window', () => {
    const e = engine(DRILL_SERGEANT)
    expect(e.consider(sampleContext('distress', 0))).not.toBeNull()
    expect(e.consider(sampleContext('distress', 10 * S))).toBeNull()
    expect(e.consider(sampleContext('distress', 20 * S))).toBeNull()
    expect(e.isSupportive(5 * MIN + 10 * S)).toBe(true)
    expect(e.consider(sampleContext('distress', ENGINE_TIMING.distressRepeatMs + 20 * S))).not.toBeNull()
  })

  it('can let the persona break character supportively instead', () => {
    const e = engine(DRILL_SERGEANT, { distressInCharacter: true })
    const l = e.consider(sampleContext('distress', 0))
    expect(l?.personaId).toBe('drill-sergeant')
    expect(l?.lineId.startsWith('drill-sergeant.distress.')).toBe(true)
    expect(e.consider(sampleContext('countdown_10s', MIN))?.personaId).toBe('professional')
  })

  it('has a clean built-in fallback line', () => {
    expect(violatesGuardrails(DISTRESS_FALLBACK.text)).toBeNull()
    expect(detectProfanity(DISTRESS_FALLBACK.text)).toBeNull()
  })
})

describe('mute', () => {
  it('silences everything but distress until it expires', () => {
    const e = engine(DRILL_SERGEANT)
    e.consider(sampleContext('idle_banter', 0))
    e.mute(2 * MIN)
    expect(e.isMuted(MIN)).toBe(true)
    expect(e.consider(sampleContext('countdown_10s', MIN))).toBeNull()
    expect(e.consider(sampleContext('countdown_10s', 2 * MIN))).not.toBeNull()
  })

  it('starts at the next moment if nothing has been considered yet, and mute(0) unmutes', () => {
    const e = engine(DRILL_SERGEANT)
    e.mute(MIN)
    expect(e.consider(sampleContext('countdown_10s', 10 * MIN))).toBeNull()
    expect(e.consider(sampleContext('countdown_10s', 10 * MIN + 30 * S))).toBeNull()
    e.mute(0)
    expect(e.consider(sampleContext('countdown_10s', 10 * MIN + 45 * S))).not.toBeNull()
  })
})

describe('Professional fallback', () => {
  const quips = pack([line('quip', 'A custom quip.', ['idle_banter'])], 'quips')

  it('covers cues and coaching a custom pack lacks, but never banter', () => {
    const e = engine(quips)
    expect(e.consider(sampleContext('idle_banter', 0))?.personaId).toBe('quips')
    expect(e.consider(sampleContext('countdown_10s', S))?.personaId).toBe('professional')
    expect(e.consider(at(31 * S, 'under_target', EASY))?.personaId).toBe('professional')
    const empty = engine(pack([line('cue', 'Ten.', ['countdown_10s'])], 'cues'))
    expect(empty.consider(sampleContext('idle_banter', 0))).toBeNull()
  })

  it('ignores spice', () => {
    const e = engine(PROFESSIONAL, { spice: 1 })
    expect(e.consider(sampleContext('countdown_10s', 0))?.personaId).toBe('professional')
  })
})

describe('setters', () => {
  it('clamps spice and switches persona', () => {
    const e = engine(pack([line('hot', 'Hot.', ['idle_banter'], 5)]), { spice: 1 })
    expect(e.consider(sampleContext('idle_banter', 0))).toBeNull()
    e.setSpice(9 as Spice)
    expect(e.consider(sampleContext('idle_banter', MIN))?.lineId).toBe('hot')
    e.setPersona(ROAST_COMIC)
    expect(e.persona).toBe(ROAST_COMIC)
    expect(e.consider(sampleContext('idle_banter', 2 * MIN))?.personaId).toBe('roast-comic')
  })
})

describe('determinism', () => {
  const ride = (seed: number): (string | undefined)[] => {
    const e = new CoachEngine({ persona: ROAST_COMIC, spice: 4, profanity: true, rng: mulberry32(seed) })
    return Array.from({ length: 600 }, (_, i) => e.consider(sampleContext(COACH_TRIGGERS[i % COACH_TRIGGERS.length]!, i * 7 * S))?.lineId)
  }

  it('says exactly the same things for the same seed', () => {
    expect(ride(1234)).toEqual(ride(1234))
  })

  it('varies with the seed', () => {
    expect(ride(1)).not.toEqual(ride(2))
  })

  it('picks deterministically from weights', () => {
    const items = ['a', 'b', 'c'] as const
    const w = (x: string): number => (x === 'a' ? 1 : x === 'b' ? 2 : 1)
    expect(weightedPick(items, w, () => 0)).toBe('a')
    expect(weightedPick(items, w, () => 0.3)).toBe('b')
    expect(weightedPick(items, w, () => 0.99)).toBe('c')
  })
})

describe('lifecycle', () => {
  it('treats a clock that jumps far backwards as a new ride', () => {
    const e = engine(ROAST_COMIC)
    expect(e.consider(sampleContext('idle_banter', 10 * MIN))).not.toBeNull()
    expect(e.consider(sampleContext('idle_banter', 1))).not.toBeNull()
  })

  it('counts slightly late, out-of-order moments as now, so they never reopen a cooldown', () => {
    const e = engine(ROAST_COMIC)
    expect(e.consider(sampleContext('idle_banter', 10 * MIN))).not.toBeNull()
    expect(e.consider(sampleContext('idle_banter', 10 * MIN - 5 * S))).toBeNull()
    expect(e.consider(sampleContext('countdown_10s', 10 * MIN - 50 * S))).not.toBeNull()
    expect(e.consider(sampleContext('countdown_10s', 10 * MIN - 40 * S))).toBeNull()
    expect(e.consider(sampleContext('idle_banter', 11 * MIN))).not.toBeNull()
  })

  it('forgets memory and cooldowns on reset()', () => {
    const e = engine(pack([line('a', 'A.', ['idle_banter'], 1, { criteria: [{ key: 'cadence', op: '>', value: 0 }] }), line('b', 'B.', ['idle_banter'])]))
    expect(e.consider(at(0, 'idle_banter', { cadence: 90 }))?.lineId).toBe('a')
    e.reset()
    expect(e.consider(at(1, 'idle_banter', { cadence: 90 }))?.lineId).toBe('a')
  })
})
