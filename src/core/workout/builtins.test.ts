import { describe, expect, it } from 'vitest'
import { BUILTIN_TEXT, BUILTIN_WORKOUTS } from './builtins'
import { compileWorkout, diffTimelines, validateWorkout } from './compile'
import { parseIntervalsText, toIntervalsText } from './io/intervals-text'
import { parseZwo, toZwo } from './io/zwo'

/** Intended length of each built-in, in minutes (stated independently of the texts). */
const MINUTES: Record<string, number> = {
  'recovery-spin-30': 30,
  'endurance-45': 45,
  'endurance-60': 60,
  'endurance-90': 90,
  'endurance-120': 120,
  'endurance-surges-60': 60,
  'tempo-2x20': 70,
  'tempo-3x15': 75,
  'low-cadence-5x5': 60,
  'sweet-spot-3x12': 65,
  'sweet-spot-3x15': 80,
  'sweet-spot-2x20': 70,
  'sweet-spot-4x10-cadence': 70,
  'threshold-2x15': 65,
  'threshold-3x10': 65,
  'threshold-2x20': 75,
  'over-unders-3x9': 60,
  pyramid: 50,
  'vo2max-5x4': 65,
  'vo2max-6x3': 60,
  'thirty-thirties': 50,
  'forty-twenties': 60,
  'ronnestad-30-15': 60,
  'anaerobic-8x1': 55,
  'sprints-6x15': 55,
  'race-openers': 30,
  'cadence-drills': 55,
  'roast-me': 55,
}

const TAGS = new Set([
  'recovery',
  'endurance',
  'tempo',
  'sweet-spot',
  'threshold',
  'vo2max',
  'anaerobic',
  'sprint',
  'openers',
  'cadence',
  'strength',
  'fun',
])

const byId = (slug: string) => {
  const w = BUILTIN_WORKOUTS.find((x) => x.id === `builtin:${slug}`)
  if (!w) throw new Error(`no builtin ${slug}`)
  return w
}

describe('BUILTIN_WORKOUTS', () => {
  it('has about 28 workouts with unique, deterministic ids', () => {
    expect(BUILTIN_WORKOUTS).toHaveLength(28)
    const ids = BUILTIN_WORKOUTS.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.map((id) => id.replace('builtin:', '')).sort()).toEqual(Object.keys(MINUTES).sort())
    for (const id of ids) expect(id).toMatch(/^builtin:[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it.each(BUILTIN_WORKOUTS)('$name parses cleanly, validates and runs its intended length', (w) => {
    const text = BUILTIN_TEXT[w.id] ?? ''
    expect(parseIntervalsText(text).errors).toEqual([])
    expect(validateWorkout(w)).toEqual([])
    expect(w).toMatchObject({ source: 'builtin', sportType: 'bike', author: 'FreeGaz' })
    expect(w.name.length).toBeGreaterThan(3)
    const sentences = (w.description ?? '').match(/[.!?](?=\s|$)/g) ?? []
    expect(sentences.length, w.description).toBeGreaterThanOrEqual(1)
    expect(sentences.length, w.description).toBeLessThanOrEqual(2)
    expect(w.tags.length).toBeGreaterThan(0)
    for (const tag of w.tags) expect(TAGS.has(tag), tag).toBe(true)
    const intended = (MINUTES[w.id.replace('builtin:', '')] ?? 0) * 60
    expect(Math.abs(compileWorkout(w).durationS - intended)).toBeLessThanOrEqual(1)
  })

  it.each(BUILTIN_WORKOUTS)('$name round-trips through ZWO and text', (w) => {
    const tl = compileWorkout(w)
    expect(diffTimelines(tl, compileWorkout(parseZwo(toZwo(w))))).toBeNull()
    const back = parseIntervalsText(toIntervalsText(w))
    expect(back.errors).toEqual([])
    expect(diffTimelines(tl, compileWorkout(back.workout))).toBeNull()
  })

  it.each(BUILTIN_WORKOUTS)('$name exports back to its source text verbatim', (w) => {
    // The sources are written in the exporter's canonical layout, so text mode
    // shows exactly what the library author wrote.
    expect(toIntervalsText(w)).toBe(`${BUILTIN_TEXT[w.id] ?? ''}\n`)
  })

  it('keeps warm-ups rising, cool-downs falling and cues inside their steps', () => {
    for (const w of BUILTIN_WORKOUTS) {
      for (const s of w.segments) {
        if (s.kind !== 'ramp') continue
        if (s.role === 'warmup') expect(s.to.value, w.name).toBeGreaterThan(s.from.value)
        if (s.role === 'cooldown') expect(s.to.value, w.name).toBeLessThan(s.from.value)
      }
      const tl = compileWorkout(w)
      const cues = w.segments.reduce((n, s) => n + (s.text?.length ?? 0), 0)
      expect(tl.texts).toHaveLength(cues)
    }
  })

  it('covers the sessions the library promises', () => {
    const tl = (slug: string) => compileWorkout(byId(slug))
    expect(tl('sprints-6x15').steps.filter((s) => s.kind === 'maxeffort')).toHaveLength(6)
    expect(tl('race-openers').steps.filter((s) => s.kind === 'maxeffort')).toHaveLength(3)
    const ou = byId('over-unders-3x9').segments.filter((s) => s.kind === 'intervals')
    expect(ou.map((s) => (s.kind === 'intervals' ? [s.repeat, s.on.power.value, s.off.power.value] : null))).toEqual([
      [3, 0.95, 1.05],
      [3, 0.95, 1.05],
      [3, 0.95, 1.05],
    ])
    const ronnestad = byId('ronnestad-30-15').segments.filter((s) => s.kind === 'intervals')
    expect(ronnestad.map((s) => (s.kind === 'intervals' ? `${s.repeat}x${s.on.durationS}/${s.off.durationS}` : ''))).toEqual([
      '13x30/15',
      '13x30/15',
      '13x30/15',
    ])
    const vo2 = tl('vo2max-5x4').steps.filter((s) => s.kind === 'on')
    expect(vo2.map((s) => [s.durationS, s.from?.value])).toEqual(Array.from({ length: 5 }, () => [240, 1.15]))
    const cadences = new Set(tl('sweet-spot-4x10-cadence').steps.map((s) => s.cadence?.rpm))
    expect([...cadences].filter((c) => c !== undefined).sort()).toEqual([100, 70, 85])
    expect(tl('roast-me').texts.length).toBeGreaterThanOrEqual(8)
    expect(tl('threshold-2x20').steps.filter((s) => s.kind === 'on').map((s) => s.from)).toEqual([
      { unit: 'ftp', value: 0.975, low: 0.95, high: 1 },
      { unit: 'ftp', value: 0.975, low: 0.95, high: 1 },
    ])
  })
})
