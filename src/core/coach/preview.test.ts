import { describe, expect, it } from 'vitest'
import { detectProfanity, violatesGuardrails } from '../persona/guardrails'
import { BIBI, DRILL_SERGEANT, PACKS, PROFESSIONAL } from '../persona/packs'
import { mulberry32 } from '../persona/rng'
import { matchesAny, personaBannedPatterns } from './content'
import { previewLine } from './preview'

describe('previewLine', () => {
  it('gives every persona a sample in its own voice, at every spice', () => {
    for (const persona of PACKS) {
      for (const spice of [1, 3, 5]) {
        const line = previewLine(persona, { spice, profanity: false, rng: mulberry32(spice) })
        expect(line, `${persona.meta.id} at ${spice}`).not.toBeNull()
        expect(line!.personaId).toBe(persona.meta.id)
        expect(violatesGuardrails(line!.text)).toBeNull()
        expect(detectProfanity(line!.text)).toBeNull()
        expect(line!.speech.length).toBeGreaterThan(0)
      }
    }
  })

  it('can preview one moment, and varies between calls', () => {
    const texts = new Set<string>()
    for (let seed = 0; seed < 12; seed++) {
      const line = previewLine(PROFESSIONAL, { spice: 3, profanity: false, rng: mulberry32(seed), trigger: 'segment_start' })
      expect(line?.trigger).toBe('segment_start')
      texts.add(line!.text)
    }
    expect(texts.size).toBeGreaterThan(3)
  })

  it('keeps Bibi inside its bans', () => {
    const bans = personaBannedPatterns('bibi')
    for (let seed = 0; seed < 40; seed++) {
      const line = previewLine(BIBI, { spice: 5, profanity: true, rng: mulberry32(seed) })!
      expect(matchesAny(line.text, bans), line.text).toBe(false)
    }
  })
})

describe('previewLine rideKinds', () => {
  it('keeps to the kinds of ride asked for', () => {
    for (let i = 0; i < 40; i++) {
      const line = previewLine(DRILL_SERGEANT, { spice: 3, profanity: 'clean', trigger: 'ride_start', rideKinds: ['workout'], withoutFacts: ['workoutName'] })
      expect(line?.text ?? '').not.toMatch(/FTP test day|Free ride|Sweet Spot/)
      expect(line).not.toBeNull()
    }
  })
})
