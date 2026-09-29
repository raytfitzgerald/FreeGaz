import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { FileUp, Gauge, Plus, Search, Star } from 'lucide-react'
import { WorkoutThumb } from '../../charts/WorkoutThumb'
import { useFtp } from '../../db/use-athlete'
import { Button } from '../../ui/Button'
import { Input, Select } from '../../ui/form'
import { PageHeader } from '../../ui/PageHeader'
import { cn } from '../../ui/cn'
import { formatDurationShort } from '../../ui/format'
import { IMPORT_EXTENSIONS, loadLibrary, parseWorkoutFile, saveWorkout, tagLabel, type LibraryEntry } from '../../workouts/library'
import { profileBlocks } from '../../workouts/profile'
import { WorkoutDetailDialog } from './WorkoutDetailDialog'

type Filter = 'all' | 'favorites' | 'tests' | 'mine' | `tag:${string}`
type Length = 'any' | 'short' | 'medium' | 'long'

const LENGTHS: { id: Length; label: string; test: (s: number) => boolean }[] = [
  { id: 'any', label: 'Any length', test: () => true },
  { id: 'short', label: 'Under 45 min', test: (s) => s < 45 * 60 },
  { id: 'medium', label: '45–75 min', test: (s) => s >= 45 * 60 && s <= 75 * 60 },
  { id: 'long', label: 'Over 75 min', test: (s) => s > 75 * 60 },
]

