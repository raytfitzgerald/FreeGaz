import { useEffect, useMemo } from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, ChevronsRight, Minus, Plus, RotateCcw, TimerReset, Trophy } from 'lucide-react'
import { WorkoutChart } from '../../charts/WorkoutChart'
import { getRuntime } from '../../runtime/composition'
import { useLive } from '../../stores/live'
import { useRide } from '../../stores/ride'
import { Button } from '../../ui/Button'
import { MetricTile } from '../../ui/MetricTile'
import { Segmented } from '../../ui/Segmented'
import { cn } from '../../ui/cn'
import { formatDuration } from '../../ui/format'
import { profileBlocks } from '../../workouts/profile'
import { HudGrid } from '../../hud/HudGrid'
import { RideAlong } from '../../coach/ride-along/RideAlong'
import { CueBanner } from './CueBanner'
import { NowPlaying } from './NowPlaying'
import { RecordingBar } from './RecordingBar'
import { RescueBanner } from './RescueBanner'

type Mode = 'erg' | 'resistance' | 'sim'

const MODES = [
  { value: 'erg' as const, label: 'ERG', hint: 'The trainer holds each target for you' },
  { value: 'resistance' as const, label: 'Level', hint: 'Fixed resistance: you make the watts (↑/↓ to change)' },
  { value: 'sim' as const, label: 'Slope', hint: 'A virtual gradient: shift gears to hit the targets' },
]
const NUDGE: Record<Exclude<Mode, 'erg'>, { small: number; unit: string }> = { resistance: { small: 5, unit: '%' }, sim: { small: 0.5, unit: '%' } }

const command = (cmd: Parameters<ReturnType<typeof getRuntime>['rides']['command']>[0]) => getRuntime().rides.command(cmd)

/** The in-ride HUD for structured workouts and FTP tests. */
export function WorkoutRideView() {
  const workout = useRide((s) => s.workout)
  const name = useRide((s) => s.snapshot?.name ?? workout?.plan.name ?? '')
  const manual = workout?.plan.manualMode ?? null
  const mode: Mode = manual?.mode ?? 'erg'
  useWorkoutHotkeys(mode)

  if (!workout) return null
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-8 pb-10 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{name}</h1>
          <Progress />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NowPlaying />
          <Segmented ariaLabel="Trainer mode" value={mode} onChange={(m) => command({ type: 'mode', mode: m })} options={MODES} />
          {manual ? <ManualLevel mode={mode as Exclude<Mode, 'erg'>} value={manual.mode === 'resistance' ? manual.pct : manual.gradePct} /> : <Intensity />}
        </div>
      </div>

      <CueBanner />
      <RideAlong />
      <RescueBanner />
      <FinishedBanner />

      <div className="grid gap-3 md:grid-cols-3">
        <IntervalTile />
        <TargetOrEffortTile />
        <PowerTile />
      </div>

      <div className="rounded-2xl border border-line bg-panel p-4">
        <ChartWithControls />
      </div>

      <HudGrid view="workout" />
      <RecordingBar />
    </div>
  )
}

function Progress() {
  const elapsed = useRide((s) => s.snapshot?.elapsedS ?? 0)
  const remaining = useRide((s) => s.plan?.remainingS ?? null)
  return (
    <div className="tabular text-sm text-ink-dim" data-testid="workout-progress">
      {formatDuration(elapsed)} elapsed{remaining !== null && ` · ${formatDuration(remaining)} to go`}
    </div>
  )
}

function Intensity() {
  const pct = useLive((f) => f.trainer.intensityPct)
  return (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-panel px-1.5 py-1" title="Intensity (↑/↓, Shift for 5 %)">
      <Button size="iconSm" variant="ghost" aria-label="Easier by 1 %" onClick={() => command({ type: 'intensity', deltaPct: -1 })}>
        <Minus className="size-4" />
      </Button>
      <span className={cn('tabular w-14 text-center text-sm font-semibold', pct !== 100 && 'text-accent')} data-testid="intensity">
        {pct} %
      </span>
      <Button size="iconSm" variant="ghost" aria-label="Harder by 1 %" onClick={() => command({ type: 'intensity', deltaPct: 1 })}>
        <Plus className="size-4" />
      </Button>
    </div>
  )
}

