import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, Bike, Ghost, Gauge, Trash2 } from 'lucide-react'
import { DEFAULT_BIKE } from '@core/physics/bike'
import { chunkSpeeds, gradeChunks, recordedPaceTimes, recordedTimeBetween, timeAtSpeeds } from '@core/ride/route-course'
import type { Route } from '@core/routes/model'
import type { RouteMode } from '@core/routes/player'
import { athleteSnapshot } from '../../db/athlete-repo'
import { useDevices } from '../../stores/devices'
import { useRide } from '../../stores/ride'
import { useSettings } from '../../stores/settings'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { Select } from '../../ui/form'
import { formatDate, formatDuration } from '../../ui/format'
import { formatKm } from '../../routes/format'
import { distanceUnit, formatElevation, formatSpeedKmh, speedUnit, type UnitSystem } from '@core/units'
import { formatGrade } from '../../routes/grade'
import { deleteRoute, loadRoute, routeRides, type RouteEntry, type RouteRideEntry } from '../../routes/routes-repo'
import { startRouteRide, type GhostChoice } from '../../routes/start'
import { ElevationChart } from './ElevationChart'
import { GradeLegend } from './GradeLegend'
import { RouteOutline } from './RouteOutline'

export type Notice = { tone: 'good' | 'bad'; text: string }

const MODES: { mode: RouteMode; label: string; hint: string }[] = [
  { mode: 'reactive', label: 'Reactive', hint: 'Your watts set your speed; the trainer follows the gradient.' },
  { mode: 'steady', label: 'Steady', hint: 'The route rolls at its recorded pace, or a steady fallback; the gradient still comes to you on schedule.' },
  { mode: 'challenge', label: 'Challenge', hint: 'Reactive, racing a ghost of an earlier effort.' },
]

