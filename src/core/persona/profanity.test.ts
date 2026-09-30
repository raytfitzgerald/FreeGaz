import { describe, expect, it } from 'vitest'
import { gateLine } from '../coach/content'
import { CoachEngine } from './engine'
import { detectProfanity, languageAllowed, maskLanguage } from './guardrails'
import { DRILL_SERGEANT } from './packs'
import { mulberry32 } from './rng'
import { sampleContext } from './samples'
import { PRIORITY, toProfanity, type CoachLineTemplate, type PersonaPack, type Profanity } from './types'

const lines: CoachLineTemplate[] = [
  { id: 'clean', text: 'Keep going.', triggers: ['idle_banter'], spice: 1 },
  { id: 'mild', text: 'Keep going, damn it.', triggers: ['idle_banter'], spice: 1, profanity: true },
  { id: 'strong', text: 'Keep fucking going.', triggers: ['idle_banter'], spice: 1, profanity: true },
]
const pack: PersonaPack = { meta: { id: 'test', name: 'Test', tagline: '' }, lines }

/** Which lines one engine says over many banter moments. */
function said(level: Profanity, persona: PersonaPack = pack, n = 300): Map<string, number> {
  const e = new CoachEngine({ persona, spice: 5, profanity: level, rng: mulberry32(7), memorySize: 0, cooldownMs: 45_000, perTriggerCooldownMs: 0 })
  const out = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const l = e.consider({ ...sampleContext('idle_banter'), now: i * 120_000 })
    if (l) out.set(l.lineId, (out.get(l.lineId) ?? 0) + 1)
  }
  return out
}

describe('profanity levels', () => {
  it('reads old boolean settings', () => {
    expect(toProfanity(true)).toBe('unhinged')
    expect(toProfanity(false)).toBe('clean')
    expect(toProfanity('mild')).toBe('mild')
  })

  it('matches words to the setting', () => {
    expect(languageAllowed('damn', 'clean')).toBe(false)
    expect(languageAllowed('damn', 'mild')).toBe(true)
    expect(languageAllowed('fuck', 'mild')).toBe(false)
    expect(languageAllowed('fuck', 'unhinged')).toBe(true)
  })

  it('Clean says only clean lines, Mild adds the mild ones', () => {
    expect([...said('clean').keys()]).toEqual(['clean'])
    expect([...said('mild').keys()].sort()).toEqual(['clean', 'mild'])
  })

  it('Unhinged prefers the sweariest lines', () => {
    const counts = said('unhinged')
    const profane = (counts.get('mild') ?? 0) + (counts.get('strong') ?? 0)
    expect(profane).toBeGreaterThan((counts.get('clean') ?? 0) * 8)
  })

  it('a real pack swears on Unhinged, and never strongly on Mild', () => {
    const e = (level: Profanity) => new CoachEngine({ persona: DRILL_SERGEANT, spice: 5, profanity: level, rng: mulberry32(1), memorySize: 0, perTriggerCooldownMs: 0 })
    const run = (level: Profanity) => {
      const engine = e(level)
      const texts: string[] = []
      for (let i = 0; i < 200; i++) {
        const l = engine.consider({ ...sampleContext('idle_banter'), now: i * 120_000 })
        if (l) texts.push(l.text)
      }
      return texts
    }
    expect(run('mild').some((t) => detectProfanity(t) === 'strong')).toBe(false)
    const unhinged = run('unhinged')
    expect(unhinged.filter((t) => detectProfanity(t) === 'strong').length).toBeGreaterThan(unhinged.length / 3)
  })

  it('the gate lets AI lines swear only as far as the setting allows', () => {
    const ai = { text: 'Fucking move.', speech: 'Fucking move.', personaId: 'test', trigger: 'idle_banter' as const, priority: PRIORITY.banter, lineId: 'ai.1' }
    expect(gateLine(ai, { personaId: 'test', profanity: 'mild' })).toBeNull()
    expect(gateLine(ai, { personaId: 'test', profanity: 'unhinged' })).toBe(ai)
    const mild = { ...ai, text: 'Damn, move.', speech: 'Damn, move.' }
    expect(gateLine(mild, { personaId: 'test', profanity: 'mild' })).toBe(mild)
    expect(gateLine(mild, { personaId: 'test', profanity: 'clean' })).toBeNull()
  })

  it('Mild is heard at everyday spice, not only at 5', () => {
    const e = new CoachEngine({ persona: DRILL_SERGEANT, spice: 3, profanity: 'mild', rng: mulberry32(2), memorySize: 0, perTriggerCooldownMs: 0 })
    const texts: string[] = []
    for (let i = 0; i < 300; i++) {
      const l = e.consider({ ...sampleContext('ftp_test_result'), now: i * 120_000 })
      if (l) texts.push(l.text)
    }
    expect(texts.some((t) => detectProfanity(t) === 'mild')).toBe(true)
    expect(texts.some((t) => detectProfanity(t) === 'strong')).toBe(false)
  })

  it('Unhinged swears even when a clean line fits the moment more exactly', () => {
    const e = new CoachEngine({ persona: DRILL_SERGEANT, spice: 5, profanity: 'unhinged', rng: mulberry32(4), memorySize: 0, perTriggerCooldownMs: 0 })
    let strong = 0
    for (let i = 0; i < 60; i++) {
      const l = e.consider({ ...sampleContext('halfway', 0, { power: 300, targetW: 300 }), now: i * 120_000 })
      if (l && detectProfanity(l.text) === 'strong') strong++
    }
    expect(strong).toBeGreaterThan(20)
  })
})

describe('maskLanguage', () => {
  it('bleeps to the setting and leaves Unhinged alone', () => {
    const cue = 'Raise the fucking finger, damn it. Motherfucker.'
    expect(maskLanguage(cue, 'unhinged')).toBe(cue)
    expect(maskLanguage(cue, 'mild')).toBe('Raise the f****** finger, damn it. M***********.')
    expect(maskLanguage(cue, 'clean')).toBe('Raise the f****** finger, d*** it. M***********.')
    expect(maskLanguage('Shit Show', 'clean')).toBe('S*** Show')
  })
})
