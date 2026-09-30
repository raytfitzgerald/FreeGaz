import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import type uPlot from 'uplot'
import { ArrowLeft, ExternalLink, FolderOpen, Trash2 } from 'lucide-react'
import { normalizeRide } from '@core/ride/normalize'
import { WPrimeBalance } from '@core/metrics'
import { column, type RideStreams } from '@core/ride/streams'
import type { RideSummary } from '@core/ride/types'
import { axis, line } from '../../charts/style'
import { UPlot } from '../../charts/UPlot'
import { db } from '../../db/db'
import { deleteRide, updateRide } from '../../db/rides-repo'
import { bridge } from '../../platform/bridge'
import { Button } from '../../ui/Button'
import { Card, CardBody, CardHeader } from '../../ui/Card'
import { Dialog } from '../../ui/Dialog'
import { PageHeader } from '../../ui/PageHeader'
import { formatDateTime, formatDuration } from '../../ui/format'
import { displaySpeedKmh, distanceUnit, formatLongDistance, speedUnit } from '@core/units'
import { useSettings } from '../../stores/settings'
import { POWER_ZONE_LABELS, zoneVar } from '../../ui/zones'
import { DebriefCard } from '../ai/DebriefCard'

const SYNC_KEY = 'ride-detail'

export function RideDetailPage() {
  const { rideId } = useParams({ from: '/history/$rideId' })
  // Dexie resolves a missing row as undefined, which useLiveQuery also means "loading": map it to null
  const ride = useLiveQuery(() => db().rides.get(rideId).then((r) => (r ? normalizeRide(r) : null)), [rideId])
  const streams = useLiveQuery(() => db().rideStreams.get(rideId), [rideId])
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (ride === undefined) return <div className="p-10 text-ink-faint">Loading…</div>
  if (ride === null) return <div className="p-10 text-ink-faint">Ride not found.</div>

  return (
    <div className="mx-auto max-w-6xl px-8 pb-12">
      <PageHeader
        title={ride.name}
        subtitle={`${formatDateTime(ride.startedAt)} · ${formatDuration(ride.movingS)} moving${ride.simulated ? ' · simulated' : ''}${ride.recovered ? ' · recovered after a crash' : ''}${ride.imported ? ` · imported${ride.imported.device ? ` from ${ride.imported.device}` : ''}` : ''}`}
        actions={
          <>
            <Button asChild size="sm" variant="ghost">
              <Link to="/history">
                <ArrowLeft className="size-3.5" /> History
              </Link>
            </Button>
            {ride.fit?.path && (
              <Button size="sm" onClick={() => void bridge().invoke('files.reveal', { path: ride.fit!.path! })}>
                <FolderOpen className="size-3.5" /> FIT file
              </Button>
            )}
            {!ride.simulated && !ride.imported && (
              <Button size="sm" variant="ghost" onClick={() => void bridge().invoke('files.openUrl', { url: 'https://www.strava.com/upload/select' })}>
                <ExternalLink className="size-3.5" /> Strava upload
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-3.5" />
            </Button>
          </>
        }
      />
      {ride.ftpTest && <FtpTestNote t={ride.ftpTest} />}
      <SummaryGrid r={ride} />
      {streams ? <Streams streams={streams} ride={ride} /> : <div className="py-10 text-center text-ink-faint">No stream data for this ride.</div>}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Laps r={ride} />
        <Zones r={ride} />
      </div>
      <Notes r={ride} />
      <DebriefCard ride={ride} />
      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this ride?"
        description="It will be removed from FreeGaz. The FIT file in your export folder is kept."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                void deleteRide(ride.id).then(() => navigate({ to: '/history' }))
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <div />
      </Dialog>
    </div>
  )
}

function FtpTestNote({ t }: { t: NonNullable<RideSummary['ftpTest']> }) {
  return (
    <div className="mb-4 rounded-2xl border border-accent/40 bg-accent/5 px-5 py-3 text-sm" data-testid="ride-ftp-test">
      <span className="font-semibold">FTP test: {t.ftpW} W</span>
      <span className="text-ink-dim"> from a {t.basisW} W basis · {t.applied ? 'saved as your FTP' : 'not applied'}</span>
      {!t.valid && t.problems.length > 0 && <div className="mt-1 text-xs text-ink-dim">{t.problems.join(' ')}</div>}
    </div>
  )
}

function SummaryGrid({ r }: { r: RideSummary }) {
  const units = useSettings((s) => s.units)
  const items: [string, string][] = [
    ['Normalized Power', r.np === null ? '—' : `${r.np} W`],
    ['Average power', r.avgPower === null ? '—' : `${r.avgPower} W`],
    ['Intensity (IF)', r.intensityFactor?.toFixed(2) ?? '—'],
    ['TSS', r.tss === null ? '—' : String(Math.round(r.tss))],
    ['Work', `${Math.round(r.kj)} kJ`],
    ['W/kg', r.wkg?.toFixed(2) ?? '—'],
    ['Avg / max HR', r.avgHr === null ? '—' : `${r.avgHr} / ${r.maxHr ?? '—'}`],
    ['Cadence', r.avgCadence === null ? '—' : `${r.avgCadence} rpm`],
    ['Variability (VI)', r.vi?.toFixed(2) ?? '—'],
    ['Efficiency (EF)', r.ef?.toFixed(2) ?? '—'],
    ['Decoupling', r.decouplingPct == null ? '—' : `${r.decouplingPct.toFixed(1)} %`],
    ['Distance', `${formatLongDistance(r.distanceM, units, 1)} ${distanceUnit(units)}`],
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6" data-testid="ride-summary">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-line bg-panel px-4 py-3">
          <div className="text-[11px] text-ink-faint">{label}</div>
          <div className="mt-0.5 font-display text-xl font-semibold">{value}</div>
        </div>
      ))}
    </div>
  )
}

