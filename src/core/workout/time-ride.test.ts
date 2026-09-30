import { describe, expect, it } from 'vitest'
import { compileWorkout } from './compile'
import { timeRideWorkout } from './time-ride'

describe('timeRideWorkout', () => {
  it('lasts exactly the minutes asked for, easing included', () => {
    for (const ease of [false, true]) {
      const w = timeRideWorkout({ minutes: 45, effort: { kind: 'erg', watts: 180 }, ease })
      expect(compileWorkout(w).durationS).toBe(45 * 60)
    }
    expect(timeRideWorkout({ minutes: 45, effort: { kind: 'erg', watts: 180 }, ease: true }).segments.map((s) => s.kind)).toEqual(['ramp', 'steady', 'ramp'])
  })

  it('leaves the effort to the rider on a free-pace ride', () => {
    const w = timeRideWorkout({ minutes: 30, effort: { kind: 'free' }, ease: true })
    expect(w.segments).toEqual([expect.objectContaining({ kind: 'freeride', durationS: 1800 })])
    expect(w.name).toBe('30-minute ride')
  })

  it('clamps silly inputs and skips easing on very short rides', () => {
    expect(compileWorkout(timeRideWorkout({ minutes: 1, effort: { kind: 'free' }, ease: false })).durationS).toBe(5 * 60)
    expect(timeRideWorkout({ minutes: 10, effort: { kind: 'erg', watts: 150 }, ease: true }).segments).toHaveLength(1)
    expect(timeRideWorkout({ minutes: 20, effort: { kind: 'erg', watts: 99999 }, ease: false }).segments[0]).toMatchObject({ power: { value: 2000 } })
  })
})
