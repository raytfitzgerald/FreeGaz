import { describe, expect, it } from 'vitest'
import { computePmc } from './pmc'

describe('computePmc', () => {
  it('first day: CTL = TSS/42, ATL = TSS/7, TSB = 0 (from yesterday’s zeros)', () => {
    const [d] = computePmc([{ date: '2026-03-01', tss: 100 }])
    expect(d).toEqual({ date: '2026-03-01', tss: 100, ctl: 100 / 42, atl: 100 / 7, tsb: 0 })
  })

  it('TSB is yesterday’s CTL minus yesterday’s ATL', () => {
    const days = [
      { date: '2026-03-01', tss: 120 },
      { date: '2026-03-02', tss: 60 },
      { date: '2026-03-03', tss: 0 },
      { date: '2026-03-04', tss: 200 },
    ]
    const rows = computePmc(days)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.tsb).toBeCloseTo(rows[i - 1]!.ctl - rows[i - 1]!.atl, 12)
      expect(rows[i]!.ctl).toBeCloseTo(rows[i - 1]!.ctl + (rows[i]!.tss - rows[i - 1]!.ctl) / 42, 12)
      expect(rows[i]!.atl).toBeCloseTo(rows[i - 1]!.atl + (rows[i]!.tss - rows[i - 1]!.atl) / 7, 12)
    }
  })

  it('converges to a constant daily load', () => {
    const days = Array.from({ length: 365 }, (_, i) => ({
      date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
      tss: 80,
    }))
    const last = computePmc(days).at(-1)!
    expect(last.date).toBe('2025-12-31')
    expect(last.ctl).toBeCloseTo(80 * (1 - (41 / 42) ** 365), 9)
    expect(last.atl).toBeCloseTo(80, 6)
  })

  it('fills rest days with 0 TSS and sums several rides on one day', () => {
    const rows = computePmc([
      { date: '2026-01-05', tss: 50 },
      { date: '2026-01-05', tss: 30 },
      { date: '2026-01-08', tss: 90 },
    ])
    expect(rows.map((r) => [r.date, r.tss])).toEqual([
      ['2026-01-05', 80],
      ['2026-01-06', 0],
      ['2026-01-07', 0],
      ['2026-01-08', 90],
    ])
    expect(rows[1]!.ctl).toBeLessThan(rows[0]!.ctl)
  })

  it('walks calendar days across month ends, leap days and years', () => {
    const rows = computePmc([
      { date: '2028-02-27', tss: 10 },
      { date: '2028-03-01', tss: 10 },
    ])
    expect(rows.map((r) => r.date)).toEqual(['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01'])
    const nye = computePmc([{ date: '2026-12-30', tss: 1 }], { to: '2027-01-02' })
    expect(nye.map((r) => r.date)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
  })

  it('warms up on entries before `from`, stops at `to`, and ignores later entries', () => {
    const days = [
      { date: '2026-01-01', tss: 100 },
      { date: '2026-01-02', tss: 100 },
      { date: '2026-01-03', tss: 100 },
      { date: '2026-01-10', tss: 500 },
    ]
    const all = computePmc(days)
    const window = computePmc(days, { from: '2026-01-03', to: '2026-01-05' })
    expect(window.map((r) => r.date)).toEqual(['2026-01-03', '2026-01-04', '2026-01-05'])
    expect(window[0]).toEqual(all[2])
    expect(window[2]).toEqual(all[4])
  })

  it('seeds from startCtl/startAtl and projects decay without any rides', () => {
    const rows = computePmc([], { from: '2026-06-01', to: '2026-06-03', startCtl: 70, startAtl: 90 })
    expect(rows).toHaveLength(3)
    expect(rows[0]!.tsb).toBe(-20)
    expect(rows[0]!.ctl).toBeCloseTo(70 - 70 / 42, 12)
    expect(rows[2]!.atl).toBeCloseTo(90 * (6 / 7) ** 3, 12)
  })

  it('supports other time constants', () => {
    const [d] = computePmc([{ date: '2026-03-01', tss: 60 }], { ctlDays: 28, atlDays: 5 })
    expect(d!.ctl).toBeCloseTo(60 / 28, 12)
    expect(d!.atl).toBeCloseTo(12, 12)
  })

  it('returns [] without a range, and for to < from', () => {
    expect(computePmc([])).toEqual([])
    expect(computePmc([{ date: '2026-03-02', tss: 5 }], { from: '2026-03-05', to: '2026-03-01' })).toEqual([])
  })

  it('skips non-finite TSS and rejects invalid dates and constants', () => {
    expect(computePmc([{ date: '2026-03-01', tss: Number.NaN }, { date: '2026-03-02', tss: 10 }])[0]!.date).toBe('2026-03-02')
    for (const date of ['2026-02-30', '2026-13-01', '2026-3-1', '20260301', '2026-03-01T00:00:00Z', '']) {
      expect(() => computePmc([{ date, tss: 10 }]), date).toThrow(RangeError)
    }
    expect(() => computePmc([], { from: 'yesterday', to: '2026-01-01' })).toThrow(RangeError)
    expect(() => computePmc([], { ctlDays: 0 })).toThrow(RangeError)
  })
})