function ManualLevel({ mode, value }: { mode: Exclude<Mode, 'erg'>; value: number }) {
  const n = NUDGE[mode]
  return (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-panel px-1.5 py-1" title={mode === 'resistance' ? 'Resistance level (↑/↓)' : 'Virtual gradient (↑/↓)'}>
      <Button size="iconSm" variant="ghost" aria-label="Easier" onClick={() => command({ type: 'nudge', delta: -n.small })}>
        <Minus className="size-4" />
      </Button>
      <span className="tabular w-16 text-center text-sm font-semibold">
        {mode === 'sim' ? value.toFixed(1) : value} {n.unit}
      </span>
      <Button size="iconSm" variant="ghost" aria-label="Harder" onClick={() => command({ type: 'nudge', delta: n.small })}>
        <Plus className="size-4" />
      </Button>
    </div>
  )
}

function IntervalTile() {
  const label = useRide((s) => s.plan?.segmentLabel ?? '—')
  const remaining = useRide((s) => (s.plan?.segmentRemainingS === null || s.plan?.segmentRemainingS === undefined ? null : Math.ceil(s.plan.segmentRemainingS)))
  const next = useRide((s) => s.plan?.nextLabel ?? null)
  const soon = remaining !== null && remaining <= 10
  return (
    <MetricTile
      label={label}
      value={remaining === null ? null : formatDuration(remaining)}
      size="xl"
      testId="interval-remaining"
      className={cn(soon && 'border-accent/60')}
      sub={next ? <span data-testid="next-interval">Next: {next}</span> : undefined}
    />
  )
}

function TargetOrEffortTile() {
  const effort = useRide((s) => s.plan?.effort ?? null)
  const target = useRide((s) => s.plan?.targetW ?? null)
  const range = useRide((s) => s.plan?.targetRangeW ?? null)
  const ftpW = useRide((s) => s.workout?.plan.ftpW ?? 0)
  if (effort) return <EffortTile />
  const pct = target !== null && ftpW > 0 ? `${Math.round((target / ftpW) * 100)} % FTP` : null
  return (
    <MetricTile
      label="Target"
      value={target}
      unit={target === null ? undefined : 'W'}
      size="xl"
      accent="var(--color-power)"
      testId="target"
      sub={range ? `${pct} · range ${range[0]}–${range[1]} W` : target === null ? 'ERG off: your call' : pct}
    />
  )
}