/** Stacked small multiples: one metric per chart, one axis each, shared crosshair. */
function Streams({ streams, ride }: { streams: RideStreams; ride: RideSummary }) {
  const speed = useSettings((s) => s.speedUnit)
  const x = useMemo(() => Array.from({ length: streams.length }, (_, i) => i), [streams])
  const wbal = useMemo(() => {
    const wb = new WPrimeBalance({ cp: ride.athlete.cpW ?? ride.athlete.ftpW, wPrimeJ: ride.athlete.wPrimeJ ?? 20_000 })
    return column(streams, 'power').map((p) => wb.push(p, 1) / 1000)
  }, [streams, ride])
  const panels: { key: string; label: string; unit: string; colorVar: string; values: (number | null)[]; wash?: boolean }[] = [
    { key: 'power', label: 'Power', unit: 'W', colorVar: '--color-power', values: column(streams, 'power') },
    { key: 'cadence', label: 'Cadence', unit: 'rpm', colorVar: '--color-cadence', values: column(streams, 'cadence') },
    { key: 'hr', label: 'Heart rate', unit: 'bpm', colorVar: '--color-hr', values: column(streams, 'hr') },
    { key: 'speed', label: 'Speed', unit: speedUnit(speed), colorVar: '--color-speed', values: column(streams, 'speed').map((v) => (v === null ? null : displaySpeedKmh(v * 3.6, speed))) },
    { key: 'wbal', label: "W′ balance", unit: 'kJ', colorVar: '--color-wbal', values: wbal, wash: true },
  ].filter((p) => p.values.some((v) => v !== null))

  return (
    <Card className="mt-4">
      <CardHeader title="Ride data" subtitle="Hover to read every metric at one moment." />
      <CardBody className="space-y-1">
        {panels.map((p, i) => (
          <div key={p.key}>
            <div className="flex items-center gap-2 pl-12 text-xs text-ink-dim">
              <span className="h-0.5 w-4 rounded" style={{ background: `var(${p.colorVar})` }} />
              {p.label} <span className="text-ink-faint">({p.unit})</span>
            </div>
            <UPlot
              ariaLabel={`${p.label} over the ride`}
              optsKey={`${p.key}-${streams.rideId}`}
              data={[x, p.values] as uPlot.AlignedData}
              height={i === 0 ? 150 : 110}
              options={() => ({
                scales: { x: { time: false } },
                axes: [axis({ show: i === panels.length - 1, values: (_u, vals) => vals.map((v) => formatDuration(v)) }), axis({ size: 48 })],
                series: [{ value: (_u, v) => (v == null ? '' : formatDuration(v)) }, line(p.label, p.colorVar, { wash: p.wash })],
                legend: { show: true, live: true },
                cursor: { sync: { key: SYNC_KEY }, points: { size: 8 } },
              })}
            />
          </div>
        ))}
      </CardBody>
    </Card>
  )
}

