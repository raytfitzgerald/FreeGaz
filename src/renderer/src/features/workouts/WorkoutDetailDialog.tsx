import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, Bike, Copy, Download, FolderInput, PencilLine, Star, Trash2 } from 'lucide-react'
import { WorkoutChart } from '../../charts/WorkoutChart'
import { useDevices } from '../../stores/devices'
import { useRide } from '../../stores/ride'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { formatDuration } from '../../ui/format'
import { POWER_ZONE_LABELS, zoneVar } from '../../ui/zones'
import { copyOf, deleteWorkout, moveToFolder, EXPORT_FORMATS, exportToZwift, exportWorkout, saveWorkout, setFavorite, tagLabel, type ExportFormat, type LibraryEntry } from '../../workouts/library'
import { profileBlocks } from '../../workouts/profile'
import { startWorkout } from './start'

export function WorkoutDetailDialog({
  entry,
  ftpW,
  onClose,
  onNotice,
}: {
  entry: LibraryEntry
  ftpW: number
  onClose: () => void
  onNotice: (n: { tone: 'good' | 'bad'; text: string }) => void
}) {
  const { workout: w, stats, timeline } = entry
  const navigate = useNavigate()
  const riding = useRide((s) => s.active)
  const trainer = useDevices((s) => s.devices.some((d) => d.role === 'trainer' && d.state === 'connected'))
  const blocks = useMemo(() => profileBlocks(timeline, ftpW), [timeline, ftpW])
  const [format, setFormat] = useState<ExportFormat>('zwo')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const totalZone = stats.zoneSeconds.reduce((a, b) => a + b, 0) || 1

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

  const ride = () =>
    run(async () => {
      await startWorkout(w)
      onClose()
      await navigate({ to: '/ride' })
    })

  const edit = () =>
    run(async () => {
      const target = entry.builtin ? await saveWorkout(copyOf(w), ftpW) : w
      onClose()
      await navigate({ to: '/builder', search: { id: target.id } })
    })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={w.name} description={w.description} className="w-[min(920px,calc(100vw-32px))]">
      <div className="space-y-5">
        <WorkoutChart blocks={blocks} durationS={timeline.durationS} ftpW={ftpW} height={200} title={`${w.name} profile`} />

        {w.ftpTest?.protocol === 'ramp' && (
          <div className="rounded-xl border border-line bg-panel-2 px-3 py-2 text-sm text-ink-dim">
            The ramp keeps climbing until you can’t hold the target, then drops you into the cool-down. Most riders finish in 20–30 minutes; the numbers below assume every step, which nobody does.
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {(
            [
              ['Duration', formatDuration(stats.durationS)],
              ['TSS', stats.tss === null ? '—' : Math.round(stats.tss)],
              ['IF', stats.if?.toFixed(2) ?? '—'],
              ['NP', stats.np === null ? '—' : `${Math.round(stats.np)} W`],
              ['Average', `${Math.round(stats.avgW)} W`],
              ['Work', `${Math.round(stats.kj)} kJ`],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-line bg-panel-2 px-3 py-2">
              <div className="text-[11px] text-ink-faint">{label}</div>
              <div className="tabular font-display text-lg font-semibold">{value}</div>
            </div>
          ))}
        </div>

        <div className="space-y-1.5" aria-label="Time in zones">
          {stats.zoneSeconds.map((s, i) =>
            s > 0 ? (
              <div key={i} className="flex items-center gap-3 text-xs">
                <div className="w-32 shrink-0 text-ink-dim">{POWER_ZONE_LABELS[i]}</div>
                <div className="h-2.5 flex-1 rounded-full bg-panel-3">
                  <div className="h-2.5 rounded-full" style={{ width: `${(s / totalZone) * 100}%`, background: zoneVar(i) }} />
                </div>
                <div className="tabular w-20 text-right text-ink-dim">
                  {formatDuration(s)} <span className="text-ink-faint">{Math.round((s / totalZone) * 100)}%</span>
                </div>
              </div>
            ) : null,
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-dim">
          {w.author && <span>By {w.author}</span>}
          {w.tags.map((t) => (
            <span key={t} className="rounded bg-panel-3 px-1.5 py-0.5">
              {tagLabel(t)}
            </span>
          ))}
          {w.ftpTest && <span className="text-accent">Your FTP updates automatically when the test is valid.</span>}
        </div>

        {!trainer && !riding && (
          <div className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs">
            <AlertTriangle className="size-3.5 text-warn" /> No trainer connected: the workout will run, but nothing will control resistance.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button variant="primary" disabled={busy || riding} onClick={() => void ride()} title={riding ? 'Finish the ride in progress first' : undefined} data-testid="ride-workout">
            <Bike className="size-4" /> Ride it
          </Button>
          <Button disabled={busy} onClick={() => void edit()}>
            {entry.builtin ? <Copy className="size-4" /> : <PencilLine className="size-4" />}
            {entry.builtin ? 'Copy to builder' : 'Edit'}
          </Button>
          {!entry.builtin && (
            <Button
              disabled={busy}
              onClick={() => void run(async () => moveToFolder(w.id, entry.folder === 'plan' ? 'custom' : 'plan').then(() => onNotice({ tone: 'good', text: entry.folder === 'plan' ? `Moved ${w.name} to Custom workouts.` : `Added ${w.name} to your training plan.` })))}
              data-testid="move-folder"
            >
              <FolderInput className="size-4" /> {entry.folder === 'plan' ? 'Move to Custom workouts' : 'Add to training plan'}
            </Button>
          )}
          <div className="flex items-center">
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              aria-label="Export format"
              className="h-10 rounded-l-xl border border-line-strong bg-panel-2 px-2 text-sm text-ink"
            >
              {EXPORT_FORMATS.map((f) => (
                <option key={f.id} value={f.id} title={f.hint}>
                  {f.label}
                </option>
              ))}
            </select>
            <Button
              className="rounded-l-none border-l-0"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const path = await exportWorkout(w, format, ftpW)
                  if (path) onNotice({ tone: 'good', text: `Saved ${path}` })
                })
              }
            >
              <Download className="size-4" /> Export
            </Button>
          </div>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await exportToZwift(w, ftpW)
                onNotice(r.error ? { tone: 'bad', text: r.error } : { tone: 'good', text: r.paths.length ? `In Zwift under Custom Workouts (${r.paths.length} account${r.paths.length > 1 ? 's' : ''}).` : 'Downloaded the .zwo file.' })
              })
            }
            title="Copies the .zwo into ~/Documents/Zwift/Workouts"
          >
            Export to Zwift
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button size="icon" variant="ghost" aria-pressed={entry.favorite} aria-label={entry.favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => void setFavorite(entry, !entry.favorite)}>
              <Star className={entry.favorite ? 'size-4 fill-current text-warn' : 'size-4'} />
            </Button>
            {!entry.builtin && (
              <Button size="icon" variant="danger" aria-label="Delete workout" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>
        {confirmDelete && (
          <div className="flex items-center justify-between rounded-xl border border-bad/40 bg-bad/10 px-4 py-2 text-sm">
            Delete “{w.name}” from your library? Rides you did with it keep their copy.
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  void run(async () => {
                    await deleteWorkout(w.id)
                    onClose()
                  })
                }
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
