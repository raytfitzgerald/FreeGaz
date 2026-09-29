// Achievements and streaks, computed from ride summaries and FTP history.
// Only real rides count: simulated / time-warped rides never unlock anything.

export interface AchievementRide {
  startedAt: number
  movingS: number
  kj: number
  tss: number | null
  kind: 'free' | 'workout' | 'route' | 'ftp-test'
  simulated: boolean
  mmp: { durationS: number; watts: number }[]
  /** Minutes east of UTC at the ride's start, for "early bird" (defaults to the host's). */
  utcOffsetMin?: number
}

export interface AchievementFtp {
  date: number
  ftpW: number
  weightKg?: number
}

export type AchievementIcon = 'bike' | 'flame' | 'zap' | 'mountain' | 'trophy' | 'sunrise' | 'moon' | 'gauge' | 'calendar'

export interface Achievement {
  id: string
  title: string
  description: string
  icon: AchievementIcon
  /** When it was first earned, or null. */
  unlockedAt: number | null
  /** Progress towards it while locked. */
  progress?: { value: number; target: number }
}

export interface Streaks {
  /** Consecutive days with a ride, ending today or yesterday. */
  days: number
  bestDays: number
  /** Consecutive ISO weeks with at least two rides, ending this week or last. */
  weeks: number
  bestWeeks: number
}

const DAY = 86_400_000

interface Ctx {
  rides: AchievementRide[]
  ftp: AchievementFtp[]
  weightKg: number
  offset: (r: AchievementRide) => number
}

type Def = Omit<Achievement, 'unlockedAt' | 'progress'> & { eval: (c: Ctx) => { at: number | null; progress?: { value: number; target: number } } }

/** The nth qualifying ride's start, or null, with progress. */
const nth = (rides: AchievementRide[], n: number) => ({ at: rides[n - 1]?.startedAt ?? null, progress: { value: Math.min(rides.length, n), target: n } })
const first = (rides: AchievementRide[], test: (r: AchievementRide) => boolean) => ({ at: rides.find(test)?.startedAt ?? null })
const localHour = (r: AchievementRide, offsetMin: number) => new Date(r.startedAt + offsetMin * 60_000).getUTCHours()
const best = (r: AchievementRide, d: number) => r.mmp.find((m) => m.durationS === d)?.watts ?? 0

/** When the rolling 7-day ride count first reached n. */
function ridesInAWeek(rides: AchievementRide[], n: number): { at: number | null; progress: { value: number; target: number } } {
  let lo = 0
  let most = 0
  for (let hi = 0; hi < rides.length; hi++) {
    while (rides[hi]!.startedAt - rides[lo]!.startedAt >= 7 * DAY) lo++
    most = Math.max(most, hi - lo + 1)
    if (hi - lo + 1 >= n) return { at: rides[hi]!.startedAt, progress: { value: n, target: n } }
  }
  return { at: null, progress: { value: most, target: n } }
}

function wkgMilestone(c: Ctx, wkg: number): { at: number | null; progress: { value: number; target: number } } {
  let bestWkg = 0
  for (const f of c.ftp) {
    const v = f.ftpW / (f.weightKg ?? c.weightKg)
    bestWkg = Math.max(bestWkg, v)
    if (v >= wkg) return { at: f.date, progress: { value: wkg, target: wkg } }
  }
  return { at: null, progress: { value: Math.round(bestWkg * 100) / 100, target: wkg } }
}

