import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Pause, Play, SkipForward } from 'lucide-react'
import type { LiveBroadcast, RideCommand } from '@shared/live'

const fmt = (s: number | null | undefined) => {
  if (s === null || s === undefined) return '—'
  const v = Math.max(0, Math.round(s))
  const h = Math.floor(v / 3600)
  const m = Math.floor((v % 3600) / 60)
  const x = v % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`
}

const send = (cmd: RideCommand) => void window.freegaz.invoke('ride.command', cmd)

/**
 * The floating mini-HUD. Receives the main window's live broadcast through
 * main and renders the numbers that matter while you watch something else.
 */
export function MiniHudApp() {
  const [b, setB] = useState<LiveBroadcast | null>(null)
  useEffect(() => window.freegaz.on('live.broadcast', setB), [])

  const f = b?.frame
  const r = b?.ride
  const target = f?.trainer.targetW ?? null
  const p = f?.power3s ?? null
  const delta = p !== null && target !== null ? p - target : null
  const onTarget = delta !== null && Math.abs(delta) <= Math.max(5, target! * 0.05)

  return (
    <div className="drag-region group flex h-full flex-col rounded-2xl border border-line bg-bg/85 px-4 py-3 text-ink backdrop-blur-xl">
      <div className="flex items-center justify-between eyebrow text-[10px] text-ink-faint">
        <span className="truncate">{r?.segmentLabel ?? r?.name ?? 'FreeGaz'}</span>
        <span className="tabular">{r ? fmt(r.movingS) : ''}</span>
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div>
          <span className="tabular font-display text-6xl font-black leading-none">{p ?? '—'}</span>
          <span className="ml-1 text-sm text-ink-dim">W</span>
          {target !== null && (
            <div className="tabular flex items-center gap-1 text-xs text-ink-dim">
              {delta !== null && (onTarget ? <Check className="size-3 text-good" aria-label="on target" /> : delta < 0 ? <ArrowDown className="size-3 text-bad" aria-label="below target" /> : <ArrowUp className="size-3 text-warn" aria-label="above target" />)}
              target {target} W
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5">
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: 'var(--color-hr)' }} />
            <span className="tabular text-3xl font-bold leading-none">{f?.hr ?? '—'}</span>
          </div>
          <div className="text-[10px] text-ink-faint">bpm</div>
          <div className="mt-1 flex items-center justify-end gap-1.5">
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: 'var(--color-cadence)' }} />
            <span className="tabular text-xl font-semibold leading-none">{f?.cadence ?? '—'}</span>
          </div>
          <div className="text-[10px] text-ink-faint">rpm</div>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between pt-2 text-xs text-ink-dim">
        <span className="tabular">
          {r?.segmentRemainingS !== null && r?.segmentRemainingS !== undefined ? `${fmt(r.segmentRemainingS)} left` : ''}
          {r?.nextLabel ? ` · next ${r.nextLabel}` : ''}
        </span>
        <span className="no-drag flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" aria-label="Pause or resume" className="rounded-md p-1 hover:bg-panel-3" onClick={() => send({ type: 'togglePause' })}>
            {r?.state === 'paused' ? <Play className="size-4" /> : <Pause className="size-4" />}
          </button>
          <button type="button" aria-label="Skip interval" className="rounded-md p-1 hover:bg-panel-3" onClick={() => send({ type: 'skip' })}>
            <SkipForward className="size-4" />
          </button>
        </span>
      </div>
      {r?.coachLine && <div className="mt-1 truncate text-xs italic text-ink-dim">“{r.coachLine}”</div>}
    </div>
  )
}
