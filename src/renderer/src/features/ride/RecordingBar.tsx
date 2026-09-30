import { useState } from 'react'
import { Circle, Flag, Pause, Play, Square, Trash2, Volume2, VolumeX } from 'lucide-react'
import type { RidePlan } from '@core/ride/plan'
import { useCoachTalk } from '../../coach/talk'
import { getRuntime } from '../../runtime/composition'
import { useRide } from '../../stores/ride'
import { useSettings } from '../../stores/settings'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { formatDuration } from '../../ui/format'
import { distanceUnit, formatLongDistanceFixed } from '@core/units'

/** Start/pause/lap/finish controls plus the running ride totals. */
export function RecordingBar({ plan, startLabel = 'Start recording' }: { plan?: () => RidePlan; startLabel?: string }) {
  const active = useRide((s) => s.active)
  const state = useRide((s) => s.snapshot?.state ?? 'idle')
  const moving = useRide((s) => s.snapshot?.movingS ?? 0)
  const distance = useRide((s) => s.snapshot?.distanceM ?? 0)
  const np = useRide((s) => s.snapshot?.np ?? null)
  const tss = useRide((s) => s.snapshot?.tss ?? null)
  const kj = useRide((s) => s.snapshot?.kj ?? 0)
  const wbal = useRide((s) => s.snapshot?.wbalPct ?? null)
  const saving = useRide((s) => s.saving)
  const units = useSettings((s) => s.units)
  const coachOn = useSettings((s) => s.coach.enabled)
  const muted = useCoachTalk((s) => s.muted)
  const [confirm, setConfirm] = useState(false)
  const rt = getRuntime()

  if (!active) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-line bg-panel px-5 py-3">
        <div className="text-sm text-ink-dim">Not recording. Everything you do on the trainer still shows live.</div>
        <Button variant="primary" onClick={() => void rt.rides.start({ plan: plan?.() })} data-testid="start-ride">
          <Circle className="size-3.5 fill-current" /> {startLabel}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-accent/40 bg-accent/5 px-5 py-3" data-testid="recording-bar">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className={state === 'paused' ? 'size-2.5 rounded-full bg-warn' : 'size-2.5 animate-pulse rounded-full bg-bad'} />
        {state === 'paused' ? 'Paused' : 'Recording'}
      </div>
      <Stat label="Moving" value={formatDuration(moving)} testId="ride-moving" />
      <Stat label="Distance" value={`${formatLongDistanceFixed(distance, units, 2)} ${distanceUnit(units)}`} />
      <Stat label="NP" value={np === null ? '—' : `${np} W`} />
      <Stat label="TSS" value={tss === null ? '—' : tss.toFixed(0)} />
      <Stat label="Work" value={`${kj} kJ`} />
      {wbal !== null && <Stat label="W′bal" value={`${wbal} %`} />}
      <div className="ml-auto flex items-center gap-2">
        {coachOn && (
          <Button
            size="sm"
            onClick={() => rt.rides.command({ type: 'muteCoach' })}
            aria-pressed={muted}
            aria-label={muted ? 'Unmute coach' : 'Mute coach'}
            title={muted ? 'Unmute the coach (C)' : 'Mute the coach for this ride (C)'}
            data-testid="mute-coach"
          >
            {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
            {muted ? 'Muted' : 'Coach'}
          </Button>
        )}
        <Button size="sm" onClick={() => rt.rides.command({ type: 'lap' })} title="Lap (L)">
          <Flag className="size-3.5" /> Lap
        </Button>
        <Button size="sm" onClick={() => rt.rides.command({ type: 'togglePause' })} title="Pause/resume (Space)" data-testid="pause-ride">
          {state === 'paused' ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          {state === 'paused' ? 'Resume' : 'Pause'}
        </Button>
        <Button size="sm" variant="primary" disabled={saving} onClick={() => setConfirm(true)} data-testid="finish-ride">
          <Square className="size-3.5 fill-current" /> Finish
        </Button>
      </div>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Finish this ride?"
        description={`${formatDuration(moving)} recorded. It will be saved locally and as a FIT file.`}
        footer={
          <>
            <Button
              variant="danger"
              onClick={() => {
                setConfirm(false)
                void rt.rides.discard()
              }}
            >
              <Trash2 className="size-3.5" /> Discard
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep riding
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirm(false)
                void rt.rides.finish()
              }}
              data-testid="confirm-finish"
            >
              Save ride
            </Button>
          </>
        }
      >
        <div />
      </Dialog>
    </div>
  )
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="text-sm">
      <span className="text-ink-faint">{label} </span>
      <span className="tabular font-semibold" data-testid={testId}>
        {value}
      </span>
    </div>
  )
}
