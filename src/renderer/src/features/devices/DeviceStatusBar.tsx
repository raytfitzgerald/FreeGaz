import { Link } from '@tanstack/react-router'
import { HeartPulse, Zap } from 'lucide-react'
import { useDevices } from '../../stores/devices'
import { useLive } from '../../stores/live'
import { StatusDot } from '../../ui/StatusDot'

/** Compact device + live-value chips for the top bar. */
export function DeviceStatusBar() {
  const trainerState = useDevices((s) => s.devices.find((d) => d.role === 'trainer')?.state ?? 'none')
  const hrState = useDevices((s) => s.devices.find((d) => d.role === 'hr')?.state ?? 'none')
  const power = useLive((f) => f.power3s)
  const hr = useLive((f) => f.hr)
  const simulated = useLive((f) => f.simulated)

  return (
    <Link to="/devices" className="no-drag flex items-center gap-2 rounded-full border border-line bg-panel/80 px-3 py-1.5 text-xs backdrop-blur hover:border-line-strong">
      {simulated && <span className="rounded-full bg-accent/15 px-2 py-0.5 font-semibold uppercase tracking-wider text-accent">Sim</span>}
      <span className="flex items-center gap-1.5" data-testid="status-trainer">
        <StatusDot state={trainerState} />
        <Zap className="size-3.5 text-power" />
        <span className="tabular w-10 text-right">{power ?? '—'}</span>
        <span className="text-ink-faint">W</span>
      </span>
      <span className="h-4 w-px bg-line" />
      <span className="flex items-center gap-1.5" data-testid="status-hr">
        <StatusDot state={hrState} />
        <HeartPulse className="size-3.5 text-hr" />
        <span className="tabular w-8 text-right">{hr ?? '—'}</span>
        <span className="text-ink-faint">bpm</span>
      </span>
    </Link>
  )
}
