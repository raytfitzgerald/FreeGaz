import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Battery, BatteryLow, BatteryMedium, Bike, Calendar, Flame, Gauge, ListChecks, Moon, Mountain, Sunrise, Trophy, Zap, type LucideIcon } from 'lucide-react'
import { computeAchievements, computeStreaks, type AchievementIcon, type AchievementRide } from '@core/metrics/achievements'
import { suggestNextWorkout } from '@core/workout/suggest'
import { BUILTINS } from '../../workouts/library'
import type { InvokeRes } from '@shared/ipc/contract'
import { currentProfile, DEFAULT_WEIGHT_KG, ftpHistory } from '../../db/athlete-repo'
import { db } from '../../db/db'
import { pmcSeries, powerCurve, weeklyLoad } from '../../db/fitness'
import { PageHeader } from '../../ui/PageHeader'
import { cn } from '../../ui/cn'
import { formatDate, formatDurationShort } from '../../ui/format'
import { useNow } from '../../ui/useNow'

const QUICK_START = [
  { to: '/ride', search: undefined, title: 'Just ride', text: 'ERG, level or slope. No plan, just watts.', icon: Bike },
  { to: '/workouts', search: undefined, title: 'Workouts', text: 'Structured intervals, scaled to your FTP.', icon: ListChecks },
  { to: '/workouts', search: { filter: 'tests' }, title: 'FTP test', text: '20-minute, ramp or 8-minute. Saves your FTP.', icon: Gauge },
  { to: '/routes', search: undefined, title: 'Routes', text: 'Ride a GPX in SIM mode: Reactive or Steady.', icon: Mountain },
] as const

const ICONS: Record<AchievementIcon, LucideIcon> = { bike: Bike, flame: Flame, zap: Zap, mountain: Mountain, trophy: Trophy, sunrise: Sunrise, moon: Moon, gauge: Gauge, calendar: Calendar }
const RETEST_DAYS = 42
const DAY = 86_400_000

