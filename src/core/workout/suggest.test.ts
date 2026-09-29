import { describe, expect, it } from 'vitest'
import { BUILTIN_WORKOUTS } from './builtins'
import { FTP_TESTS } from './ftp-tests'
import { suggestNextWorkout, type SuggestInput } from './suggest'

const base: SuggestInput = { hasFtp: true, daysSinceTest: 10, tsb: 0, lastRpe: 6, hardRidesLast7: 1, hoursSinceLastRide: 24 }
const pick = (over: Partial<SuggestInput>) => suggestNextWorkout({ ...base, ...over }).workoutId

describe('suggestNextWorkout', () => {
  it('follows form, feel and load', () => {
    expect(pick({ hasFtp: false })).toBe('builtin:ramp-test')
    expect(pick({ lastRpe: 10, hoursSinceLastRide: 12 })).toBe('builtin:recovery-spin-30')
    expect(pick({ lastRpe: 10, hoursSinceLastRide: 60 })).toBe('builtin:sweet-spot-3x12') // that was days ago
    expect(pick({ tsb: -30 })).toBe('builtin:recovery-spin-30')
    expect(pick({ daysSinceTest: 50, tsb: -5 })).toBe('builtin:ftp-test-20min')
    expect(pick({ daysSinceTest: 50, tsb: -15 })).toBe('builtin:endurance-60') // too tired to test well
    expect(pick({ hardRidesLast7: 3 })).toBe('builtin:endurance-60')
    expect(pick({ tsb: 8 })).toBe('builtin:vo2max-5x4')
    expect(pick({})).toBe('builtin:sweet-spot-3x12')
  })

  it('only ever suggests workouts that exist', () => {
    const ids = new Set([...BUILTIN_WORKOUTS, ...FTP_TESTS].map((w) => w.id))
    for (const over of [{ hasFtp: false }, { tsb: -30 }, { daysSinceTest: 50 }, { hardRidesLast7: 4 }, { tsb: 9 }, {}]) expect(ids.has(pick(over))).toBe(true)
  })
})
