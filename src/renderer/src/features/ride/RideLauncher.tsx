import { useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Bike, CircleCheck, CircleDashed, ListChecks, Mountain, Play, Search, Star, Timer, type LucideIcon } from 'lucide-react'
import { TIME_RIDE_MINUTES, TIME_RIDE_MAX, TIME_RIDE_MIN, timeRideWorkout, type TimeRideEffort } from '@core/workout/time-ride'
import { useFtp } from '../../db/use-athlete'
import { listRoutes, type RouteEntry } from '../../routes/routes-repo'
import { formatKm, formatMetres } from '../../routes/format'
import { useDevices } from '../../stores/devices'
import { useSettings } from '../../stores/settings'
import { Button } from '../../ui/Button'
import { cn } from '../../ui/cn'
import { NumberInput, Switch } from '../../ui/form'
import { formatDuration } from '../../ui/format'
import { PageHeader } from '../../ui/PageHeader'
import { Segmented } from '../../ui/Segmented'
import { loadLibrary, type LibraryEntry } from '../../workouts/library'
import { Notice, type NoticeMessage } from '../builder/Notice'
import { RouteDetailDialog } from '../routes/RouteDetailDialog'
import { WorkoutDetailDialog } from '../workouts/WorkoutDetailDialog'
import { startWorkout } from '../workouts/start'
import { FtpResultCard } from './FtpResultCard'
import { SavedRideCard } from './SavedRideCard'
import { chooseRide, type RideChoice } from './setup'

const CHOICES: { id: RideChoice; title: string; text: string; icon: LucideIcon }[] = [
  { id: 'time', title: 'Ride for time', text: 'Pick how long. The trainer holds your watts, or you set the pace.', icon: Timer },
  { id: 'free', title: 'Free ride', text: 'No plan and no clock. ERG, level, slope or heart rate, changed any time.', icon: Bike },
  { id: 'route', title: 'Route', text: 'Ride a real road in slope mode, at your own pace or racing a past effort.', icon: Mountain },
  { id: 'workout', title: 'Workout', text: 'Structured intervals sized to your FTP, FTP tests included.', icon: ListChecks },
]

/**
 * The Ride tab with no ride on: pick what kind of ride first, then set it up.
 * Keeps the first screen to four choices instead of every control at once.
 */