export function HomePage() {
  const [info, setInfo] = useState<InvokeRes<'app.info'> | null>(null)
  const now = useNow()
  useEffect(() => {
    let alive = true
    void window.freegaz.invoke('app.info', {}).then((i) => {
      if (alive) setInfo(i)
    })
    return () => {
      alive = false
    }
  }, [])

  const data = useLiveQuery(async () => {
    const [rides, ftp, profile, pmc, week, curve] = await Promise.all([db().rides.toArray(), ftpHistory(), currentProfile(), pmcSeries(1), weeklyLoad(1), powerCurve()])
    const eftpW = curve.eftp.method === 'cp' ? Math.round(curve.eftp.ftpW) : null
    return { rides, ftp, weightKg: profile?.weightKg ?? DEFAULT_WEIGHT_KG, today: pmc.at(-1) ?? null, week: week.at(-1) ?? null, eftpW }
  }, [])

  const derived = useMemo(() => {
    if (!data) return null
    const rides: AchievementRide[] = data.rides.map((r) => ({ startedAt: r.startedAt, movingS: r.movingS, kj: r.kj, tss: r.tss, kind: r.kind, simulated: r.simulated, mmp: r.mmp }))
    const achievements = computeAchievements({ rides, ftp: data.ftp, weightKg: data.weightKg })
    const lastRide = [...data.rides].filter((r) => !r.simulated).sort((a, b) => b.startedAt - a.startedAt)[0] ?? null
    const real = data.rides.filter((r) => !r.simulated)
    const lastTestRow = [...data.ftp].reverse().find((f) => f.source.startsWith('test'))
    const suggestion = suggestNextWorkout({
      hasFtp: data.ftp.length > 0,
      daysSinceTest: lastTestRow ? (now - lastTestRow.date) / DAY : null,
      tsb: data.today?.tsb ?? null,
      lastRpe: lastRide?.rpe ?? null,
      hardRidesLast7: real.filter((r) => now - r.startedAt < 7 * DAY && ((r.intensityFactor ?? 0) >= 0.85 || (r.tss ?? 0) >= 80)).length,
      hoursSinceLastRide: lastRide ? (now - lastRide.endedAt) / 3_600_000 : null,
    })
    return { achievements, streaks: computeStreaks(rides, now), lastRide, suggestion, suggested: BUILTINS.find((w) => w.id === suggestion.workoutId) ?? null }
  }, [data, now])

  const ftpNow = data?.ftp.at(-1) ?? null
  const lastTest = data ? [...data.ftp].reverse().find((f) => f.source.startsWith('test')) : undefined
  const testAge = lastTest ? Math.floor((now - lastTest.date) / DAY) : null
  const unlocked = derived?.achievements.filter((a) => a.unlockedAt !== null).sort((a, b) => b.unlockedAt! - a.unlockedAt!) ?? []
  const locked = derived?.achievements.filter((a) => a.unlockedAt === null) ?? []

  return (
    <div className="mx-auto max-w-6xl px-8 pb-10">
      <PageHeader title="Ready to suffer?" subtitle="Pick your poison. Everything is recorded locally, second by second." />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {QUICK_START.map(({ to, search, title, text, icon: Icon }) => (
          <Link key={title} to={to} search={search} className="group rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-line-strong hover:bg-panel-2">
            <Icon className="mb-6 size-6 text-accent" aria-hidden />
            <div className="font-display text-lg font-semibold">{title}</div>
            <p className="mt-1 text-sm text-ink-dim">{text}</p>
          </Link>
        ))}
      </section>

      <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Your numbers">
        <Stat
          label="FTP"
          value={ftpNow ? `${ftpNow.ftpW} W` : '—'}
          sub={ftpNow ? `${(ftpNow.ftpW / (ftpNow.weightKg ?? data!.weightKg)).toFixed(2)} W/kg` : 'Not set yet'}
          note={
            ftpNow && data?.eftpW && data.eftpW > ftpNow.ftpW * 1.05
              ? `Your rides suggest about ${data.eftpW} W: time to retest?`
              : testAge === null
                ? 'No test yet: try the ramp test'
                : testAge > RETEST_DAYS
                  ? `Tested ${testAge} days ago: time to retest`
                  : `Tested ${testAge === 0 ? 'today' : `${testAge} day${testAge === 1 ? '' : 's'} ago`}`
          }
          to="/workouts"
          search={{ filter: 'tests' }}
        />
        <FormCard ctl={data?.today?.ctl ?? null} atl={data?.today?.atl ?? null} tsb={data?.today?.tsb ?? null} />
        <Stat
          label="This week"
          value={data?.week ? `${Math.round(data.week.tss)} TSS` : '—'}
          sub={data?.week ? `${data.week.rides} ride${data.week.rides === 1 ? '' : 's'} · ${formatDurationShort(data.week.hours * 3600)} · ${Math.round(data.week.kj)} kJ` : undefined}
          to="/fitness"
        />
        <Stat
          label="Streak"
          value={derived ? `${derived.streaks.days} day${derived.streaks.days === 1 ? '' : 's'}` : '—'}
          sub={derived ? `${derived.streaks.weeks} week${derived.streaks.weeks === 1 ? '' : 's'} of 2+ rides` : undefined}
          note={derived ? `Best: ${derived.streaks.bestDays} days, ${derived.streaks.bestWeeks} weeks` : undefined}
        />
      </section>

      {derived?.suggested && (
        <Link
          to="/workouts"
          search={{ open: derived.suggested.id }}
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/5 px-5 py-3 text-sm hover:bg-accent/10"
          data-testid="suggested-workout"
        >
          <span>
            <span className="eyebrow text-ink-faint">Suggested next · </span>
            <span className="font-semibold">{derived.suggested.name}</span>
            <span className="text-ink-dim"> · {derived.suggestion.reason}</span>
          </span>
          <span className="text-accent">Open →</span>
        </Link>
      )}

      {derived?.lastRide && (
        <Link
          to="/history/$rideId"
          params={{ rideId: derived.lastRide.id }}
          className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border border-line bg-panel px-5 py-3 text-sm hover:bg-panel-2"
        >
          <span className="font-semibold">Last ride: {derived.lastRide.name}</span>
          <span className="text-ink-dim">{formatDate(derived.lastRide.startedAt)}</span>
          <span className="tabular text-ink-dim">{formatDurationShort(derived.lastRide.movingS)}</span>
          {derived.lastRide.np !== null && <span className="tabular text-ink-dim">NP {derived.lastRide.np} W</span>}
          {derived.lastRide.tss !== null && <span className="tabular text-ink-dim">TSS {Math.round(derived.lastRide.tss)}</span>}
        </Link>
      )}

      {derived && (
        <section className="mt-8" aria-label="Achievements">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold">Achievements</h2>
            <span className="text-sm text-ink-dim">
              {unlocked.length} of {derived.achievements.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" data-testid="achievements">
            {[...unlocked, ...locked].map((a) => {
              const Icon = ICONS[a.icon]
              const done = a.unlockedAt !== null
              return (
                <div key={a.id} className={cn('flex items-start gap-3 rounded-xl border px-4 py-3', done ? 'border-accent/40 bg-accent/5' : 'border-line bg-panel opacity-70')}>
                  <Icon className={cn('mt-0.5 size-5 shrink-0', done ? 'text-accent' : 'text-ink-faint')} aria-hidden />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{a.title}</div>
                    <div className="text-xs text-ink-dim">{a.description}</div>
                    {done ? (
                      <div className="mt-1 text-[11px] text-ink-faint">Earned {formatDate(a.unlockedAt!)}</div>
                    ) : a.progress ? (
                      <div className="mt-1.5 flex items-center gap-2" aria-label={`${a.progress.value} of ${a.progress.target}`}>
                        <div className="h-1.5 flex-1 rounded-full bg-panel-3">
                          <div className="h-1.5 rounded-full bg-accent/70" style={{ width: `${Math.min(100, (a.progress.value / a.progress.target) * 100)}%` }} />
                        </div>
                        <span className="tabular text-[11px] text-ink-faint">
                          {a.progress.value}/{a.progress.target}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <footer className="mt-10 text-xs text-ink-faint" data-testid="app-info">
        {info ? `FreeGaz ${info.version} · Electron ${info.electron} · Chrome ${info.chrome}` : 'Loading...'}
      </footer>
    </div>
  )
}

function Stat({ label, value, sub, note, to, search }: { label: string; value: string; sub?: string; note?: string; to?: '/workouts' | '/fitness'; search?: { filter: string } }) {
  const body = (
    <>
      <div className="eyebrow text-ink-faint">{label}</div>
      <div className="tabular mt-1 font-display text-3xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-sm text-ink-dim">{sub}</div>}
      {note && <div className="mt-2 text-xs text-ink-faint">{note}</div>}
    </>
  )
  const cls = 'rounded-2xl border border-line bg-panel px-5 py-4'
  return to ? (
    <Link to={to} search={search} className={cn(cls, 'hover:bg-panel-2')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** Fitness (CTL), fatigue (ATL) and form (TSB) today; form carries an icon and a label, not just a colour. */
function FormCard({ ctl, atl, tsb }: { ctl: number | null; atl: number | null; tsb: number | null }) {
  const [Icon, label, tone] =
    tsb === null ? [Battery, 'No data yet', 'text-ink-faint'] : tsb > 5 ? [Battery, 'Fresh', 'text-good'] : tsb >= -10 ? [BatteryMedium, 'Neutral', 'text-ink-dim'] : tsb >= -30 ? [BatteryMedium, 'Training hard', 'text-warn'] : [BatteryLow, 'Very tired', 'text-bad']
  return (
    <Link to="/fitness" className="rounded-2xl border border-line bg-panel px-5 py-4 hover:bg-panel-2">
      <div className="eyebrow text-ink-faint">Form</div>
      <div className="tabular mt-1 font-display text-3xl font-bold">{tsb === null ? '—' : `${tsb > 0 ? '+' : ''}${Math.round(tsb)}`}</div>
      <div className={cn('mt-1 flex items-center gap-1.5 text-sm', tone)}>
        <Icon className="size-4" /> {label}
      </div>
      <div className="tabular mt-2 text-xs text-ink-faint">
        Fitness {ctl === null ? '—' : Math.round(ctl)} · Fatigue {atl === null ? '—' : Math.round(atl)}
      </div>
    </Link>
  )
}
