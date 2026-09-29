import { describe, expect, it } from 'vitest'
import { carbFraction, carbsBurnedG, kcalFromKj, KJ_PER_KCAL } from './energy'

describe('kcalFromKj', () => {
  it('is 1:1 by default (≈ 24 % gross efficiency cancels 4.184 kJ/kcal)', () => {
    expect(kcalFromKj(900)).toBe(900)
  })

  it('accepts an explicit gross efficiency', () => {
    expect(kcalFromKj(1000, 0.2)).toBeCloseTo(1000 / (0.2 * KJ_PER_KCAL), 9)
    expect(kcalFromKj(1000, 1 / KJ_PER_KCAL)).toBeCloseTo(1000, 9)
    expect(() => kcalFromKj(1000, 0)).toThrow(RangeError)
    expect(() => kcalFromKj(1000, 1.5)).toThrow(RangeError)
  })
})

describe('carbohydrate estimate', () => {
  it('rises linearly from 50 % at IF 0.6 to 95 % at IF 1.0, clamped outside that range', () => {
    expect(carbFraction(0.4)).toBe(0.5)
    expect(carbFraction(0.6)).toBe(0.5)
    expect(carbFraction(0.8)).toBeCloseTo(0.725, 12)
    expect(carbFraction(1.0)).toBeCloseTo(0.95, 12)
    expect(carbFraction(1.3)).toBeCloseTo(0.95, 12)
  })

  it('converts at 4 kcal per gram', () => {
    expect(carbsBurnedG(1000, 0.6)).toBeCloseTo(125, 9)
    expect(carbsBurnedG(800, 1.0)).toBeCloseTo(190, 9)
  })
})
