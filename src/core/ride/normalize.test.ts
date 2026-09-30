import { describe, expect, it } from 'vitest'
import { normalizeRide } from './normalize'
import type { RideSummary } from './types'

describe('normalizeRide', () => {
  it('fills a bare record with no-data values, never zeros for measurements', () => {
    const r = normalizeRide({ id: 'x', name: 'Bare', startedAt: 1000 } as unknown as RideSummary)
    expect(r.decouplingPct).toBeNull()
    expect(r.np).toBeNull()
    expect(r.laps).toEqual([])
    expect(r.powerZonesS).toEqual([])
    expect(r.athlete).toEqual({ ftpW: 200, weightKg: 75 })
    expect(r.movingS).toBe(0)
  })

  it('keeps what is there, and drops non-numbers', () => {
    const r = normalizeRide({ id: 'y', name: 'Ok', np: 230, tss: Number.NaN, laps: 'nope', athlete: { ftpW: 260, weightKg: 70, lthr: 165 } } as unknown as RideSummary)
    expect(r.np).toBe(230)
    expect(r.tss).toBeNull()
    expect(r.laps).toEqual([])
    expect(r.athlete.lthr).toBe(165)
  })
})
