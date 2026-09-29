import { describe, expect, it } from 'vitest'
import { gradeIntegral, lookaheadGrade, profileIndex, sampleAt, upcoming } from './lookup'
import type { ProfilePoint } from './model'

// Flat for 10 m, a ramp from 0 to 10 % between 10 and 20 m, then 10 % to the end at 35 m.
const profile: ProfilePoint[] = [
  { distM: 0, ele: 100, gradePct: 0, lat: 45, lon: 7 },
  { distM: 10, ele: 100, gradePct: 0, lat: 45.0001, lon: 7.0001 },
  { distM: 20, ele: 101, gradePct: 10, lat: 45.0002, lon: 7.0002 },
  { distM: 30, ele: 102, gradePct: 10, lat: 45.0003, lon: 7.0003 },
  { distM: 35, ele: 102.5, gradePct: 10, lat: 45.00035, lon: 7.00035 },
]

describe('sampleAt', () => {
  it('interpolates every field linearly between the two points around the distance', () => {
    const s = sampleAt(profile, 15)
    expect(s.index).toBe(1)
    expect(s.distM).toBe(15)
    expect(s.ele).toBeCloseTo(100.5, 12)
    expect(s.gradePct).toBeCloseTo(5, 12)
    expect(s.lat).toBeCloseTo(45.00015, 12)
    expect(s.lon).toBeCloseTo(7.00015, 12)
    expect(s).not.toHaveProperty('recordedMps')
  })

  it('returns profile points exactly, with the index of the point at or before the distance', () => {
    expect(sampleAt(profile, 20)).toEqual({ distM: 20, ele: 101, gradePct: 10, lat: 45.0002, lon: 7.0002, index: 2 })
    expect(sampleAt(profile, 34.999).index).toBe(3)
    expect(sampleAt(profile, 35).index).toBe(4)
  })

  it('clamps outside the route and treats NaN as the start', () => {
    expect(sampleAt(profile, -5)).toMatchObject({ distM: 0, ele: 100, index: 0 })
    expect(sampleAt(profile, 99)).toMatchObject({ distM: 35, ele: 102.5, gradePct: 10, index: 4 })
    expect(sampleAt(profile, Number.NaN)).toMatchObject({ distM: 0, index: 0 })
  })

  it('interpolates recorded speed when the profile has it, and longitude across the antimeridian', () => {
    const timed: ProfilePoint[] = [
      { distM: 0, ele: 0, gradePct: 0, lat: 0, lon: 179.9, recordedMps: 8 },
      { distM: 10, ele: 0, gradePct: 0, lat: 0, lon: -179.9, recordedMps: 12 },
    ]
    const s = sampleAt(timed, 5)
    expect(s.recordedMps).toBeCloseTo(10, 12)
    expect(Math.abs(s.lon)).toBeCloseTo(180, 9)
    expect(sampleAt(timed, 7.5).lon).toBeCloseTo(-179.95, 9)
  })

  it('finds indices by binary search on long profiles', () => {
    const long: ProfilePoint[] = Array.from({ length: 10_001 }, (_, k) => ({ distM: k * 10, ele: 0, gradePct: 0, lat: 45, lon: 7 }))
    expect(profileIndex(long, 54_321)).toBe(5432)
    expect(profileIndex(long, 0)).toBe(0)
    expect(profileIndex(long, 1e9)).toBe(10_000)
    expect(() => profileIndex([], 0)).toThrow(RangeError)
  })
})

describe('gradeIntegral', () => {
  it('integrates the piecewise-linear grade exactly', () => {
    expect(gradeIntegral(profile, 0, 35)).toBeCloseTo(200, 9) // 0 + 50 + 150
    expect(gradeIntegral(profile, 5, 25)).toBeCloseTo(100, 9)
    expect(gradeIntegral(profile, 12, 14)).toBeCloseTo(2 * 3, 9) // mean of 2 % and 4 %
    expect(gradeIntegral(profile, 30, 20)).toBe(0)
    expect(gradeIntegral(profile, -10, 100)).toBeCloseTo(200, 9)
  })
})

describe('lookaheadGrade', () => {
  it('averages the grade over the next aheadM metres', () => {
    expect(lookaheadGrade(profile, 5, 10)).toBeCloseTo(1.25, 12) // 12.5 %·m over 10 m
    expect(lookaheadGrade(profile, 10, 10)).toBeCloseTo(5, 12)
    expect(lookaheadGrade(profile, 20, 10)).toBeCloseTo(10, 12)
  })

  it('is the grade at the position for a zero window', () => {
    expect(lookaheadGrade(profile, 15, 0)).toBeCloseTo(5, 12)
    expect(lookaheadGrade(profile, 15, -3)).toBeCloseTo(5, 12)
  })

  it('stops at the finish unless the route is a loop', () => {
    expect(lookaheadGrade(profile, 0, 70)).toBeCloseTo(200 / 35, 12)
    expect(lookaheadGrade(profile, 35, 10)).toBe(10)
    expect(lookaheadGrade(profile, 30, 10, { loop: true })).toBeCloseTo(5, 12) // 5 m at 10 %, 5 m at 0 %
    expect(lookaheadGrade(profile, 0, 70, { loop: true })).toBeCloseTo(400 / 70, 12)
    // 10..35 (200), a whole lap (200), then 0..15 (12.5)
    expect(lookaheadGrade(profile, 10, 75, { loop: true })).toBeCloseTo((200 + 200 + 12.5) / 75, 12)
  })
})

describe('upcoming', () => {
  it('returns the window ahead with interpolated ends, tagged by distance ahead', () => {
    const pts = upcoming(profile, 5, 20)
    expect(pts.map((p) => p.aheadM)).toEqual([0, 5, 15, 20])
    expect(pts.map((p) => p.distM)).toEqual([5, 10, 20, 25])
    expect(pts.at(-1)!.ele).toBeCloseTo(101.5, 12)
    expect(pts[0]).not.toHaveProperty('index')
  })

  it('stops at the finish, or wraps round a loop without repeating the start point', () => {
    expect(upcoming(profile, 30, 20).map((p) => p.distM)).toEqual([30, 35])
    const loop = upcoming(profile, 30, 20, { loop: true })
    expect(loop.map((p) => p.distM)).toEqual([30, 35, 10, 15])
    expect(loop.map((p) => p.aheadM)).toEqual([0, 5, 15, 20])
  })

  it('is just the current point for an empty window', () => {
    expect(upcoming(profile, 12, 0)).toHaveLength(1)
  })
})
