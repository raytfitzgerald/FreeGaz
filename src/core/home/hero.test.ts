import { describe, expect, it } from 'vitest'
import { heroWords, partOfDay } from './hero'

const tue = (h: number) => new Date(2026, 8, 29, h)

describe('heroWords', () => {
  it('names the day and the part of it', () => {
    expect(heroWords({ now: tue(7), ridesThisWeek: 0, ridesEver: 0, tsb: null }).eyebrow).toBe('Tuesday morning')
    expect(partOfDay(23)).toBe('night')
    expect(partOfDay(15)).toBe('afternoon')
  })

  it('reads the week and the form', () => {
    expect(heroWords({ now: tue(7), ridesThisWeek: 0, ridesEver: 0, tsb: null }).title).toBe('The track is empty.')
    expect(heroWords({ now: tue(7), ridesThisWeek: 0, ridesEver: 12, tsb: 3 }).title).toBe('Nobody on the track this week.')
    expect(heroWords({ now: tue(7), ridesThisWeek: 2, ridesEver: 12, tsb: -30 }).title).toBe("You've earned an easy one.")
    expect(heroWords({ now: tue(7), ridesThisWeek: 1, ridesEver: 12, tsb: 9 })).toMatchObject({ title: 'Fresh legs. Spend them.', sub: expect.stringContaining('1 ride on the track') })
    expect(heroWords({ now: tue(7), ridesThisWeek: 5, ridesEver: 12, tsb: -5 }).title).toBe('The track is getting crowded.')
  })

  it('never shouts', () => {
    for (const ridesThisWeek of [0, 1, 5]) for (const tsb of [null, -40, 0, 20]) expect(JSON.stringify(heroWords({ now: tue(20), ridesThisWeek, ridesEver: 3, tsb }))).not.toContain('!')
  })
})