function EffortTile() {
  const e = useRide((s) => s.plan?.effort)!
  const p3 = useLive((f) => f.power3s)
  const lo = e.targetW === null ? null : Math.round(e.targetW * 0.97)
  const hi = e.targetW === null ? null : Math.round(e.targetW * 1.03)
  const pos = lo !== null && hi !== null && p3 !== null ? Math.max(0, Math.min(1, (p3 - lo * 0.9) / (hi * 1.1 - lo * 0.9))) : null
  return (
    <div className="flex flex-col rounded-2xl border border-accent/50 bg-accent/5 px-5 py-4" data-testid="ftp-effort">
      <div className="flex items-center gap-2 eyebrow text-ink-faint">
        <Trophy className="size-3.5 text-accent" /> {e.label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="tabular font-display text-6xl font-bold leading-none">{e.avgW ?? '—'}</span>
        <span className="text-sm text-ink-dim">W average</span>
      </div>
      <div className="tabular mt-2 text-sm text-ink-dim">
        Projected FTP <b className="text-ink">{e.projectedFtpW ?? '—'} W</b>
        {e.targetW !== null && (
          <>
            {' '}
            · pace {lo}–{hi} W
          </>
        )}
      </div>
      {pos !== null && (
        <div className="relative mt-3 h-2 rounded-full bg-panel-3" aria-hidden>
          <div className="absolute inset-y-0 rounded-full bg-good/40" style={{ left: `${((lo! - lo! * 0.9) / (hi! * 1.1 - lo! * 0.9)) * 100}%`, right: `${100 - ((hi! - lo! * 0.9) / (hi! * 1.1 - lo! * 0.9)) * 100}%` }} />
          <div className="absolute -top-1 h-4 w-1 rounded bg-ink" style={{ left: `calc(${pos * 100}% - 2px)` }} />
        </div>
      )}
    </div>
  )
}

function PowerTile() {
  const p3 = useLive((f) => f.power3s)
  const target = useRide((s) => s.plan?.targetW ?? null)
  const effort = useRide((s) => !!s.plan?.effort)
  return <MetricTile label="Power · 3 s" value={p3} unit="W" size="xl" accent="var(--color-power)" testId="power" status={target !== null && !effort ? <Compliance power={p3} target={target} /> : undefined} />
}

/** On target / under / over, as an icon + label (never colour alone). */
function Compliance({ power, target }: { power: number | null; target: number }) {
  if (power === null || target <= 0) return null
  const d = (power - target) / target
  const [Icon, text, tone] = Math.abs(d) <= 0.05 ? [CheckCircle2, 'On target', 'text-good'] : d < 0 ? [ArrowDown, 'Under', 'text-warn'] : [ArrowUp, 'Over', 'text-ink-dim']
  return (
    <span className={cn('flex items-center gap-1 text-xs font-medium', tone)} data-testid="compliance">
      <Icon className="size-3.5" /> {text}
    </span>
  )
}

function ChartWithControls() {
  const workout = useRide((s) => s.workout)!
  const actual = useRide((s) => s.actual)
  const cursor = useRide((s) => s.plan?.positionS ?? null)
  const ftpW = useRide((s) => s.workout?.plan.ftpW ?? 0)
  const blocks = useMemo(() => profileBlocks(workout.plan.timeline, ftpW), [workout, ftpW])
  return (
    <div>
      <WorkoutChart blocks={blocks} durationS={workout.plan.timeline.durationS} ftpW={ftpW} actual={actual ?? undefined} cursorS={cursor} height={170} title="Workout profile with your power" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => command({ type: 'back' })} title="Back: restart this interval, or go to the previous one (B)">
          <RotateCcw className="size-3.5" /> Back
        </Button>
        <Button size="sm" variant="ghost" onClick={() => command({ type: 'skip' })} title="Skip to the next interval (Tab)" data-testid="skip-interval">
          <ChevronsRight className="size-3.5" /> Skip
        </Button>
        <Button size="sm" variant="ghost" onClick={() => command({ type: 'extend', seconds: 30 })} title="Make this interval 30 s longer (E)">
          <TimerReset className="size-3.5" /> +30 s
        </Button>
        <span className="ml-auto text-xs text-ink-faint">Space pause · Tab skip · B back · E +30 s · ↑/↓ intensity · M mode · L lap</span>
      </div>
    </div>
  )
}

function FinishedBanner() {
  const finished = useRide((s) => s.planFinished)
  if (!finished) return null
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-good/40 bg-good/5 px-5 py-3 text-sm" role="status" data-testid="workout-complete">
      <CheckCircle2 className="size-4 text-good" /> Workout complete. Spin easy as long as you like, then press Finish to save.
    </div>
  )
}

/** Workout keys: Tab skip, B back, E extend, ↑/↓ intensity (or level/slope), M cycles mode. */
function useWorkoutHotkeys(mode: Mode) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return
      const big = e.shiftKey
      if (e.key === 'Tab') command({ type: 'skip' })
      else if (e.key === 'b' || e.key === 'B') command({ type: 'back' })
      else if (e.key === 'e' || e.key === 'E') command({ type: 'extend', seconds: 30 })
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const sign = e.key === 'ArrowUp' ? 1 : -1
        if (mode === 'erg') command({ type: 'intensity', deltaPct: sign * (big ? 5 : 1) })
        else command({ type: 'nudge', delta: sign * NUDGE[mode].small * (big ? 4 : 1) })
      } else if (e.key === 'm' || e.key === 'M') {
        const order: Mode[] = ['erg', 'resistance', 'sim']
        command({ type: 'mode', mode: order[(order.indexOf(mode) + 1) % order.length]! })
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])
}
