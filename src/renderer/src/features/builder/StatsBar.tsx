import { memo } from 'react'
import type { WorkoutStats } from '@core/workout/stats'
import { formatDuration } from '../../ui/format'
import { cn } from '../../ui/cn'
import { POWER_ZONE_LABELS, POWER_ZONE_SHORT, zoneVar } from '../../ui/zones'

/** Planned stats at the rider's FTP, recomputed live (drags included). */
export const StatsBar = memo(function StatsBar({ stats, ftpW, known }: { stats: WorkoutStats; ftpW: number; known: boolean }) {
  const total = stats.zoneSeconds.reduce((a, b) => a + b, 0)
  const cells: [string, string, string?][] = [
    ['Duration', formatDuration(stats.durationS), 'stat-duration'],
    ['TSS', stats.tss === null ? '—' : String(Math.round(stats.tss)), 'stat-tss'],
    ['IF', stats.if === null ? '—' : stats.if.toFixed(2), 'stat-if'],
    ['NP', stats.np === null ? '—' : `${Math.round(stats.np)} W`, 'stat-np'],
    ['Work', `${Math.round(stats.kj)} kJ`, 'stat-kj'],
  ]
  return (
    <section className="rounded-2xl border border-line bg-panel p-3" aria-label="Workout stats" data-testid="builder-stats">
      {/* One fixed grid row: the numbers change live (drags included) but never reflow it, so the canvas below never moves. */}
      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2 md:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,2.4fr)]">
        {cells.map(([label, value, testId]) => (
          <div key={label} className="flex min-w-0 flex-col justify-center rounded-xl border border-line bg-panel-2 px-3 py-1.5">
            <div className="text-[11px] text-ink-faint">{label}</div>
            <div className="tabular truncate font-display text-lg font-semibold leading-tight" data-testid={testId}>
              {value}
            </div>
          </div>
        ))}
        <div className="col-span-full min-w-0 rounded-xl border border-line bg-panel-2 px-3 py-1.5 md:col-span-1">
          <div className="flex items-baseline justify-between gap-2 whitespace-nowrap text-[11px] text-ink-faint">
            <span>Time in zones</span>
            <span className="truncate">
              at {ftpW} W{known ? '' : ' (default FTP)'}
            </span>
          </div>
          <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-panel-3" role="img" aria-label={zoneSummary(stats.zoneSeconds, total)}>
            {total > 0 &&
              stats.zoneSeconds.map((s, i) =>
                s > 0 ? <div key={i} style={{ width: `${(s / total) * 100}%`, background: zoneVar(i) }} title={`${POWER_ZONE_LABELS[i]}: ${formatDuration(s)} (${Math.round((s / total) * 100)}%)`} /> : null,
              )}
          </div>
          {/* A slot per zone, zeros included: the legend's size never depends on the numbers. */}
          <div className="mt-1 grid grid-cols-4 gap-x-2 text-[10px] leading-4">
            {stats.zoneSeconds.map((s, i) => (
              <span
                key={i}
                className={cn('tabular flex items-center gap-1 overflow-hidden whitespace-nowrap', s > 0 ? 'text-ink-dim' : 'text-ink-faint/60')}
                title={`${POWER_ZONE_LABELS[i]}: ${formatDuration(s)}`}
              >
                <span className="size-2 shrink-0 rounded-sm" style={{ background: zoneVar(i), opacity: s > 0 ? 1 : 0.35 }} aria-hidden />
                {POWER_ZONE_SHORT[i]} {total > 0 ? Math.round((s / total) * 100) : 0}%
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
})

function zoneSummary(zoneSeconds: number[], total: number): string {
  if (total === 0) return 'No time in any zone yet'
  return zoneSeconds
    .map((s, i) => (s > 0 ? `${POWER_ZONE_LABELS[i]} ${Math.round((s / total) * 100)}%` : null))
    .filter(Boolean)
    .join(', ')
}