const DEFS: Def[] = [
  { id: 'first-ride', title: 'First pedal strokes', description: 'Record your first ride.', icon: 'bike', eval: (c) => nth(c.rides, 1) },
  { id: 'rides-10', title: 'Regular', description: 'Ten rides recorded.', icon: 'bike', eval: (c) => nth(c.rides, 10) },
  { id: 'rides-50', title: 'Committed', description: 'Fifty rides recorded.', icon: 'bike', eval: (c) => nth(c.rides, 50) },
  { id: 'rides-100', title: 'Centurion', description: 'One hundred rides recorded.', icon: 'trophy', eval: (c) => nth(c.rides, 100) },
  { id: 'ftp-test', title: 'Know your numbers', description: 'Finish an FTP test.', icon: 'gauge', eval: (c) => first(c.rides, (r) => r.kind === 'ftp-test') },
  {
    id: 'ftp-up',
    title: 'Stronger',
    description: 'Raise your FTP.',
    icon: 'zap',
    eval: (c) => ({ at: c.ftp.find((f, i) => i > 0 && f.ftpW > c.ftp[i - 1]!.ftpW)?.date ?? null }),
  },
  { id: 'workout', title: 'By the book', description: 'Finish a structured workout.', icon: 'gauge', eval: (c) => first(c.rides, (r) => r.kind === 'workout') },
  { id: 'two-hours', title: 'Long haul', description: 'Ride for two hours in one go.', icon: 'mountain', eval: (c) => first(c.rides, (r) => r.movingS >= 7200) },
  { id: 'kj-1000', title: 'Thousand-kilojoule club', description: 'Do 1,000 kJ of work in one ride.', icon: 'flame', eval: (c) => first(c.rides, (r) => r.kj >= 1000) },
  { id: 'tss-100', title: 'Big day', description: 'Score 100 TSS in one ride.', icon: 'flame', eval: (c) => first(c.rides, (r) => (r.tss ?? 0) >= 100) },
  { id: 'sprint-1000', title: 'Four digits', description: 'Hit 1,000 W for 5 seconds.', icon: 'zap', eval: (c) => first(c.rides, (r) => best(r, 5) >= 1000) },
  { id: 'wkg-3', title: '3 W/kg', description: 'An FTP of 3 watts per kilogram.', icon: 'trophy', eval: (c) => wkgMilestone(c, 3) },
  { id: 'wkg-3.5', title: '3.5 W/kg', description: 'An FTP of 3.5 watts per kilogram.', icon: 'trophy', eval: (c) => wkgMilestone(c, 3.5) },
  { id: 'wkg-4', title: '4 W/kg', description: 'An FTP of 4 watts per kilogram.', icon: 'trophy', eval: (c) => wkgMilestone(c, 4) },
  { id: 'wkg-4.5', title: '4.5 W/kg', description: 'An FTP of 4.5 watts per kilogram.', icon: 'trophy', eval: (c) => wkgMilestone(c, 4.5) },
  { id: 'week-3', title: 'Three a week', description: 'Three rides within seven days.', icon: 'calendar', eval: (c) => ridesInAWeek(c.rides, 3) },
  { id: 'week-5', title: 'Five a week', description: 'Five rides within seven days.', icon: 'calendar', eval: (c) => ridesInAWeek(c.rides, 5) },
  { id: 'early-bird', title: 'Early bird', description: 'Start a ride before 6 am.', icon: 'sunrise', eval: (c) => first(c.rides, (r) => localHour(r, c.offset(r)) < 6 && localHour(r, c.offset(r)) >= 3) },
  { id: 'night-owl', title: 'Night owl', description: 'Start a ride after 9 pm.', icon: 'moon', eval: (c) => first(c.rides, (r) => localHour(r, c.offset(r)) >= 21) },
]

export function computeAchievements(input: { rides: readonly AchievementRide[]; ftp: readonly AchievementFtp[]; weightKg: number }): Achievement[] {
  const rides = input.rides.filter((r) => !r.simulated).sort((a, b) => a.startedAt - b.startedAt)
  const ftp = [...input.ftp].sort((a, b) => a.date - b.date)
  const ctx: Ctx = { rides, ftp, weightKg: input.weightKg, offset: (r) => r.utcOffsetMin ?? -new Date(r.startedAt).getTimezoneOffset() }
  return DEFS.map(({ eval: ev, ...def }) => {
    const r = ev(ctx)
    return { ...def, unlockedAt: r.at, ...(r.at === null && r.progress ? { progress: r.progress } : {}) }
  })
}

/** Day and week streaks in the rider's local time (offset in minutes east of UTC). */
export function computeStreaks(rides: readonly AchievementRide[], now: number, utcOffsetMin = -new Date(now).getTimezoneOffset()): Streaks {
  const dayOf = (t: number) => Math.floor((t + utcOffsetMin * 60_000) / DAY)
  const days = [...new Set(rides.filter((r) => !r.simulated).map((r) => dayOf(r.startedAt)))].sort((a, b) => a - b)
  const weekOf = (d: number) => Math.floor((d + 3) / 7) // day 0 (1970-01-01) was a Thursday: weeks start on Monday
  const weekCounts = new Map<number, number>()
  for (const r of rides) if (!r.simulated) weekCounts.set(weekOf(dayOf(r.startedAt)), (weekCounts.get(weekOf(dayOf(r.startedAt))) ?? 0) + 1)
  const weeks = [...weekCounts.entries()].filter(([, n]) => n >= 2).map(([w]) => w).sort((a, b) => a - b)

  const runs = (xs: number[]) => {
    let bestRun = 0
    let run = 0
    for (let i = 0; i < xs.length; i++) {
      run = i > 0 && xs[i] === xs[i - 1]! + 1 ? run + 1 : 1
      bestRun = Math.max(bestRun, run)
    }
    return { best: bestRun, last: run, lastValue: xs.at(-1) ?? null }
  }
  const today = dayOf(now)
  const d = runs(days)
  const w = runs(weeks)
  return {
    days: d.lastValue !== null && today - d.lastValue <= 1 ? d.last : 0,
    bestDays: d.best,
    weeks: w.lastValue !== null && weekOf(today) - w.lastValue <= 1 ? w.last : 0,
    bestWeeks: w.best,
  }
}
