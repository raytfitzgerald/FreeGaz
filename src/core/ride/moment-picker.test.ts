import { describe, expect, it } from 'vitest'
import { COACH_FROM_S, HARD_FROM_S, MomentPicker } from './moment-picker'

/** Feeds `watts(t)` for t in [from, to) and returns the seconds a capture fired. */
function ride(p: MomentPicker, from: number, to: number, watts: (t: number) => number | null): number[] {
  const shots: number[] = []
  for (let t = from; t < to; t++) if (p.onTick(t, watts(t))) shots.push(t)
  return shots
}

describe('ride moments', () => {
  it('never shoots the warm-up, then catches the hardest effort', () => {
    const p = new MomentPicker()
    const shots = ride(p, 0, 1200, (t) => (t >= 600 && t < 660 ? 400 : 180))
    expect(shots.every((t) => t >= HARD_FROM_S)).toBe(true)
    expect(shots.at(-1)).toBeGreaterThanOrEqual(600 + 20)
    expect(shots.at(-1)).toBeLessThan(660 + 30)
    expect(p.hardestW).toBeGreaterThan(350)
  })

  it('does not reshoot a steady effort every second', () => {
    const p = new MomentPicker()
    expect(ride(p, 0, 3600, () => 200)).toHaveLength(1)
  })

  it('ignores a ride with no power at all', () => {
    const p = new MomentPicker()
    expect(ride(p, 0, 600, () => null)).toEqual([])
    expect(p.hardestW).toBeNull()
  })

  it('keeps each coach line with equal chance', () => {
    const kept = [0, 0, 0, 0]
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let run = 0; run < 8000; run++) {
      const p = new MomentPicker()
      let keep = -1
      for (let i = 0; i < 4; i++) if (p.onCoachLine(COACH_FROM_S + i * 60, rand())) keep = i
      kept[keep]!++
    }
    for (const k of kept) expect(k / 8000).toBeGreaterThan(0.22)
  })

  it('skips coach lines from the first minute and always keeps the first after it', () => {
    const p = new MomentPicker()
    expect(p.onCoachLine(10, 0)).toBe(false)
    expect(p.onCoachLine(COACH_FROM_S, 0.99)).toBe(true)
  })
})
