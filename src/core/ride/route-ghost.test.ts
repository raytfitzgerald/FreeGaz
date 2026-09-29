import { describe, expect, it } from 'vitest'
import { demoRoutes } from '../routes/synthetic'
import { ghostFromDistances, ghostTimeAt, recordedPaceGhost, shiftGhost } from './route-ghost'
import { recordedPaceTimes, recordedTimeBetween } from './route-course'

describe('ghostFromDistances', () => {
  it('turns per-second cumulative distance into samples at the end of each second', () => {
    expect(ghostFromDistances([4, 9, 15])).toEqual([
      { tS: 0, distM: 0 },
      { tS: 1, distM: 4 },
      { tS: 2, distM: 9 },
      { tS: 3, distM: 15 },
    ])
  })

  it('skips missing seconds and stops at the finish, so the cool-down never races', () => {
    const d = Float32Array.from([5, 10, Number.NaN, 20, 26, 31, 36])
    expect(ghostFromDistances(d, 25)).toEqual([
      { tS: 0, distM: 0 },
      { tS: 1, distM: 5 },
      { tS: 2, distM: 10 },
      { tS: 4, distM: 20 },
      { tS: 5, distM: 26 },
    ])
  })
})

describe('shiftGhost', () => {
  it('moves the whole effort in time and distance', () => {
    expect(
      shiftGhost(
        [
          { tS: 0, distM: 0 },
          { tS: 10, distM: 80 },
        ],
        4,
        30,
      ),
    ).toEqual([
      { tS: -4, distM: -30 },
      { tS: 6, distM: 50 },
    ])
  })
})

describe('recordedPaceGhost', () => {
  const loop = demoRoutes().find((r) => r.id === 'demo-test-loop')!

  it('rides the route’s recorded pace to the finish', () => {
    const ghost = recordedPaceGhost(loop.profile)!
    const total = recordedTimeBetween(loop.profile, recordedPaceTimes(loop.profile)!, 0, loop.distanceM)
    expect(ghost[0]).toEqual({ tS: 0, distM: 0 })
    expect(ghost.at(-1)!.distM).toBeCloseTo(loop.distanceM, 6)
    expect(ghost.at(-1)!.tS).toBeCloseTo(total, 6)
    expect(ghostTimeAt(ghost, loop.distanceM)).toBeCloseTo(total, 6)
  })

  it('repeats for each lap', () => {
    const one = recordedPaceGhost(loop.profile, 1)!
    const two = recordedPaceGhost(loop.profile, 2)!
    expect(two.length).toBe(2 * one.length - 1)
    expect(two.at(-1)!.distM).toBeCloseTo(2 * loop.distanceM, 6)
    expect(two.at(-1)!.tS).toBeCloseTo(2 * one.at(-1)!.tS, 6)
  })

  it('is null for a route without timestamps', () => {
    expect(recordedPaceGhost(demoRoutes().find((r) => r.id === 'demo-flat-five')!.profile)).toBeNull()
  })
})

describe('ghostTimeAt', () => {
  it('interpolates when the ghost reached a distance, or null if it never did', () => {
    const g = [
      { tS: 0, distM: 0 },
      { tS: 10, distM: 100 },
      { tS: 20, distM: 150 },
    ]
    expect(ghostTimeAt(g, 50)).toBe(5)
    expect(ghostTimeAt(g, 125)).toBe(15)
    expect(ghostTimeAt(g, 200)).toBeNull()
  })
})