export function WorkoutsPage() {
  const { ftpW, known } = useFtp()
  const library = useLiveQuery(() => loadLibrary(ftpW), [ftpW])
  const [filter, setFilter] = useState<Filter>('all')
  const [length, setLength] = useState<Length>('any')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const tags = useMemo(() => {
    const count = new Map<string, number>()
    for (const e of library ?? []) for (const t of e.workout.tags) if (t !== 'test' && t !== 'ftp') count.set(t, (count.get(t) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [library])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const lengthTest = LENGTHS.find((l) => l.id === length)!.test
    return (library ?? []).filter((e) => {
      const w = e.workout
      if (filter === 'favorites' && !e.favorite) return false
      if (filter === 'tests' && !w.ftpTest) return false
      if (filter === 'mine' && e.builtin) return false
      if (filter.startsWith('tag:') && !w.tags.includes(filter.slice(4))) return false
      if (!lengthTest(e.stats.durationS)) return false
      return !q || w.name.toLowerCase().includes(q) || (w.description ?? '').toLowerCase().includes(q) || w.tags.some((t) => t.includes(q))
    })
  }, [library, filter, length, query])

  const importFiles = async (files: FileList | File[]) => {
    const done: string[] = []
    const failed: string[] = []
    for (const f of Array.from(files)) {
      try {
        const { workout } = parseWorkoutFile(f.name, await f.text())
        await saveWorkout(workout, ftpW)
        done.push(workout.name)
      } catch (e) {
        failed.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    setNotice(
      failed.length > 0
        ? { tone: 'bad', text: `${done.length ? `Imported ${done.join(', ')}. ` : ''}Couldn't import ${failed.join('; ')}` }
        : { tone: 'good', text: `Imported ${done.join(', ')}.` },
    )
    if (done.length === 1 && failed.length === 0) setFilter('mine')
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 0) void importFiles(e.dataTransfer.files)
  }

  const open = library?.find((e) => e.workout.id === openId) ?? null
  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'favorites', label: 'Favorites' },
    { id: 'tests', label: 'FTP tests' },
    { id: 'mine', label: 'Mine & imported' },
    ...tags.map((t) => ({ id: `tag:${t}` as const, label: tagLabel(t) })),
  ]

  return (
    <div
      className={cn('mx-auto max-w-6xl px-8 pb-12', dragging && 'outline-2 outline-dashed outline-accent/60')}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <PageHeader
        title="Workouts"
        subtitle={`${library?.length ?? '…'} workouts. Targets shown at your FTP of ${ftpW} W${known ? '' : ' (not tested yet)'}.`}
        actions={
          <>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={IMPORT_EXTENSIONS.join(',')}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void importFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <Button size="sm" onClick={() => fileInput.current?.click()} title="Or drop .zwo / .mrc / .erg / .txt files on this page">
              <FileUp className="size-3.5" /> Import
            </Button>
            <Button size="sm" variant="primary" asChild>
              <Link to="/builder">
                <Plus className="size-3.5" /> New workout
              </Link>
            </Button>
          </>
        }
      />

      {!known && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-accent/40 bg-accent/5 px-5 py-3 text-sm">
          <span className="flex items-center gap-2">
            <Gauge className="size-4 text-accent" /> Workouts are sized to your FTP. You haven't tested yet: the ramp test takes about 20 minutes.
          </span>
          <Button size="sm" onClick={() => setOpenId('builtin:ramp-test')}>
            See the ramp test
          </Button>
        </div>
      )}

      {notice && (
        <div className={cn('mb-4 rounded-xl border px-4 py-2 text-sm', notice.tone === 'good' ? 'border-good/40 bg-good/5' : 'border-bad/40 bg-bad/10')} role="status">
          {notice.text}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative mr-2 w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search workouts" className="pl-9" aria-label="Search workouts" />
        </div>
        <Select value={length} onChange={(e) => setLength(e.target.value as Length)} aria-label="Workout length" className="w-40">
          {LENGTHS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={filter === c.id}
              onClick={() => setFilter(c.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs',
                filter === c.id ? 'border-accent bg-accent/15 text-ink' : 'border-line bg-panel-2 text-ink-dim hover:border-line-strong hover:text-ink',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {library && visible.length === 0 && <div className="py-16 text-center text-ink-faint">No workouts match. Try another filter.</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="workout-grid">
        {visible.map((e) => (
          <WorkoutCard key={e.workout.id} entry={e} ftpW={ftpW} onOpen={() => setOpenId(e.workout.id)} />
        ))}
      </div>

      {open && <WorkoutDetailDialog entry={open} ftpW={ftpW} onClose={() => setOpenId(null)} onNotice={setNotice} />}
    </div>
  )
}

function WorkoutCard({ entry, ftpW, onOpen }: { entry: LibraryEntry; ftpW: number; onOpen: () => void }) {
  const { workout: w, stats } = entry
  const blocks = useMemo(() => profileBlocks(entry.timeline, ftpW), [entry.timeline, ftpW])
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col rounded-2xl border border-line bg-panel p-4 text-left transition-colors hover:border-line-strong hover:bg-panel-2"
      data-testid="workout-card"
    >
      <div className="rounded-lg bg-panel-2 px-2 pt-2 group-hover:bg-panel-3">
        <WorkoutThumb blocks={blocks} durationS={entry.timeline.durationS} />
      </div>
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="font-semibold leading-snug">{w.name}</div>
        {entry.favorite && <Star className="mt-0.5 size-4 shrink-0 fill-current text-warn" aria-label="Favorite" />}
      </div>
      <div className="tabular mt-1 text-xs text-ink-dim">
        {formatDurationShort(stats.durationS)}
        {stats.tss !== null && ` · TSS ${Math.round(stats.tss)}`}
        {stats.if !== null && ` · IF ${stats.if.toFixed(2)}`}
        {w.ftpTest && ' · FTP test'}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {!entry.builtin && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-ink">{w.source === 'import' ? 'Imported' : w.source === 'ai' ? 'AI' : 'Mine'}</span>}
        {w.tags.slice(0, 3).map((t) => (
          <span key={t} className="rounded bg-panel-3 px-1.5 py-0.5 text-[10px] text-ink-dim">
            {tagLabel(t)}
          </span>
        ))}
      </div>
    </button>
  )
}
