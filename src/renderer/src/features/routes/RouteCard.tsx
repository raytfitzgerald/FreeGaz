import { Clock, Repeat } from 'lucide-react'
import { distanceUnit, formatElevation } from '@core/units'
import { formatGrade } from '../../routes/grade'
import { formatKm } from '../../routes/format'
import { useSettings } from '../../stores/settings'
import type { RouteEntry } from '../../routes/routes-repo'
import { ElevationThumb } from './ElevationThumb'

export function RouteCard({ entry, onOpen }: { entry: RouteEntry; onOpen: () => void }) {
  const units = useSettings((s) => s.units)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col rounded-2xl border border-line bg-panel p-4 text-left transition-colors hover:border-line-strong hover:bg-panel-2"
      data-testid="route-card"
    >
      <div className="rounded-lg bg-panel-2 px-2 pt-2 group-hover:bg-panel-3">
        <ElevationThumb thumb={entry.thumb} />
      </div>
      <div className="mt-3 font-semibold leading-snug">{entry.name}</div>
      <div className="tabular mt-1 text-xs text-ink-dim">
        {formatKm(entry.distanceM, 1, units)} {distanceUnit(units)} · {formatElevation(entry.elevationGainM, units)} up · max {formatGrade(entry.maxGradePct)}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <span className={entry.builtin ? 'rounded bg-panel-3 px-1.5 py-0.5 text-[10px] text-ink-dim' : 'rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-ink'}>
          {entry.builtin ? 'Demo' : entry.source.toUpperCase()}
        </span>
        {entry.loop && (
          <span className="flex items-center gap-1 rounded bg-panel-3 px-1.5 py-0.5 text-[10px] text-ink-dim">
            <Repeat className="size-3" aria-hidden /> Loop
          </span>
        )}
        {entry.hasTimes && (
          <span className="flex items-center gap-1 rounded bg-panel-3 px-1.5 py-0.5 text-[10px] text-ink-dim" title="The file has timestamps: Steady rides its recorded pace">
            <Clock className="size-3" aria-hidden /> Recorded pace
          </span>
        )}
      </div>
    </button>
  )
}
