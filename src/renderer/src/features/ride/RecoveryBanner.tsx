import { LifeBuoy } from 'lucide-react'
import { getRuntime } from '../../runtime/composition'
import { useRide } from '../../stores/ride'
import { Button } from '../../ui/Button'
import { formatDateTime, formatDuration } from '../../ui/format'

/** Offers to recover rides that were interrupted by a crash or power loss. */
export function RecoveryBanner() {
  const recoveries = useRide((s) => s.recoveries)
  if (recoveries.length === 0) return null
  const rt = getRuntime()
  return (
    <div className="mx-8 mt-14 space-y-2" data-testid="recovery-banner">
      {recoveries.map((r) => (
        <div key={r.rideId} className="flex items-center gap-4 rounded-2xl border border-warn/40 bg-warn/10 px-5 py-3 text-sm">
          <LifeBuoy className="size-5 shrink-0 text-warn" />
          <div className="flex-1">
            <div className="font-semibold">Unfinished ride found{r.name ? `: ${r.name}` : ''}</div>
            <div className="text-ink-dim">
              {r.startedAt ? formatDateTime(r.startedAt) : 'Unknown start'} · {formatDuration(r.records)} recorded before FreeGaz closed.
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void rt.rides.discardRecovery(r.rideId)}>
            Discard
          </Button>
          <Button size="sm" variant="primary" onClick={() => void rt.rides.recover(r.rideId)} data-testid="recover-ride">
            Recover ride
          </Button>
        </div>
      ))}
    </div>
  )
}
