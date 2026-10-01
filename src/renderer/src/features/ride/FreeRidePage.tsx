import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Minus, Plus } from 'lucide-react'
import type { Desired } from '@core/control/trainer-controller'
import type { TrainerMode } from '@shared/live'
import { getRuntime } from '../../runtime/composition'
import { useLive } from '../../stores/live'
import { useRide } from '../../stores/ride'
import { Button } from '../../ui/Button'
import { MetricTile } from '../../ui/MetricTile'
import { PageHeader } from '../../ui/PageHeader'
import { Segmented } from '../../ui/Segmented'
import { cn } from '../../ui/cn'
import { HudGrid } from '../../hud/HudGrid'
import { NowPlaying } from './NowPlaying'
import { RecordingBar } from './RecordingBar'
import { RideAlong } from '../../coach/ride-along/RideAlong'
import { JourneyMap } from '../journeys/JourneyMap'
import { WhereTo } from '../journeys/WhereTo'
import { GuardBanner } from './GuardBanner'
import { CueBanner } from './CueBanner'
import { FtpResultCard } from './FtpResultCard'
import { SavedRideCard } from './SavedRideCard'
import { chooseRide } from './setup'

type Mode = Exclude<TrainerMode, 'idle'>

interface Targets {
  erg: number
  resistance: number
  sim: number
  hr: number
}

const MODE_OPTIONS = [
  { value: 'erg' as const, label: 'ERG', hint: 'Trainer holds the target watts no matter your cadence' },
  { value: 'resistance' as const, label: 'Level', hint: 'Fixed resistance; you choose the effort' },
  { value: 'sim' as const, label: 'Slope', hint: 'Simulated gradient; shift gears like outside' },
  { value: 'hr' as const, label: 'HR', hint: 'Trainer adjusts watts to hold your heart rate' },
]

const STEP: Record<Mode, { small: number; big: number; unit: string; min: number; max: number; decimals: number }> = {
  erg: { small: 5, big: 25, unit: 'W', min: 0, max: 1500, decimals: 0 },
  resistance: { small: 1, big: 5, unit: '%', min: 0, max: 100, decimals: 0 },
  sim: { small: 0.5, big: 2, unit: '%', min: -15, max: 20, decimals: 1 },
  hr: { small: 1, big: 5, unit: 'bpm', min: 90, max: 190, decimals: 0 },
}

function toDesired(mode: Mode, t: Targets): Desired {
  switch (mode) {
    case 'erg':
      return { mode: 'erg', watts: t.erg }
    case 'resistance':
      return { mode: 'resistance', pct: t.resistance }
    case 'sim':
      return { mode: 'sim', gradePct: t.sim }
    case 'hr':
      return { mode: 'hr', targetBpm: t.hr }
  }
}

function initialFromController(): { mode: Mode; targets: Targets } {
  const d = getRuntime().controller.snapshot.desired
  const targets: Targets = { erg: 150, resistance: 20, sim: 0, hr: 135 }
  if (d.mode === 'erg') targets.erg = d.watts
  if (d.mode === 'resistance') targets.resistance = d.pct
  if (d.mode === 'sim') targets.sim = d.gradePct
  if (d.mode === 'hr') targets.hr = d.targetBpm
  // A fresh free ride starts like a normal bike: a light fixed level, not ERG.
  return { mode: d.mode === 'idle' ? 'resistance' : d.mode, targets }
}

