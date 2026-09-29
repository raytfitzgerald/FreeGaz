import { describe, expect, it } from 'vitest'
import { FuelingTimer } from './fueling'

const ride = (t: FuelingTimer, toS: number) => {
  const out: string[] = []
  for (let s = 1; s <= toS; s++) for (const r of t.due(s)) out.push(`${s}:${r.kind === 'eat' ? `eat${r.grams}` : 'drink'}`)
  return out
}

describe('FuelingTimer', () => {
  it('reminds to drink every N minutes and to eat every 20 minutes from minute 30', () => {
    const t = new FuelingTimer({ enabled: true, carbsPerHourG: 60, drinkEveryMin: 15 })
    expect(ride(t, 3600)).toEqual(['900:drink', '1800:drink', '1800:eat20', '2700:drink', '3000:eat20', '3600:drink'])
  })

  it('sizes snacks from the hourly target and skips them at 0 g', () => {
    expect(ride(new FuelingTimer({ enabled: true, carbsPerHourG: 90, drinkEveryMin: 60 }), 1800)).toEqual(['1800:eat30'])
    expect(ride(new FuelingTimer({ enabled: true, carbsPerHourG: 0, drinkEveryMin: 60 }), 3600)).toEqual(['3600:drink'])
  })

  it('stays quiet when disabled, and never repeats after a jump back in time', () => {
    expect(ride(new FuelingTimer({ enabled: false, carbsPerHourG: 60, drinkEveryMin: 15 }), 3600)).toEqual([])
    const t = new FuelingTimer({ enabled: true, carbsPerHourG: 60, drinkEveryMin: 15 })
    expect(t.due(901)).toEqual([{ kind: 'drink' }])
    expect(t.due(899)).toEqual([])
    expect(t.due(902)).toEqual([])
  })
})
