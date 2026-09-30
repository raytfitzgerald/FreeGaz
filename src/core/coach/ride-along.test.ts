import { describe, expect, it } from 'vitest'
import { MAX_GAP_M, START, coachPaceW, gapLabel, rideAlongMood, speedForPower, stepRideAlong } from './ride-along'

const ride = (seconds: number, rider: { watts: number | null; kmh: number | null }, coachW: number) => {
  let s = START
  for (let i = 0; i < seconds * 4; i++) s = stepRideAlong(s, 0.25, rider, coachW)
  return s
}

describe('ride-along', () => {
  it('paces at the target, or at an endurance pace without one', () => {
    expect(coachPaceW(250, 300)).toBe(250)
    expect(coachPaceW(null, 300)).toBe(195)
    expect(coachPaceW(0, 20)).toBe(50)
  })

  it('stays level when the rider matches the coach', () => {
    expect(Math.abs(ride(60, { watts: 200, kmh: 32 }, 200).gapM)).toBeLessThan(0.01)
  })

  it('the coach rides away when the rider eases off, and gets dropped when they push', () => {
    expect(ride(10, { watts: 150, kmh: null }, 250).gapM).toBeGreaterThan(5)
    expect(ride(10, { watts: 350, kmh: null }, 250).gapM).toBeLessThan(-5)
  })

  it('keeps the gap on screen', () => {
    expect(ride(600, { watts: null, kmh: null }, 250).gapM).toBe(MAX_GAP_M)
    expect(ride(600, { watts: 1000, kmh: null }, 100).gapM).toBe(-MAX_GAP_M)
  })

  it('scrolls the road at the rider speed', () => {
    expect(ride(10, { watts: 200, kmh: 36 }, 200).roadM).toBeCloseTo(100, 0)
    expect(speedForPower(0)).toBe(0)
  })

  it('describes the gap', () => {
    expect(rideAlongMood(1)).toBe('together')
    expect(gapLabel(12.4, 'Zen')).toBe('Zen 12 m ahead')
    expect(gapLabel(-8, 'Zen')).toBe("You're 8 m clear")
    expect(gapLabel(MAX_GAP_M, 'Zen')).toBe('Zen is waiting up the road')
    expect(gapLabel(-MAX_GAP_M, 'Zen')).toBe('You dropped Zen')
  })
})
