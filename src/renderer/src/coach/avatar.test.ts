import { describe, expect, it } from 'vitest'
import { PACKS } from '@core/persona'
import { avatarColors, avatarHue, monogram } from './avatar'

describe('monogram avatars', () => {
  it('uses initials, skipping a leading "The"', () => {
    expect(PACKS.map((p) => monogram(p.meta.name))).toEqual(['DS', 'RC', 'DD', 'O', 'HC', 'DN', 'Z', 'P', 'B'])
    expect(monogram('mean-spirited coach')).toBe('MS')
    expect(monogram('  ')).toBe('?')
  })

  it('gives each persona a stable colour of its own', () => {
    expect(avatarHue('bibi')).toBe(avatarHue('bibi'))
    const hues = new Set(PACKS.map((p) => avatarHue(p.meta.id)))
    expect(hues.size).toBe(PACKS.length)
    expect(avatarColors('zen')).toEqual({ background: `hsl(${avatarHue('zen')} 55% 26%)`, color: `hsl(${avatarHue('zen')} 90% 88%)` })
  })
})