export function FreeRidePage() {
  const [{ mode, targets }, setState] = useState(initialFromController)
  const trainerConnected = useLive((f) => f.trainer.connected)
  const recording = useRide((s) => s.active)

  // Push the desired state to the controller whenever it changes, and again when a ride starts or ends.
  useEffect(() => {
    getRuntime().controller.setDesired(toDesired(mode, targets))
  }, [mode, targets, recording])

  const nudge = (delta: number) =>
    setState((s) => {
      const st = STEP[s.mode]
      const next = Math.round(Math.min(st.max, Math.max(st.min, s.targets[s.mode] + delta)) * 10 ** st.decimals) / 10 ** st.decimals
      return { mode: s.mode, targets: { ...s.targets, [s.mode]: next } }
    })

  // Keyboard: ↑/↓ small step, Shift for big step, M cycles mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const st = STEP[mode]
      if (e.key === 'ArrowUp') nudge(e.shiftKey ? st.big : st.small)
      else if (e.key === 'ArrowDown') nudge(-(e.shiftKey ? st.big : st.small))
      else if (e.key === 'm' || e.key === 'M') {
        const order: Mode[] = ['erg', 'resistance', 'sim', 'hr']
        setState((s) => ({ ...s, mode: order[(order.indexOf(s.mode) + 1) % order.length]! }))
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const st = STEP[mode]
  const value = targets[mode]

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8 pb-10">
      <PageHeader
        title="Just ride"
        subtitle="No plan, just pedals. Switch modes any time."
        actions={
          <>
            {!recording && (
              <Button variant="ghost" size="sm" onClick={() => chooseRide(null)} data-testid="change-ride">
                <ArrowLeft className="size-3.5" /> Change ride type
              </Button>
            )}
            <NowPlaying />
            <Segmented ariaLabel="Trainer mode" value={mode} onChange={(m) => setState((s) => ({ ...s, mode: m }))} options={MODE_OPTIONS} />
          </>
        }
      />

      {!trainerConnected && (
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-warn/40 bg-warn/10 px-5 py-3 text-sm">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-warn" /> No trainer connected. You can still see sensor data.
          </span>
          <Button asChild size="sm">
            <Link to="/devices">Connect devices</Link>
          </Button>
        </div>
      )}
      <div className="mb-4 empty:hidden">
        <GuardBanner />
      </div>
      {!recording && (
        <div className="mb-4">
          <WhereTo />
        </div>
      )}
      <div className="mb-4 space-y-3">
        <CueBanner />
        <RideAlong />
        <JourneyMap />
        <FtpResultCard />
        <SavedRideCard />
        <RecordingBar />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]" data-snap>
        <PowerHero />
        <div className="flex flex-col rounded-2xl border border-line bg-panel p-5" data-testid="target-panel">
          <div className="eyebrow text-ink-faint">
            {mode === 'erg' ? 'ERG target' : mode === 'resistance' ? 'Resistance level' : mode === 'sim' ? 'Gradient' : 'Target heart rate'}
          </div>
          <div className="flex flex-1 items-center justify-center gap-4 py-4">
            <Button size="icon" variant="secondary" aria-label="Decrease a lot" onClick={() => nudge(-st.big)}>
              <Minus className="size-5" />
              <Minus className="-ml-3 size-5" />
            </Button>
            <Button size="icon" variant="secondary" aria-label="Decrease" onClick={() => nudge(-st.small)}>
              <Minus className="size-5" />
            </Button>
            <div className="min-w-44 text-center">
              <span className="tabular font-display text-7xl font-bold" data-testid="target-value">
                {value.toFixed(st.decimals)}
              </span>
              <span className="ml-2 text-lg text-ink-dim">{st.unit}</span>
            </div>
            <Button size="icon" variant="secondary" aria-label="Increase" onClick={() => nudge(st.small)}>
              <Plus className="size-5" />
            </Button>
            <Button size="icon" variant="secondary" aria-label="Increase a lot" onClick={() => nudge(st.big)}>
              <Plus className="size-5" />
              <Plus className="-ml-3 size-5" />
            </Button>
          </div>
          <SentToTrainer mode={mode} />
          <div className="mt-3 text-center text-[11px] text-ink-faint" data-snap-hide>
            ↑/↓ ±{st.small}
            {st.unit} · Shift ±{st.big}
            {st.unit} · M switches mode
          </div>
        </div>
      </div>

      <div className="mt-4">
        <HudGrid view="free" />
      </div>
    </div>
  )
}

function PowerHero() {
  const power3s = useLive((f) => f.power3s)
  const target = useLive((f) => f.trainer.targetW)
  const mode = useLive((f) => f.trainer.mode)
  const source = useLive((f) => f.sources.power)
  const delta = power3s !== null && target !== null && mode === 'erg' ? power3s - target : null
  const band = target !== null ? Math.max(5, target * 0.05) : 0
  const state = delta === null ? null : Math.abs(delta) <= band ? 'on' : delta < 0 ? 'low' : 'high'
  return (
    <MetricTile
      label="Power · 3 s"
      value={power3s}
      unit="W"
      size="xl"
      testId="power"
      accent="var(--color-power)"
      status={state && <ComplianceChip state={state} delta={delta!} />}
      sub={
        <span className="flex gap-4">
          {target !== null && mode === 'erg' && (
            <span>
              Target <span className="tabular text-ink">{target} W</span>
            </span>
          )}
          {source && <span className="text-ink-faint">from {source}</span>}
        </span>
      }
    />
  )
}

/** ERG compliance: status colour always paired with an icon and a label. */
function ComplianceChip({ state, delta }: { state: 'on' | 'low' | 'high'; delta: number }) {
  const Icon = state === 'on' ? CheckCircle2 : state === 'low' ? ArrowDown : ArrowUp
  const cls = state === 'on' ? 'text-good border-good/40 bg-good/10' : state === 'low' ? 'text-bad border-bad/40 bg-bad/10' : 'text-warn border-warn/40 bg-warn/10'
  const text = state === 'on' ? 'On target' : `${delta > 0 ? '+' : ''}${delta} W`
  return (
    <span className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', cls)} data-testid="compliance">
      <Icon className="size-3.5" /> {text}
    </span>
  )
}

function SentToTrainer({ mode }: { mode: Mode }) {
  const grade = useLive((f) => f.trainer.gradePct)
  const raw = useLive((f) => f.trainer.rawGradePct)
  const resistance = useLive((f) => f.trainer.resistancePct)
  const target = useLive((f) => f.trainer.targetW)
  const intensity = useLive((f) => f.trainer.intensityPct)
  const powerMatch = useLive((f) => f.trainer.powerMatch)
  let text = ''
  if (mode === 'sim' && grade !== null) text = raw !== null && raw !== grade ? `Trainer feels ${grade.toFixed(1)} % (slope scaling)` : `Trainer at ${grade.toFixed(1)} %`
  if (mode === 'resistance' && resistance !== null) text = `Resistance ${resistance.toFixed(0)} %`
  if ((mode === 'erg' || mode === 'hr') && target !== null) {
    const pm = powerMatch !== null && Math.abs(powerMatch - 1) >= 0.005 ? `, PowerMatch ${powerMatch > 1 ? '+' : ''}${((powerMatch - 1) * 100).toFixed(1)} %` : ''
    text = `Trainer asked for ${target} W${intensity !== 100 ? ` (${intensity} % intensity)` : ''}${pm}`
  }
  return <div className="h-5 text-center text-xs text-ink-dim">{text}</div>
}

