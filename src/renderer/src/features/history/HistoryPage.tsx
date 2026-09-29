import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from '@tanstack/react-router'
import { Bike, FlaskConical, Gauge, LifeBuoy, Mountain } from 'lucide-react'
import type { RideSummary } from '@core/ride/types'
import { db } from '../../db/db'
import { PageHeader } from '../../ui/PageHeader'
import { formatDate, formatDurationShort } from '../../ui/format'

const KIND_ICON = { free: Bike, workout: Gauge, route: Mountain, 'ftp-test': FlaskConical } as const

export function HistoryPage() {
  const rides = useLiveQuery(() => db().rides.orderBy('startedAt').reverse().limit(500).toArray(), [])

  return (
    <div className="mx-auto max-w-6xl px-8 pb-10">
      <PageHeader title="History" subtitle="Every ride, every second, stored on this Mac." />
      {rides && rides.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-ink-faint">No rides yet. Go suffer and come back.</div>
      )}
      {rides && rides.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-line" data-testid="ride-list">
          <table className="w-full text-sm">
            <thead className="bg-panel-2 text-left text-xs uppercase tracking-wider text-ink-faint">
              <tr>
                <th className="px-4 py-2 font-medium">Ride</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 text-right font-medium">Time</th>
                <th className="px-4 py-2 text-right font-medium">NP</th>
                <th className="px-4 py-2 text-right font-medium">IF</th>
                <th className="px-4 py-2 text-right font-medium">TSS</th>
                <th className="px-4 py-2 text-right font-medium">kJ</th>
                <th className="px-4 py-2 text-right font-medium">HR</th>
              </tr>
            </thead>
            <tbody>
              {rides.map((r) => (
                <RideRow key={r.id} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RideRow({ r }: { r: RideSummary }) {
  const Icon = KIND_ICON[r.kind]
  const navigate = useNavigate()
  return (
    <tr className="cursor-pointer border-t border-line bg-panel hover:bg-panel-2" onClick={() => void navigate({ to: '/history/$rideId', params: { rideId: r.id } })}>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2 font-medium">
          <Icon className="size-4 text-accent" /> {r.name}
          {r.simulated && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">Sim</span>}
          {r.recovered && <LifeBuoy className="size-3.5 text-warn" aria-label="Recovered" />}
        </div>
      </td>
      <td className="px-4 py-2.5 text-ink-dim">{formatDate(r.startedAt)}</td>
      <td className="tabular px-4 py-2.5 text-right">{formatDurationShort(r.movingS)}</td>
      <td className="tabular px-4 py-2.5 text-right">{r.np ?? '—'}</td>
      <td className="tabular px-4 py-2.5 text-right">{r.intensityFactor?.toFixed(2) ?? '—'}</td>
      <td className="tabular px-4 py-2.5 text-right">{r.tss === null ? '—' : Math.round(r.tss)}</td>
      <td className="tabular px-4 py-2.5 text-right">{Math.round(r.kj)}</td>
      <td className="tabular px-4 py-2.5 text-right">{r.avgHr ?? '—'}</td>
    </tr>
  )
}