export function RideLauncher({ choice }: { choice: RideChoice | null }) {
  const current = CHOICES.find((c) => c.id === choice) ?? null
  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 pb-12" data-testid="ride-launcher">
      <PageHeader
        title={current ? current.title : 'What are we riding?'}
        subtitle={current ? current.text : 'Pick a kind of ride. You can set it up on the next step.'}
        actions={
          current && (
            <Button variant="ghost" size="sm" onClick={() => chooseRide(null)} data-testid="change-ride">
              <ArrowLeft className="size-3.5" /> Change ride type
            </Button>
          )
        }
      />
      <div className="mb-4 space-y-3">
        <FtpResultCard />
        <SavedRideCard />
        <Readiness />
      </div>
      {current ? (
        <div className="rounded-2xl border border-line bg-panel p-5">
          {choice === 'time' && <TimeSetup />}
          {choice === 'route' && <RoutePicker />}
          {choice === 'workout' && <WorkoutPicker />}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Kind of ride">
          {CHOICES.map(({ id, title, text, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => chooseRide(id)}
              data-testid={`ride-choice-${id}`}
              className="no-drag group flex items-start gap-4 rounded-2xl border border-line bg-panel p-5 text-left transition-colors hover:border-accent hover:bg-panel-2"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent group-hover:bg-accent group-hover:text-on-accent">
                <Icon className="size-6" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-xl font-semibold">{title}</span>
                <span className="mt-1 block text-sm text-ink-dim">{text}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Is the trainer (and heart rate) connected: the one thing that trips people up before a ride. */
function Readiness() {
  const trainer = useDevices((s) => s.devices.find((d) => d.role === 'trainer' && d.state === 'connected'))
  const hr = useDevices((s) => s.devices.find((d) => d.role === 'hr' && d.state === 'connected'))
  const item = (label: string, name: string | undefined, required: boolean) => (
    <span className="flex items-center gap-1.5">
      {name ? <CircleCheck className="size-4 text-good" aria-hidden /> : <CircleDashed className={cn('size-4', required ? 'text-warn' : 'text-ink-faint')} aria-hidden />}
      <span className="text-ink-dim">{label}:</span> <span className={name ? 'text-ink' : 'text-ink-faint'}>{name ?? 'not connected'}</span>
    </span>
  )
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-panel px-5 py-3 text-sm" data-testid="ride-readiness">
      {item('Trainer', trainer?.name, true)}
      {item('Heart rate', hr?.name, false)}
      {!trainer && (
        <Button asChild size="sm" className="ml-auto">
          <Link to="/devices">Connect devices</Link>
        </Button>
      )}
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-b border-line py-4 first:pt-0 last:border-b-0 last:pb-0 sm:grid-cols-[180px_1fr] sm:gap-6">
      <div className="text-sm font-semibold">
        <span className="mr-2 font-display text-ink-faint">{n}</span>
        {title}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

const PACES = [
  { label: 'Easy', pct: 0.55 },
  { label: 'Endurance', pct: 0.65 },
  { label: 'Tempo', pct: 0.8 },
  { label: 'Sweet spot', pct: 0.9 },
] as const

function TimeSetup() {
  const { ftpW } = useFtp()
  const [minutes, setMinutes] = useState<number>(45)
  const [custom, setCustom] = useState<number | null>(null)
  const [effort, setEffort] = useState<'erg' | 'free'>('erg')
  const [watts, setWatts] = useState<number | null>(null)
  const [ease, setEase] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const length = custom ?? minutes
  const target = watts ?? Math.round(ftpW * 0.65)
  const valid = length >= TIME_RIDE_MIN && length <= TIME_RIDE_MAX && (effort === 'free' || target >= 30)
  // hours × IF² × 100, for a steady ride (the ease in and out makes it a little lower)
  const tss = effort === 'erg' && valid ? Math.round((length / 60) * (target / ftpW) ** 2 * 100) : null

  const start = async () => {
    setError(null)
    setBusy(true)
    try {
      const e: TimeRideEffort = effort === 'erg' ? { kind: 'erg', watts: target } : { kind: 'free' }
      await startWorkout(timeRideWorkout({ minutes: length, effort: e, ease: effort === 'erg' && ease }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="time-setup">
      <Step n={1} title="How long">
        <div className="flex flex-wrap items-center gap-2">
          {TIME_RIDE_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={custom === null && minutes === m}
              onClick={() => {
                setMinutes(m)
                setCustom(null)
              }}
              className={cn(
                'no-drag rounded-lg border px-3.5 py-1.5 font-display text-base font-semibold tabular transition-colors',
                custom === null && minutes === m ? 'border-accent bg-accent text-on-accent' : 'border-line bg-panel-2 hover:border-line-strong',
              )}
            >
              {m} min
            </button>
          ))}
          <NumberInput aria-label="Minutes" placeholder="Other" value={custom} onChange={setCustom} min={TIME_RIDE_MIN} max={TIME_RIDE_MAX} unit="min" />
        </div>
      </Step>
      <Step n={2} title="Effort">
        <Segmented
          ariaLabel="Effort"
          value={effort}
          onChange={setEffort}
          options={[
            { value: 'erg', label: 'Trainer holds watts', hint: 'ERG: the trainer sets the resistance so you ride a steady wattage' },
            { value: 'free', label: 'My own pace', hint: 'No target: shift gears and ride how you like' },
          ]}
        />
        {effort === 'erg' ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {PACES.map((p) => {
                const w = Math.round(ftpW * p.pct)
                return (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={target === w}
                    onClick={() => setWatts(w)}
                    className={cn('no-drag rounded-lg border px-3 py-1.5 text-sm transition-colors', target === w ? 'border-accent bg-accent/10 text-ink' : 'border-line bg-panel-2 text-ink-dim hover:text-ink')}
                  >
                    {p.label} <span className="tabular text-ink-faint">{w} W</span>
                  </button>
                )
              })}
              <NumberInput aria-label="Watts" value={target} onChange={setWatts} min={30} max={2000} unit="W" />
            </div>
            <Switch checked={ease} onChange={setEase} label="Ease in and out (5 minutes each, inside the time)" />
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-dim">The trainer starts on a light, flat setting. Switch to level or slope on the ride screen.</p>
        )}
      </Step>
      <Step n={3} title="Ride">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary" size="lg" disabled={!valid || busy} onClick={() => void start()} data-testid="start-time-ride">
            <Play className="size-4 fill-current" /> Start {length}-minute ride
          </Button>
          <span className="text-sm text-ink-dim">
            {effort === 'erg' ? `${target} W is ${Math.round((target / ftpW) * 100)} % of your FTP (${ftpW} W)` : 'Your pace, your gears'}
            {tss !== null && ` · about ${tss} TSS`}
          </span>
        </div>
        {!valid && <p className="mt-2 text-sm text-bad">Pick between {TIME_RIDE_MIN} and {TIME_RIDE_MAX} minutes.</p>}
        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      </Step>
    </div>
  )
}

const SHOWN = 8

/** Search box plus the first few matches; the full library is a link away. */
function useFiltered<T>(items: readonly T[] | undefined, text: (t: T) => string, query: string): T[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase()
    return (items ?? []).filter((i) => !q || text(i).toLowerCase().includes(q))
  }, [items, text, query])
}

function PickerSearch({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 focus-within:border-accent">
      <Search className="size-4 text-ink-faint" aria-hidden />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} aria-label={label} className="no-drag h-full min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none" />
    </label>
  )
}

function Row({ onClick, title, meta, star, testId }: { onClick: () => void; title: string; meta: string; star?: boolean; testId?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} className="no-drag flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left hover:border-line hover:bg-panel-2">
      <span className="min-w-0 flex-1 truncate font-medium">
        {star && <Star className="mr-1.5 inline size-3.5 fill-current align-[-2px] text-warn" aria-label="Favourite" />}
        {title}
      </span>
      <span className="shrink-0 text-sm tabular text-ink-dim">{meta}</span>
    </button>
  )
}

const routeText = (r: RouteEntry) => r.name
const workoutText = (e: LibraryEntry) => `${e.workout.name} ${e.workout.tags.join(' ')}`

function RoutePicker() {
  const routes = useLiveQuery(() => listRoutes(), [])
  const units = useSettings((s) => s.units)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<RouteEntry | null>(null)
  const [notice, setNotice] = useState<NoticeMessage | null>(null)
  const shown = useFiltered(routes, routeText, query)
  return (
    <div data-testid="route-picker">
      {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}
      <PickerSearch value={query} onChange={setQuery} label="Search routes" />
      <div className="mt-2">
        {shown.slice(0, SHOWN).map((r) => (
          <Row key={r.id} onClick={() => setOpen(r)} title={r.name} meta={`${formatKm(r.distanceM, 1, units)} · ↑ ${formatMetres(r.elevationGainM, units)}`} testId={`pick-route-${r.id}`} />
        ))}
        {routes && shown.length === 0 && <p className="px-3 py-2 text-sm text-ink-faint">No routes match.</p>}
      </div>
      <div className="mt-3 text-sm">
        <Link to="/routes" className="text-accent underline">
          All routes, and importing a GPX
        </Link>
      </div>
      {open && <RouteDetailDialog entry={open} onClose={() => setOpen(null)} onNotice={setNotice} />}
    </div>
  )
}

type WorkoutFilter = 'all' | 'favorites' | 'tests'

function WorkoutPicker() {
  const { ftpW } = useFtp()
  const library = useLiveQuery(() => loadLibrary(ftpW), [ftpW])
  const [filter, setFilter] = useState<WorkoutFilter>('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<LibraryEntry | null>(null)
  const [notice, setNotice] = useState<NoticeMessage | null>(null)
  const pool = useMemo(() => {
    const all = library ?? []
    const byFilter = filter === 'favorites' ? all.filter((e) => e.favorite) : filter === 'tests' ? all.filter((e) => e.workout.ftpTest) : all
    // favourites first, then everyday workouts, FTP tests last (they have their own filter)
    const rank = (e: LibraryEntry) => (e.favorite ? 0 : e.workout.ftpTest ? 2 : 1)
    return [...byFilter].sort((a, b) => rank(a) - rank(b))
  }, [library, filter])
  const shown = useFiltered(pool, workoutText, query)
  return (
    <div data-testid="workout-picker">
      {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'favorites', label: 'Favourites' },
            { value: 'tests', label: 'FTP tests' },
          ]}
        />
        <div className="min-w-48 flex-1">
          <PickerSearch value={query} onChange={setQuery} label="Search workouts" />
        </div>
      </div>
      <div className="mt-2">
        {shown.slice(0, SHOWN).map((e) => (
          <Row
            key={e.workout.id}
            onClick={() => setOpen(e)}
            title={e.workout.name}
            star={e.favorite}
            meta={`${formatDuration(e.stats.durationS)}${e.stats.tss !== null ? ` · ${Math.round(e.stats.tss)} TSS` : ''}`}
            testId={`pick-workout-${e.workout.id}`}
          />
        ))}
        {library && shown.length === 0 && <p className="px-3 py-2 text-sm text-ink-faint">{filter === 'favorites' && !query ? 'No favourites yet: star workouts in the library.' : 'No workouts match.'}</p>}
      </div>
      <div className="mt-3 text-sm">
        <Link to="/workouts" className="text-accent underline">
          The full workout library
        </Link>
        <span className="text-ink-faint"> · or </span>
        <Link to="/builder" className="text-accent underline">
          build your own
        </Link>
      </div>
      {open && <WorkoutDetailDialog entry={open} ftpW={ftpW} onClose={() => setOpen(null)} onNotice={setNotice} />}
    </div>
  )
}