function Laps({ r }: { r: RideSummary }) {
  return (
    <Card>
      <CardHeader title="Laps & intervals" />
      <CardBody>
        <table className="w-full text-sm">
          <thead className="text-left eyebrow text-ink-faint">
            <tr>
              <th className="pb-2">#</th>
              <th className="pb-2">Time</th>
              <th className="pb-2 text-right">Avg W</th>
              <th className="pb-2 text-right">NP</th>
              <th className="pb-2 text-right">Target</th>
              <th className="pb-2 text-right">HR</th>
              <th className="pb-2 text-right">rpm</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {r.laps.map((l) => (
              <tr key={l.index} className="border-t border-line/60">
                <td className="py-1.5">{l.label ?? l.index + 1}</td>
                <td className="py-1.5">{formatDuration(l.durationS)}</td>
                <td className="py-1.5 text-right">{l.avgPower ?? '—'}</td>
                <td className="py-1.5 text-right">{l.np ?? '—'}</td>
                <td className="py-1.5 text-right">{l.targetW ?? '—'}</td>
                <td className="py-1.5 text-right">{l.avgHr ?? '—'}</td>
                <td className="py-1.5 text-right">{l.avgCadence ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  )
}

function Zones({ r }: { r: RideSummary }) {
  const total = r.powerZonesS.reduce((a, b) => a + b, 0) || 1
  return (
    <Card>
      <CardHeader title="Time in power zones" subtitle={`FTP at the time: ${r.athlete.ftpW} W`} />
      <CardBody className="space-y-2">
        {r.powerZonesS.map((s, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <div className="w-36 shrink-0 text-ink-dim">{POWER_ZONE_LABELS[i]}</div>
            <div className="h-3 flex-1 rounded-full bg-panel-3">
              <div className="h-3 rounded-full" style={{ width: `${(s / total) * 100}%`, background: zoneVar(i) }} />
            </div>
            <div className="tabular w-24 text-right">
              {formatDuration(s)} <span className="text-ink-faint">{Math.round((s / total) * 100)}%</span>
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  )
}

function Notes({ r }: { r: RideSummary }) {
  const [notes, setNotes] = useState(r.notes ?? '')
  const save = (patch: Parameters<typeof updateRide>[1]) => void updateRide(r.id, patch)
  return (
    <Card className="mt-4">
      <CardHeader title="How did it feel?" subtitle="Your rating feeds workout suggestions and the AI coach." />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-24 text-ink-dim">Effort (RPE)</span>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => save({ rpe: n })}
              className={`tabular size-8 rounded-lg border text-sm ${r.rpe === n ? 'border-accent bg-accent/15 text-ink' : 'border-line bg-panel-2 text-ink-dim hover:border-line-strong'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => save({ notes })}
          placeholder="Legs, sleep, fueling, excuses…"
          className="h-24 w-full rounded-xl border border-line bg-panel-2 p-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      </CardBody>
    </Card>
  )
}
