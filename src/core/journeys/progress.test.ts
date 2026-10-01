import { describe, expect, it } from 'vitest'
import { journeyRideText, journeyTotals, newJourney, nextDay, recordRide } from './progress'
import type { JourneyCourse } from './course'

const course = { id: 'paris-rome', name: 'Paris → Rome', kind: 'grand', lengthM: 1_421_000, start: 'Notre-Dame, Paris' } as JourneyCourse
const DAY = 86_400_000

describe('journey progress', () => {
  it('picks up where the last ride stopped and counts the days', () => {
    let j = newJourney(course, 'j1', 0)
    expect(nextDay(j)).toBe(1)
    j = recordRide(j, { rideId: 'a', at: 1 * DAY, fromM: 0, toM: 38_400 })
    j = recordRide(j, { rideId: 'b', at: 3 * DAY, fromM: 38_400, toM: 80_000 })
    expect(j.progressM).toBe(80_000)
    expect(nextDay(j)).toBe(3)
    expect(journeyTotals(j)).toEqual({ rides: 2, distanceM: 80_000, days: 3 })
  })

  it('ignores a repeat of the same ride and a ride that went nowhere', () => {
    let j = recordRide(newJourney(course, 'j1', 0), { rideId: 'a', at: 1, fromM: 0, toM: 1000 })
    expect(recordRide(j, { rideId: 'a', at: 2, fromM: 1000, toM: 5000 })).toBe(j)
    j = recordRide(j, { rideId: 'b', at: 3, fromM: 1000, toM: 1000 })
    expect(j.rides).toHaveLength(1)
  })

  it('finishes at the end of the road, and never counts past it', () => {
    const j = recordRide(newJourney(course, 'j1', 0), { rideId: 'a', at: 1, fromM: 1_400_000, toM: 1_450_000 })
    expect(j.progressM).toBe(1_421_000)
    expect(j.finishedAt).toBe(1)
    expect(j.rides[0]!.toM).toBe(1_421_000)
  })

  it('writes the Strava title and description in real terms', () => {
    const t = journeyRideText({ course, day: 9, fromM: 273_600, toM: 312_000, passed: ['Auxerre', 'Dijon'] })
    expect(t.title).toBe('Paris → Rome, day 9')
    expect(t.description).toBe('Paris → Rome, day 9: 38.4 km today, 312 of 1421 km. Passed Auxerre, Dijon.')
    const drop = journeyRideText({ course: { ...course, kind: 'drop', name: 'Eiffel Tower to Rambouillet', start: 'Eiffel Tower', lengthM: 55_000 }, day: null, fromM: 0, toM: 21_300, passed: [] })
    expect(drop).toEqual({ title: 'Eiffel Tower to Rambouillet', description: 'Dropped at Eiffel Tower and rode 21.3 km.' })
  })
})