export function RouteDetailDialog({ entry, onClose, onNotice }: { entry: RouteEntry; onClose: () => void; onNotice: (n: Notice) => void }) {
  const navigate = useNavigate()
  const route = useLiveQuery(() => loadRoute(entry.id), [entry.id])
  const rides = useLiveQuery(() => routeRides(entry.id), [entry.id])
  const athlete = useLiveQuery(() => athleteSnapshot(), [])
  const riding = useRide((s) => s.active)
  const trainer = useDevices((s) => s.devices.some((d) => d.role === 'trainer' && d.state === 'connected'))
  const units = useSettings((s) => s.units)
  const speed = useSettings((s) => s.speedUnit)
  const [laps, setLaps] = useState(1)
  const [ghostKey, setGhostKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // The default ghost: your fastest finish here, else the file's recorded pace, else your latest partial ride.
  const fastest = rides?.find((r) => r.finishS !== null)
  const ghostChoice = ghostKey ?? fastest?.rideId ?? (entry.hasTimes ? 'recorded' : (rides?.[0]?.rideId ?? null))
  const ghost = ghostOption(ghostChoice, rides ?? [])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      onNotice({ tone: 'bad', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const ride = (mode: RouteMode) =>
    run(async () => {
      if (!route) return
      await startRouteRide(route, { mode, laps: entry.loop ? laps : 1, ghost: mode === 'challenge' ? (ghost ?? undefined) : undefined })
      onClose()
      await navigate({ to: '/ride' })
    })

  const remove = () =>
    run(async () => {
      await deleteRoute(entry.id)
      onNotice({ tone: 'good', text: `Deleted ${entry.name}. Its rides stay in History.` })
      onClose()
    })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={entry.name} description={describe(entry)} className="w-[min(980px,calc(100vw-32px))]">
      {!route ? (
        <div className="py-16 text-center text-sm text-ink-faint">{route === null ? 'This route is no longer in your library.' : 'Loading the route…'}</div>
      ) : (
        <div className="space-y-4" data-testid="route-detail">
          <div className="rounded-xl border border-line bg-panel-2/40 p-3">
            <ElevationChart route={route} laps={1} height={200} title={`${entry.name} elevation profile, coloured by grade`} testId="route-profile" />
            <GradeLegend className="mt-2 pl-11" />
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
            <div className="rounded-xl border border-line bg-panel-2/40 p-2">
              <RouteOutline route={route} height={210} title={`${entry.name} route outline, north up`} testId="route-map" />
            </div>
            <Stats route={route} entry={entry} ftpW={athlete?.ftpW ?? null} weightKg={athlete?.weightKg ?? null} laps={entry.loop ? laps : 1} />
          </div>

          {!trainer && !riding && (
            <div className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs">
              <AlertTriangle className="size-3.5 text-warn" /> No trainer connected: the route will play, but nothing will set the resistance.
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
            {entry.loop && (
              <label className="text-xs text-ink-dim">
                <div className="mb-1">Laps</div>
                <Select value={laps} onChange={(e) => setLaps(Number(e.target.value))} aria-label="Laps" data-testid="route-laps">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'lap' : 'laps'}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <label className="min-w-64 flex-1 text-xs text-ink-dim">
              <div className="mb-1 flex items-center gap-1.5">
                <Ghost className="size-3.5" aria-hidden /> Challenge ghost
              </div>
              <Select
                value={ghostChoice ?? ''}
                onChange={(e) => setGhostKey(e.target.value)}
                disabled={!ghostChoice}
                aria-label="Challenge ghost"
                className="w-full"
                data-testid="route-ghost"
              >
                {!ghostChoice && <option value="">Ride this route once to race yourself</option>}
                {(rides ?? []).map((r) => (
                  <option key={r.rideId} value={r.rideId}>
                    {rideLabel(r, units)}
                  </option>
                ))}
                {entry.hasTimes && <option value="recorded">The file’s recorded pace</option>}
              </Select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {MODES.map((m) => (
              <Button
                key={m.mode}
                variant={m.mode === 'reactive' ? 'primary' : 'secondary'}
                disabled={busy || riding || !route || (m.mode === 'challenge' && !ghost)}
                title={riding ? 'Finish the ride in progress first' : m.mode === 'steady' ? `The route rolls at its recorded pace (or ${formatSpeedKmh(25, speed)} ${speedUnit(speed)}); the gradient still comes to you on schedule.` : m.hint}
                onClick={() => void ride(m.mode)}
                data-testid={`ride-route-${m.mode}`}
              >
                {m.mode === 'challenge' ? <Ghost className="size-4" /> : m.mode === 'steady' ? <Gauge className="size-4" /> : <Bike className="size-4" />}
                {m.label}
              </Button>
            ))}
            <span className="ml-1 text-xs text-ink-faint">Switch Reactive and Steady any time during the ride.</span>
            {!entry.builtin && (
              <span className="ml-auto flex items-center gap-2">
                {confirmDelete ? (
                  <>
                    <span className="text-xs text-ink-dim">Delete this route?</span>
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => void remove()}>
                      Delete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                      Keep
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                )}
              </span>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}

function Stats({ route, entry, ftpW, weightKg, laps }: { route: Route; entry: RouteEntry; ftpW: number | null; weightKg: number | null; laps: number }) {
  const t = useSettings((s) => s.trainer)
  const units = useSettings((s) => s.units)
  const speed = useSettings((s) => s.speedUnit)
  const estimate = useMemo(() => {
    if (ftpW === null || weightKg === null) return null
    const watts = Math.round(ftpW * 0.75)
    const bike = { ...DEFAULT_BIKE, riderKg: weightKg, bikeKg: t.bikeKg, cda: t.cda, crr: t.crr }
    const chunks = gradeChunks(route.profile)
    const s = timeAtSpeeds(chunks, chunkSpeeds(chunks, watts, bike), 0, route.distanceM)
    return Number.isFinite(s) ? { watts, s: s * laps } : null
  }, [route, ftpW, weightKg, t.bikeKg, t.cda, t.crr, laps])
  const steadyS = useMemo(() => {
    const times = recordedPaceTimes(route.profile)
    return (times ? recordedTimeBetween(route.profile, times, 0, route.distanceM) : route.distanceM / (25 / 3.6)) * laps
  }, [route, laps])
  const items: [string, string][] = [
    ['Distance', `${formatKm(route.distanceM * laps, 1, units)} ${distanceUnit(units)}`],
    ['Climbing', formatElevation(route.elevationGainM * laps, units)],
    ['Descending', formatElevation(route.elevationLossM * laps, units)],
    ['Steepest', formatGrade(route.maxGradePct)],
    ['Reactive estimate', estimate ? `${formatDuration(estimate.s)} at ${estimate.watts} W` : '—'],
    [entry.hasTimes ? 'Steady (recorded pace)' : `Steady (${formatSpeedKmh(25, speed)} ${speedUnit(speed)})`, formatDuration(steadyS)],
  ]
  return (
    <div className="grid grid-cols-2 content-start gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-line bg-panel-2 px-3 py-2">
          <div className="text-[11px] text-ink-faint">{label}</div>
          <div className="tabular font-display text-lg font-semibold">{value}</div>
        </div>
      ))}
      <div className="col-span-2 text-[11px] leading-relaxed text-ink-faint">
        Reactive estimate: steady power at 75 % of your FTP, your weight and your bike settings. Steepest is the smoothed grade the trainer can be asked for, before your slope scaling.
      </div>
    </div>
  )
}

function ghostOption(key: string | null, rides: RouteRideEntry[]): GhostChoice | null {
  if (key === 'recorded') return { kind: 'recorded' }
  const r = rides.find((x) => x.rideId === key)
  return r ? { kind: 'ride', rideId: r.rideId, label: `Your ride, ${formatDate(r.startedAt)}` } : null
}

function rideLabel(r: RouteRideEntry, units: UnitSystem): string {
  const time = r.finishS !== null ? formatDuration(r.finishS) : `stopped at ${formatKm(r.distanceM, 1, units)} ${distanceUnit(units)}`
  const power = r.avgPower !== null ? ` · ${r.avgPower} W avg` : ''
  const mode = r.mode === 'steady' ? ' · Steady' : ''
  return `${formatDate(r.startedAt)} · ${time}${power}${mode}${r.laps > 1 ? ` · ${r.laps} laps` : ''}${r.simulated ? ' · simulated' : ''}`
}

function describe(e: RouteEntry): string {
  const where = e.builtin ? 'Built-in demo route' : `Imported ${e.fileName ? `from ${e.fileName}` : e.source.toUpperCase()}`
  return `${where}${e.loop ? ' · a loop you can ride for laps' : ''}${e.hasTimes ? ' · Steady rides its recorded pace' : ''}.`
}
