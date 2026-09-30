import { useEffect, useReducer } from 'react'
import { CheckCircle2, Ghost, Minus, Pause, Plus, TrendingDown, TrendingUp } from 'lucide-react'
import { isRouteTick, type RoutePlan, type RoutePlayback, type RouteProgress } from '@core/ride/route-plan'
import { getRuntime } from '../../runtime/composition'
import { useLive } from '../../stores/live'
import { useRide } from '../../stores/ride'
import { Button } from '../../ui/Button'
import { MetricTile } from '../../ui/MetricTile'
import { Segmented } from '../../ui/Segmented'
import { cn } from '../../ui/cn'
import { formatDuration } from '../../ui/format'
import { formatGapM, formatGapS, formatKm, kmh } from '../../routes/format'
import { useActiveRoutePlan } from '../../routes/active'
import { distanceUnit, displayElevation, elevationUnit, speedUnit } from '@core/units'
import { useSettings } from '../../stores/settings'
import { formatGrade, gradeClass, gradeVar } from '../../routes/grade'
import { ElevationChart } from '../routes/ElevationChart'
import { GradeLegend } from '../routes/GradeLegend'
import { RouteOutline } from '../routes/RouteOutline'
import { CueBanner } from './CueBanner'
import { RecordingBar } from './RecordingBar'

type TrainerControl = 'sim' | 'resistance' | 'erg'

const PLAYBACK = [
  { value: 'reactive' as const, label: 'Reactive', hint: 'Your watts set your speed (S to switch)' },
  { value: 'steady' as const, label: 'Steady', hint: 'The route rolls at its own pace; the gradient still arrives (S to switch)' },
]
const TRAINER = [
  { value: 'sim' as const, label: 'Route', hint: 'The trainer follows the route’s gradient' },
  { value: 'resistance' as const, label: 'Level', hint: 'A fixed resistance while the route plays (↑/↓ to change)' },
  { value: 'erg' as const, label: 'ERG', hint: 'Hold a wattage while the route plays (↑/↓ to change)' },
]
const NUDGE: Record<Exclude<TrainerControl, 'sim'>, { small: number; big: number; unit: string }> = {
  resistance: { small: 5, big: 10, unit: '%' },
  erg: { small: 5, big: 25, unit: 'W' },
}
/** The strip shows this far ahead, and a little of the road behind. */
const AHEAD_M = 2000
const BEHIND_M = 150

const command = (cmd: Parameters<ReturnType<typeof getRuntime>['rides']['command']>[0]) => getRuntime().rides.command(cmd)

