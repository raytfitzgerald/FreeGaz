import { describe, expect, it } from 'vitest'
import { detectProfanity } from '../persona/guardrails'
import { DRILL_SERGEANT, PROFESSIONAL, TRUMP, ZEN } from '../persona/packs'
import { coachVoice, voiceExamples } from './voice'

describe('coach voice', () => {
  it('names the persona, spice and language', () => {
    const v = coachVoice(ZEN, { spice: 2, profanity: 'mild' })
    expect(v).toContain('Persona: Zen')
    expect(v).toContain('Spice level 2/5')
    expect(v).toContain('Language: mild')
  })

  it('shows style examples that fit the language setting', () => {
    for (const t of voiceExamples(DRILL_SERGEANT, { spice: 5, profanity: 'clean' })) expect(detectProfanity(t)).toBeNull()
    for (const t of voiceExamples(DRILL_SERGEANT, { spice: 5, profanity: 'mild' })) expect(detectProfanity(t)).not.toBe('strong')
    const unhinged = voiceExamples(DRILL_SERGEANT, { spice: 5, profanity: 'unhinged' })
    expect(unhinged.length).toBeGreaterThan(3)
    expect(unhinged.filter((t) => detectProfanity(t) === 'strong').length).toBeGreaterThan(unhinged.length / 2)
    expect(unhinged.some((t) => t.includes('{'))).toBe(false)
  })

  it('keeps Professional plain whatever the settings', () => {
    const v = coachVoice(PROFESSIONAL, { spice: 5, profanity: 'unhinged' })
    expect(v).toContain('Language: clean')
    expect(v).toContain('no roasting')
  })

  it('marks the parodies as parodies', () => {
    expect(coachVoice(TRUMP, { spice: 3, profanity: 'clean' })).toContain('parody')
  })
})

describe('coach voice rules', () => {
  it('always carries the house rules, and each parody its off-limits topics', () => {
    expect(coachVoice(ZEN, { spice: 5, profanity: 'unhinged' })).toContain("never the rider's body")
    expect(coachVoice(TRUMP, { spice: 3, profanity: 'clean' })).toContain('Never touch religion, race')
  })
})
