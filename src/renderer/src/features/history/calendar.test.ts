import { describe, expect, it } from 'vitest'
import type { RideSummary } from '@core/ride/types'
import { calendarMonth, loadBand, shiftMonth } from './calendar'

const ride = (id: string, startedAt: number, tss: number, movingS = 3600) => ({ id, startedAt, tss, movingS, name: id }) as unknown as RideSummary

describe('calendarMonth', () => {
  it('lays out September 2026 Monday to Sunday, with the edges from the months around it', () => {
    const m = calendarMonth(2026, 8, [], new Date(2026, 8, 30, 12).getTime())
    // 1 Sep 2026 is a Tuesday, so the grid starts on Monday 31 Aug
    expect(m.weeks[0]!.days[0]).toMatchObject({ day: 31, inMonth: false })
    expect(m.weeks[0]!.days[1]).toMatchObject({ day: 1, inMonth: true })
    expect(m.weeks).toHaveLength(5)
    expect(m.weeks.flatMap((w) => w.days).find((d) => d.isToday)?.day).toBe(30)
  })

  it('puts rides on their local day, and totals the weeks and the month', () => {
    const rides = [ride('a', new Date(2026, 8, 2, 7).getTime(), 60), ride('b', new Date(2026, 8, 2, 18).getTime(), 40), ride('c', new Date(2026, 7, 31, 9).getTime(), 80)]
    const m = calendarMonth(2026, 8, rides)
    const sep2 = m.weeks[0]!.days[2]!
    expect(sep2.rides.map((r) => r.id)).toEqual(['a', 'b'])
    expect(sep2.tss).toBe(100)
    expect(m.weeks[0]).toMatchObject({ rides: 3, tss: 180 })
    // 31 Aug shows in the grid but not in September's totals
    expect(m).toMatchObject({ rides: 2, tss: 100, movingS: 7200 })
  })

  it('bands the load and steps months over year ends', () => {
    expect([0, 20, 70, 150].map(loadBand)).toEqual([0, 1, 2, 3])
    expect(shiftMonth(2026, 0, -1)).toEqual([2025, 11])
    expect(shiftMonth(2026, 11, 1)).toEqual([2027, 0])
  })
})
