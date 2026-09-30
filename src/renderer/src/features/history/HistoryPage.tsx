import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Bike, FileDown, FileUp, FlaskConical, Gauge, LifeBuoy, Mountain } from 'lucide-react'
import type { RideSummary } from '@core/ride/types'
import { db } from '../../db/db'
import { importFitFiles, type FitImportReport } from '../../db/fit-import'
import { Button } from '../../ui/Button'
import { PageHeader } from '../../ui/PageHeader'
import { cn } from '../../ui/cn'
import { formatDate, formatDurationShort } from '../../ui/format'
import { Segmented } from '../../ui/Segmented'
import { THIS_DEVICE } from '../../platform/where'
import { RideCalendar } from './RideCalendar'

const KIND_ICON = { free: Bike, workout: Gauge, route: Mountain, 'ftp-test': FlaskConical } as const

type View = 'list' | 'calendar'
const VIEW_KEY = 'freegaz.history.view'
/** The last view picked, per Mac: a convenience, so storage failing just means the list. */
function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'calendar' ? 'calendar' : 'list'
  } catch {
    return 'list'
  }
}
function saveView(v: View): void {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    // storage unavailable: the choice lasts until the page closes
  }
}

export function HistoryPage() {
  const rides = useLiveQuery(() => db().rides.orderBy('startedAt').reverse().limit(500).toArray(), [])
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [report, setReport] = useState<FitImportReport | null>(null)
  const [dragging, setDragging] = useState(false)
  const [view, setView] = useState<View>(savedView)
  const pick = (v: View) => {
    setView(v)
    saveView(v)
  }

  const importFiles = async (list: FileList | File[]) => {
    const files = await Promise.all(Array.from(list).filter((f) => /\.fit$/i.test(f.name)).map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })))
    if (files.length === 0) return
    setReport(null)
    try {
      setReport(await importFitFiles(files, (done, total) => setBusy(`Importing ${done} of ${total}…`)))
    } finally {
      setBusy(null)
    }
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void importFiles(e.dataTransfer.files)
  }

  return (
    <div
      className={cn('mx-auto max-w-6xl px-4 md:px-8 pb-10', dragging && 'outline-2 outline-dashed outline-accent/60')}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <PageHeader
        title="History"
        subtitle={`Every ride, every second, stored on ${THIS_DEVICE}.`}
        actions={
          <>
            <Segmented
              ariaLabel="History view"
              value={view}
              onChange={pick}
              options={[
                { value: 'list', label: 'List', hint: 'Every ride, newest first' },
                { value: 'calendar', label: 'Calendar', hint: 'A month at a time' },
              ]}
            />
            <input ref={input} type="file" accept=".fit" multiple className="hidden" onChange={(e) => e.target.files && void importFiles(e.target.files)} />
            <Button size="sm" disabled={!!busy} onClick={() => input.current?.click()} title="Garmin, Wahoo or other apps' .fit files (or drop them here)">
              <FileUp className="size-3.5" /> {busy ?? 'Import FIT files'}
            </Button>
          </>
        }
      />
      {report && <ImportReport report={report} onClose={() => setReport(null)} />}
      {rides && rides.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-ink-faint">
          No rides yet. Go suffer and come back, or drop old .fit files here to bring your history with you.
        </div>
      )}
      {rides && rides.length > 0 && view === 'calendar' && <RideCalendar />}
      {rides && rides.length > 0 && view === 'list' && (
        <div className="overflow-hidden rounded-2xl border border-line" data-testid="ride-list">
          <table className="w-full text-sm">
            <thead className="bg-panel-2 text-left eyebrow text-ink-faint">
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

function ImportReport({ report, onClose }: { report: FitImportReport; onClose: () => void }) {
  return (
    <div className="mb-4 rounded-2xl border border-line bg-panel px-5 py-3 text-sm" role="status" data-testid="fit-import-report">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-medium">
          <FileDown className="size-4 text-accent" /> Imported {report.imported.length} ride{report.imported.length === 1 ? '' : 's'}
          {report.skipped.length > 0 && `, skipped ${report.skipped.length}`}
        </span>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Dismiss
        </Button>
      </div>
      {report.skipped.length > 0 && (
        <ul className="mt-1 max-h-32 overflow-auto text-xs text-ink-dim">
          {report.skipped.map((s) => (
            <li key={s.name}>
              {s.name}: {s.reason}
            </li>
          ))}
        </ul>
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
