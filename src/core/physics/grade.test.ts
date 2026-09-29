import { describe, expect, it } from 'vitest'
import { DEFAULT_SLOPE_SCALING, trainerGrade } from './grade'

describe('trainerGrade', () => {
  it('passes climbs through and halves descents by default', () => {
    expect(trainerGrade(0)).toBe(0)
    expect(trainerGrade(5)).toBe(5)
    expect(trainerGrade(-8)).toBe(-4)
  })

  it('caps at ±limit', () => {
    expect(trainerGrade(25)).toBe(20)
    expect(trainerGrade(-50)).toBe(-20)
  })

  it('applies custom scaling and an asymmetric downhill limit', () => {
    const s = { uphillPct: 50, downhillPct: 100, limitPct: 10, minPct: -5 }
    expect(trainerGrade(8, s)).toBe(4)
    expect(trainerGrade(30, s)).toBe(10)
    expect(trainerGrade(-3, s)).toBe(-3)
    expect(trainerGrade(-12, s)).toBe(-5)
    expect(trainerGrade(-4, { ...DEFAULT_SLOPE_SCALING, downhillPct: 0 })).toBe(0) // +0, never −0
  })

  it('treats a non-finite grade as flat', () => {
    expect(trainerGrade(Number.NaN)).toBe(0)
    expect(trainerGrade(Number.POSITIVE_INFINITY)).toBe(0)
  })
})
