import { describe, expect, it } from 'vitest'
import { computeAchievements, computeStreaks, type AchievementRide } from './achievements'

const DAY = 86_400_000
const D0 = Date.UTC(2026, 8, 7, 12, 0) // Monday 7 Sep 2026, noon UTC

const ride = (dayIndex: number, over: Partial<AchievementRide> = {}): AchievementRide => ({
  startedAt: D0 + dayIndex * DAY,
  movingS: 3600,
  kj: 700,
  tss: 60,
  kind: 'free',
  simulated: false,
  mmp: [{ durationS: 5, watts: 800 }],
  utcOffsetMin: 0,
  ...over,
})
const byId = (xs: ReturnType<typeof computeAchievements>) => new Map(xs.map((a) => [a.id, a]))

describe('computeAchievements', () => {
  it('unlocks on the first qualifying ride and shows progress otherwise', () => {
    const rides = [ride(0), ride(1, { kind: 'ftp-test' }), ride(2, { movingS: 7300, kj: 1100, tss: 105 }), ride(3, { mmp: [{ durationS: 5, watts: 1020 }] })]
    const a = byId(computeAchievements({ rides, ftp: [], weightKg: 75 }))
    expect(a.get('first-ride')!.unlockedAt).toBe(D0)
    expect(a.get('ftp-test')!.unlockedAt).toBe(D0 + DAY)
    expect(a.get('two-hours')!.unlockedAt).toBe(D0 + 2 * DAY)
    expect(a.get('kj-1000')!.unlockedAt).toBe(D0 + 2 * DAY)
    expect(a.get('tss-100')!.unlockedAt).toBe(D0 + 2 * DAY)
    expect(a.get('sprint-1000')!.unlockedAt).toBe(D0 + 3 * DAY)
    expect(a.get('week-3')!.unlockedAt).toBe(D0 + 2 * DAY)
    expect(a.get('rides-10')).toMatchObject({ unlockedAt: null, progress: { value: 4, target: 10 } })
    expect(a.get('week-5')).toMatchObject({ unlockedAt: null, progress: { value: 4, target: 5 } })
  })

  it('ignores simulated rides entirely', () => {
    const a = byId(computeAchievements({ rides: [ride(0, { simulated: true, kind: 'ftp-test' })], ftp: [], weightKg: 75 }))
    expect(a.get('first-ride')!.unlockedAt).toBeNull()
    expect(a.get('ftp-test')!.unlockedAt).toBeNull()
  })

  it('tracks FTP gains and W/kg milestones at the weight of the day', () => {
    const ftp = [
      { date: D0, ftpW: 220, weightKg: 80 },
      { date: D0 + 30 * DAY, ftpW: 240, weightKg: 78 },
      { date: D0 + 60 * DAY, ftpW: 262, weightKg: 75 },
    ]
    const a = byId(computeAchievements({ rides: [], ftp, weightKg: 75 }))
    expect(a.get('ftp-up')!.unlockedAt).toBe(D0 + 30 * DAY)
    expect(a.get('wkg-3')!.unlockedAt).toBe(D0 + 30 * DAY) // 240 / 78 = 3.08
    // 262 / 75 = 3.49: not quite, and the progress says so.
    expect(a.get('wkg-3.5')).toMatchObject({ unlockedAt: null, progress: { value: 3.49, target: 3.5 } })
    const b = byId(computeAchievements({ rides: [], ftp: [...ftp, { date: D0 + 90 * DAY, ftpW: 263, weightKg: 75 }], weightKg: 75 }))
    expect(b.get('wkg-3.5')!.unlockedAt).toBe(D0 + 90 * DAY)
  })

  it('knows early birds from night owls in local time', () => {
    const early = ride(0, { startedAt: Date.UTC(2026, 8, 7, 12, 30), utcOffsetMin: -420 }) // 05:30 in UTC-7
    const late = ride(1, { startedAt: Date.UTC(2026, 8, 9, 4, 15), utcOffsetMin: -420 }) // 21:15 in UTC-7
    const a = byId(computeAchievements({ rides: [early, late], ftp: [], weightKg: 75 }))
    expect(a.get('early-bird')!.unlockedAt).toBe(early.startedAt)
    expect(a.get('night-owl')!.unlockedAt).toBe(late.startedAt)
  })
})

describe('computeStreaks', () => {
  it('counts consecutive days and two-ride weeks, current and best', () => {
    // days 0,1,2 then a gap, then 10,11 (today = 11)
    const rides = [0, 1, 2, 10, 11].map((d) => ride(d))
    expect(computeStreaks(rides, D0 + 11 * DAY, 0)).toEqual({ days: 2, bestDays: 3, weeks: 2, bestWeeks: 2 })
    // A streak that ended two days ago is over.
    expect(computeStreaks(rides, D0 + 13 * DAY, 0).days).toBe(0)
    expect(computeStreaks(rides, D0 + 12 * DAY, 0).days).toBe(2)
  })

  it('needs two rides for a week to count', () => {
    const rides = [ride(0), ride(8), ride(9)]
    expect(computeStreaks(rides, D0 + 9 * DAY, 0)).toMatchObject({ weeks: 1, bestWeeks: 1 })
  })
})
