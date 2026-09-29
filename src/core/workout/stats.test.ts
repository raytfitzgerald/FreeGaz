import { describe, expect, it } from 'vitest'
import { compileWorkout } from './compile'
import type { Segment, Workout } from './model'
import {
  cogganZone,
  FREERIDE_ESTIMATE_FTP,
  MAXEFFORT_ESTIMATE_FTP,
  normalizedPower,
  workoutStats,
} from './stats'

const ftp = (value: number) => ({ unit: 'ftp' as const, value })

function workout(segments: Segment[]): Workout {
  return { id: 't', name: 'Test', tags: [], sportType: 'bike', source: 'user', segments }
}

describe('workoutStats', () => {
  it('an hour at FTP is IF 1.0 and 100 TSS', () => {
    const s = workoutStats(workout([{ kind: 'steady', durationS: 3600, power: ftp(1) }]), 250)
    expect(s.durationS).toBe(3600)
    expect(s.np).toBeCloseTo(250, 9)
    expect(s.if).toBeCloseTo(1, 9)
    expect(s.tss).toBeCloseTo(100, 6)
    expect(s.kj).toBeCloseTo(900, 9)
    expect(s.avgW).toBeCloseTo(250, 9)
    expect(s.zoneSeconds).toEqual([0, 0, 0, 3600, 0, 0, 0])
  })

  it('integrates ramps exactly by sampling mid-second', () => {
    const s = workoutStats(workout([{ kind: 'ramp', role: 'ramp', durationS: 100, from: ftp(0), to: ftp(2) }]), 100)
    expect(s.kj).toBeCloseTo(10, 12)
    expect(s.avgW).toBeCloseTo(100, 12)
    expect(s.zoneSeconds.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('assumes fixed intensities for free rides and max efforts', () => {
    const s = workoutStats(
      workout([
        { kind: 'freeride', durationS: 600 },
        { kind: 'maxeffort', durationS: 60 },
      ]),
      200,
    )
    expect(s.kj).toBeCloseTo((600 * FREERIDE_ESTIMATE_FTP * 200 + 60 * MAXEFFORT_ESTIMATE_FTP * 200) / 1000, 9)
    expect(s.zoneSeconds).toEqual([0, 600, 0, 0, 0, 60, 0])
  })

  it('NP exceeds average power for surging efforts', () => {
    const s = workoutStats(
      workout([{ kind: 'intervals', repeat: 20, on: { durationS: 30, power: ftp(1.5) }, off: { durationS: 30, power: ftp(0.5) } }]),
      300,
    )
    expect(s.avgW).toBeCloseTo(300, 9)
    expect(s.np).not.toBeNull()
    expect(s.np ?? 0).toBeGreaterThan(s.avgW + 20)
    expect(s.tss).toBeCloseTo((1200 / 3600) * (s.if ?? 0) ** 2 * 100, 9)
  })

  it('has no NP for workouts under 30 s, but still counts work', () => {
    const s = workoutStats(workout([{ kind: 'steady', durationS: 20, power: ftp(1) }]), 300)
    expect(s).toMatchObject({ np: null, if: null, tss: null, durationS: 20 })
    expect(s.kj).toBeCloseTo(6, 12)
  })

  it('weights a trailing partial second', () => {
    const s = workoutStats(workout([{ kind: 'steady', durationS: 90.5, power: ftp(1) }]), 200)
    expect(s.kj).toBeCloseTo(18.1, 12)
    expect(s.avgW).toBeCloseTo(200, 12)
    expect(s.zoneSeconds[3]).toBeCloseTo(90.5, 12)
  })

  it('accepts a compiled timeline and rejects a bad FTP', () => {
    const w = workout([{ kind: 'steady', durationS: 600, power: { unit: 'watts', value: 180 } }])
    expect(workoutStats(compileWorkout(w), 240)).toEqual(workoutStats(w, 240))
    expect(() => workoutStats(w, 0)).toThrow(RangeError)
    expect(() => workoutStats(w, Number.NaN)).toThrow(RangeError)
  })

  it('handles an empty workout', () => {
    expect(workoutStats(workout([]), 250)).toEqual({
      durationS: 0,
      np: null,
      if: null,
      tss: null,
      kj: 0,
      avgW: 0,
      zoneSeconds: [0, 0, 0, 0, 0, 0, 0],
    })
  })
})

describe('cogganZone', () => {
  it('uses half-open Coggan boundaries', () => {
    const cases: [number, number][] = [
      [0, 0],
      [0.559, 0],
      [0.56, 1],
      [0.759, 1],
      [0.76, 2],
      [0.91, 3],
      [1.059, 3],
      [1.06, 4],
      [1.21, 5],
      [1.509, 5],
      [1.51, 6],
      [3, 6],
    ]
    for (const [f, z] of cases) expect(cogganZone(f), `fraction ${f}`).toBe(z)
  })
})

describe('normalizedPower', () => {
  it('is the power itself for a constant series', () => {
    expect(normalizedPower(Array.from({ length: 120 }, () => 230))).toBeCloseTo(230, 9)
  })
  it('needs a full 30-s window', () => {
    expect(normalizedPower(Array.from({ length: 29 }, () => 230))).toBeNull()
  })
})
