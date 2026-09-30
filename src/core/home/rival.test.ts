import { describe, expect, it } from 'vitest'
import { matchesAny, personaBannedPatterns } from '../coach/content'
import { detectProfanity, violatesGuardrails } from '../persona/guardrails'
import { PACKS, packById } from '../persona/packs'
import { RIVAL_POOL, allTaunts, pickRival, rivalTaunt } from './rival'

describe('rival coach', () => {
  it("never picks the rider's own coach, or a parody", () => {
    for (const p of PACKS) {
      for (let i = 0; i < 50; i++) {
        const r = pickRival(p.meta.id)
        expect(r).not.toBe(p.meta.id)
        expect(['bibi', 'trump']).not.toContain(r)
      }
    }
  })

  it('every persona has taunts that are clean and pass its guardrails, with the rival named', () => {
    for (const p of PACKS) {
      const lines = allTaunts(p.meta.id)
      expect(lines.length).toBeGreaterThanOrEqual(2)
      for (const rival of RIVAL_POOL) {
        const name = packById(rival)!.meta.name
        for (const line of lines) {
          const t = line.replaceAll('{rival}', name)
          expect(detectProfanity(t), t).toBeNull()
          expect(violatesGuardrails(t), t).toBeNull()
          expect(matchesAny(t, personaBannedPatterns(p.meta.id)), t).toBe(false)
        }
      }
    }
    expect(rivalTaunt('zen', 'Data Nerd', () => 0)).toContain('Data Nerd')
  })
})