/** The in-ride HUD for routes: the road ahead, where you are, and the numbers. */
export function RouteRideView() {
  const plan = useActiveRoutePlan()
  const units = useSettings((s) => s.units)
  const tick = useRide((s) => (isRouteTick(s.plan) ? s.plan : null))
  const name = useRide((s) => s.snapshot?.name ?? '')
  // Mode switches apply to the plan at once; re-render now instead of on the next engine tick.
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const control: TrainerControl = plan?.trainerOverride?.mode ?? 'sim'
  useRouteHotkeys(plan, control, refresh)

  if (!plan || !tick) return null
  const r = tick.route
  const switchPlayback = (m: RoutePlayback) => {
    command({ type: 'routeMode', mode: m })
    refresh()
  }
  const switchTrainer = (m: TrainerControl) => {
    command({ type: 'mode', mode: m })
    refresh()
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-8 pb-10 pt-14" data-testid="route-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{name}</h1>
          <div className="tabular text-sm text-ink-dim" data-testid="route-progress">
            {tick.segmentLabel}
            {r.laps > 1 && tick.segmentKind !== 'lap' ? ` · ${r.laps} laps` : ''} · {formatDuration(r.elapsedS)} ridden
            {r.etaS !== null && !r.finished && ` · about ${formatDuration(r.etaS)} to go`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented ariaLabel="Route playback" value={plan.playbackMode} onChange={switchPlayback} options={PLAYBACK.map((o) => ({ ...o, disabled: r.finished }))} />
          <Segmented ariaLabel="Trainer control" value={control} onChange={switchTrainer} options={TRAINER} />
          {control !== 'sim' && <Nudge control={control} plan={plan} onChange={refresh} />}
        </div>
      </div>

      <CueBanner />
      {r.finished && (
        <div className="flex items-center gap-3 rounded-2xl border border-good/40 bg-good/5 px-5 py-3 text-sm" role="status" data-testid="route-complete">
          <CheckCircle2 className="size-4 text-good" /> Route complete. The trainer is on a flat road now: spin easy as long as you like, then press Finish to save.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <SpeedTile r={r} />
        <GradeTile r={r} />
        <PowerTile />
      </div>

      <div className="rounded-2xl border border-line bg-panel p-4" data-testid="route-strip">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-medium uppercase tracking-wider text-ink-faint">
            {r.finished ? 'The last of the route' : `The next ${formatKm(Math.min(AHEAD_M, r.remainingM), 1, units)} ${distanceUnit(units)}`}
          </div>
          <GradeLegend />
        </div>
        <ElevationChart
          route={plan.route}
          laps={r.laps}
          fromX={Math.max(0, r.riddenM - BEHIND_M)}
          toX={Math.min(r.totalM, Math.max(r.riddenM, 0) + AHEAD_M)}
          rider={r.riddenM}
          ghost={r.ghost ? r.riddenM - r.ghost.gapM : null}
          doneBefore={r.riddenM}
          axis="ahead"
          minSpanM={20}
          height={170}
          title="Elevation of the road ahead, coloured by grade, with your position"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="rounded-2xl border border-line bg-panel p-2">
          <RouteOutline route={plan.route} rider={{ lat: r.lat, lon: r.lon }} ghost={r.ghost} height={200} title="Route outline with your position" testId="route-map" />
        </div>
        <div className="rounded-2xl border border-line bg-panel p-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-ink-faint">Whole route{r.laps > 1 ? ` · ${r.laps} laps` : ''}</div>
          <ElevationChart
            route={plan.route}
            laps={r.laps}
            rider={r.riddenM}
            ghost={r.ghost ? r.riddenM - r.ghost.gapM : null}
            doneBefore={r.riddenM}
            height={168}
            title="Whole route elevation profile with your position"
            testId="route-overview"
          />
        </div>
      </div>

      <SecondaryTiles r={r} plan={plan} />
      <RecordingBar />
    </div>
  )
}

function SpeedTile({ r }: { r: RouteProgress }) {
  const units = useSettings((s) => s.units)
  const avg = r.elapsedS > 5 ? r.riddenM / r.elapsedS : null
  return (
    <MetricTile
      label={r.mode === 'steady' ? 'Speed · route pace' : 'Speed'}
      value={kmh(r.speedMps, units)}
      unit={speedUnit(units)}
      size="xl"
      accent="var(--color-speed)"
      testId="route-speed"
      sub={avg !== null ? `Average ${kmh(avg, units)} ${speedUnit(units)}` : undefined}
    />
  )
}

function GradeTile({ r }: { r: RouteProgress }) {
  const sent = useLive((f) => f.trainer.gradePct)
  const raw = useLive((f) => f.trainer.rawGradePct)
  const mode = useLive((f) => f.trainer.mode)
  const level = useLive((f) => f.trainer.resistancePct)
  const target = useLive((f) => f.trainer.targetW)
  const connected = useLive((f) => f.trainer.connected)
  let trainer: string
  if (!connected) trainer = 'No trainer connected'
  else if (r.override?.mode === 'resistance') trainer = `Trainer at level ${level ?? r.override.pct} %`
  else if (r.override?.mode === 'erg') trainer = `Trainer holding ${target ?? r.override.watts} W`
  else trainer = mode === 'sim' && sent !== null ? `Trainer feels ${formatGrade(sent)}${raw !== null && Math.abs(raw - sent) >= 0.05 ? ' (slope scaling)' : ''}` : 'Trainer: waiting'
  const g = formatGrade(r.gradePct)
  return (
    <MetricTile
      label="Grade"
      value={g === '—' ? null : g.replace(' %', '')}
      unit="%"
      size="xl"
      accent={gradeVar(gradeClass(r.gradePct))}
      testId="route-grade"
      sub={<span data-testid="route-grade-sent">{trainer}</span>}
    />
  )
}

function PowerTile() {
  const p3 = useLive((f) => f.power3s)
  const np = useRide((s) => s.snapshot?.np ?? null)
  return <MetricTile label="Power · 3 s" value={p3} unit="W" size="xl" accent="var(--color-power)" testId="power" sub={np !== null ? `NP ${np} W` : undefined} />
}

function SecondaryTiles({ r, plan }: { r: RouteProgress; plan: RoutePlan }) {
  const hr = useLive((f) => f.hr)
  const cadence = useLive((f) => f.cadence)
  const units = useSettings((s) => s.units)
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <MetricTile label="Distance" value={formatKm(r.riddenM, 2, units)} unit={distanceUnit(units)} size="md" testId="route-distance" sub={`${formatKm(r.remainingM, 2, units)} ${distanceUnit(units)} to go`} />
      <MetricTile label="Climbed" value={Math.round(displayElevation(r.gainedM, units))} unit={elevationUnit(units)} size="md" testId="route-climbed" sub={`${Math.round(displayElevation(r.remainingGainM, units))} ${elevationUnit(units)} to go`} />
      <MetricTile
        label="Time to go"
        value={r.finished ? formatDuration(0) : r.etaS === null ? null : formatDuration(r.etaS)}
        size="md"
        testId="route-eta"
        sub={r.mode === 'steady' ? 'At the route’s pace' : 'At your last 30 s of power'}
      />
      <GhostTile r={r} plan={plan} />
      <MetricTile label="Heart rate" value={hr} unit="bpm" size="md" accent="var(--color-hr)" testId="hr" />
      <MetricTile label="Cadence" value={cadence === null ? null : Math.round(cadence)} unit="rpm" size="md" accent="var(--color-cadence)" testId="cadence" />
    </div>
  )
}

/** The gap to the ghost: ± seconds and metres, with an icon and a word, never colour alone. */
function GhostTile({ r, plan }: { r: RouteProgress; plan: RoutePlan }) {
  const units = useSettings((s) => s.units)
  if (!r.challenge) {
    return <MetricTile label="Elevation" value={Math.round(displayElevation(r.ele, units))} unit={elevationUnit(units)} size="md" testId="route-elevation" sub={r.laps > 1 ? `Lap ${Math.min(r.lap + 1, r.laps)} of ${r.laps}` : undefined} />
  }
  const g = r.ghost
  if (!g) {
    return (
      <div className="flex flex-col rounded-2xl border border-line bg-panel px-5 py-4" data-testid="ghost-gap">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-ink-faint">
          <Ghost className="size-3.5" aria-hidden /> Ghost
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-sm text-ink-dim">
          <Pause className="size-3.5" aria-hidden /> Race paused while Steady
        </div>
      </div>
    )
  }
  // The time gap decides: at the finish both are on the line (0 m apart) but seconds apart.
  const ahead = g.gapS > 0 || (g.gapS === 0 && g.gapM >= 0)
  const Icon = ahead ? TrendingUp : TrendingDown
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-panel px-5 py-4" data-testid="ghost-gap">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-ink-faint" title={plan.ghostLabel ?? undefined}>
          <Ghost className="size-3.5" aria-hidden /> Ghost
        </div>
        <span className={cn('flex items-center gap-1 text-xs font-medium', ahead ? 'text-good' : 'text-warn')} data-testid="ghost-status">
          <Icon className="size-3.5" aria-hidden /> {r.finished ? (ahead ? 'You won' : 'Ghost won') : ahead ? 'Ahead' : 'Behind'}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="tabular font-display text-4xl font-bold leading-none" data-testid="ghost-gap-s">
          {formatGapS(g.gapS)}
        </span>
      </div>
      <div className="tabular mt-2 text-xs text-ink-dim" data-testid="ghost-gap-m">
        {r.finished ? 'Final gap' : formatGapM(g.gapM, units)} · {plan.ghostLabel ?? 'your ghost'}
      </div>
    </div>
  )
}

function Nudge({ control, plan, onChange }: { control: Exclude<TrainerControl, 'sim'>; plan: RoutePlan; onChange: () => void }) {
  const n = NUDGE[control]
  const o = plan.trainerOverride
  const value = o?.mode === 'resistance' ? o.pct : o?.mode === 'erg' ? o.watts : null
  const nudge = (delta: number) => {
    command({ type: 'nudge', delta })
    onChange()
  }
  return (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-panel px-1.5 py-1" title={control === 'resistance' ? 'Resistance level (↑/↓)' : 'ERG watts (↑/↓, Shift for 25 W)'}>
      <Button size="iconSm" variant="ghost" aria-label="Easier" onClick={() => nudge(-n.small)}>
        <Minus className="size-4" />
      </Button>
      <span className="tabular w-16 text-center text-sm font-semibold" data-testid="route-override-value">
        {value ?? '—'} {n.unit}
      </span>
      <Button size="iconSm" variant="ghost" aria-label="Harder" onClick={() => nudge(n.small)}>
        <Plus className="size-4" />
      </Button>
    </div>
  )
}

/** S switches Reactive/Steady, M cycles the trainer control, ↑/↓ nudge a level or ERG target. */
function useRouteHotkeys(plan: RoutePlan | null, control: TrainerControl, refresh: () => void) {
  useEffect(() => {
    if (!plan) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 's' || e.key === 'S') command({ type: 'routeMode', mode: plan.playbackMode === 'steady' ? 'reactive' : 'steady' })
      else if (e.key === 'm' || e.key === 'M') {
        const order: TrainerControl[] = ['sim', 'resistance', 'erg']
        command({ type: 'mode', mode: order[(order.indexOf(control) + 1) % order.length]! })
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && control !== 'sim') {
        const n = NUDGE[control]
        command({ type: 'nudge', delta: (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? n.big : n.small) })
      } else return
      e.preventDefault()
      refresh()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [plan, control, refresh])
}
