import { describe, expect, it } from 'vitest'
import { coverageGaps, packCoverage } from '../coverage'
import { CoachEngine, criterionHolds } from '../engine'
import { detectProfanity, guardrailMatch } from '../guardrails'
import { mulberry32 } from '../rng'
import { sampleVariants as variants } from '../samples'
import { bracesBalanced, buildFacts, placeholdersOf, renderTemplate } from '../template'
import {
  COACH_TRIGGERS,
  COMMON_TRIGGERS,
  isDataKey,
  type CoachLineTemplate,
  type CoachTrigger,
  type PersonaPack,
  type Spice,
} from '../types'
import { validatePack } from '../validate'
import { PACKS, PROFESSIONAL, packById } from './index'

const SPICES: readonly Spice[] = [1, 2, 3, 4, 5]
const ALL = PACKS.flatMap((pack) => pack.lines.map((line) => ({ pack, line })))
const NON_PROFESSIONAL = PACKS.filter((p) => p !== PROFESSIONAL)

function reachable(line: CoachLineTemplate, trigger: CoachTrigger): boolean {
  return variants(trigger).some((c) => {
    const facts = buildFacts(c)
    return (line.criteria ?? []).every((cr) => criterionHolds(cr, facts)) && renderTemplate(line.text, facts) !== null
  })
}

describe('built-in packs', () => {
  it('ships the nine personas with unique ids', () => {
    expect(PACKS.map((p) => p.meta.id)).toEqual([
      'drill-sergeant',
      'roast-comic',
      'disappointed-dad',
      'the-overlord',
      'hype-coach',
      'data-nerd',
      'zen',
      'professional',
      'bibi',
    ])
    for (const p of PACKS) expect(packById(p.meta.id)).toBe(p)
    expect(packById('nope')).toBeUndefined()
  })

  it('gives every line a unique id', () => {
    const ids = ALL.map(({ line }) => line.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every persona a voice hint', () => {
    for (const p of PACKS) {
      expect(p.meta.voiceHint?.preferVoices.length).toBeGreaterThan(0)
      expect(p.meta.tagline.length).toBeGreaterThan(0)
    }
  })
})

describe('every canned line', () => {
  it('passes the guardrails', () => {
    const bad = ALL.flatMap(({ line }) => {
      const m = guardrailMatch(line.text)
      return m ? [`${line.id}: ${m.category} "${m.match}" in: ${line.text}`] : []
    })
    expect(bad).toEqual([])
  })

  it('is flagged for profanity exactly when it swears', () => {
    const bad = ALL.flatMap(({ line }) => {
      const level = detectProfanity(line.text)
      if ((level !== null) !== (line.profanity === true)) return [`${line.id}: profanity flag ${String(line.profanity)} but ${String(level)}`]
      return []
    })
    expect(bad).toEqual([])
  })

  it('uses only known placeholders and criteria keys', () => {
    const bad = ALL.flatMap(({ line }) => [
      ...(bracesBalanced(line.text) ? [] : [`${line.id}: stray brace`]),
      ...placeholdersOf(line.text).filter((k) => !isDataKey(k)).map((k) => `${line.id}: {${k}}`),
      ...(line.criteria ?? []).filter((c) => !isDataKey(c.key)).map((c) => `${line.id}: criterion ${c.key}`),
    ])
    expect(bad).toEqual([])
  })

  it('is reachable: some realistic moment satisfies its criteria and fills its placeholders', () => {
    const dead = ALL.flatMap(({ line }) => line.triggers.filter((t) => !reachable(line, t)).map((t) => `${line.id} (${t}): ${line.text}`))
    expect(dead).toEqual([])
  })

  it('is short enough to say mid-interval', () => {
    const long = ALL.filter(({ line }) => line.text.length > (line.triggers.includes('countdown_10s') ? 110 : 160))
    expect(long.map(({ line }) => `${line.id} (${line.text.length})`)).toEqual([])
  })
})

describe('coverage', () => {
  it.each(PACKS.map((p) => [p.meta.id, p] as const))('%s covers common triggers with 6+ lines and the rest with 2+', (_id, pack) => {
    expect(coverageGaps(pack)).toEqual([])
  })

  it('counts hard and easy segment starts separately', () => {
    const counts = packCoverage(PROFESSIONAL)
    expect(counts['segment_start:hard']).toBeGreaterThanOrEqual(6)
    expect(counts['segment_start:warmup']).toBeGreaterThanOrEqual(2)
    expect(counts['segment_start:cooldown']).toBeGreaterThanOrEqual(2)
  })

  it.each(NON_PROFESSIONAL.map((p) => [p.meta.id, p] as const))('%s spreads its lines across spice 1–5', (_id, pack) => {
    expect(new Set(pack.lines.map((l) => l.spice))).toEqual(new Set(SPICES))
    for (const t of COMMON_TRIGGERS) {
      const levels = new Set(pack.lines.filter((l) => l.triggers.includes(t)).map((l) => l.spice))
      expect(levels.size, `${pack.meta.id} ${t}`).toBeGreaterThanOrEqual(3)
      const gentle = pack.lines.filter((l) => l.triggers.includes(t) && l.spice === 1 && l.profanity !== true)
      expect(gentle.length, `${pack.meta.id} ${t} needs a gentle line`).toBeGreaterThan(0)
    }
  })

  it('keeps Professional plain: spice 1 only, no profanity', () => {
    expect(PROFESSIONAL.lines.every((l) => l.spice === 1 && l.profanity !== true)).toBe(true)
  })
})

describe('reachability through the engine', () => {
  // For every pack, moment, spice level and profanity setting, the persona itself
  // has something to say (never falling back to Professional).
  const cases = PACKS.flatMap((pack) => COACH_TRIGGERS.map((trigger) => [pack.meta.id, trigger, pack] as const))
  it.each(cases)('%s has a line for %s at every spice level', (_id, trigger, pack: PersonaPack) => {
    for (const c of variants(trigger)) {
      for (const spice of SPICES) {
        for (const profanity of [false, true]) {
          const engine = new CoachEngine({ persona: pack, spice, profanity, rng: mulberry32(7), distressInCharacter: true })
          const line = engine.consider(c)
          expect(line?.personaId, `${trigger} ${JSON.stringify(c.data)} spice ${spice} profanity ${profanity}`).toBe(pack.meta.id)
          if (!profanity) expect(detectProfanity(line?.text ?? '')).toBeNull()
        }
      }
    }
  })
})

describe('originality', () => {
  it('The Overlord uses no names from other trainer brands', () => {
    const borrowed = /sufferf|sufferland|grunter|knights? of|minions? of sufferland|tapsalot/i
    const hits = ALL.filter(({ line }) => borrowed.test(line.text))
    expect(hits.map(({ line }) => line.id)).toEqual([])
  })
})

describe('validatePack', () => {
  it.each(PACKS.map((p) => [p.meta.id, p] as const))('accepts %s as a user pack', (_id, pack) => {
    const json: unknown = JSON.parse(JSON.stringify({ ...pack, meta: { ...pack.meta, id: `copy-${pack.meta.id}` } }))
    const { pack: out, errors } = validatePack(json)
    expect(errors).toEqual([])
    expect(out?.lines).toHaveLength(pack.lines.length)
  })
})
