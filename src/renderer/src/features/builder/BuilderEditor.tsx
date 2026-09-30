import { useEffect, useEffectEvent, useMemo, useReducer, useState } from 'react'
import { useBlocker, useNavigate } from '@tanstack/react-router'
import { Bike, CheckCircle2, CircleDot, Copy, Download, Loader2, Save } from 'lucide-react'
import { compileWorkout } from '@core/workout/compile'
import { replaceSegment, type PaletteItem } from '@core/workout/edit'
import type { Segment, Workout } from '@core/workout/model'
import { workoutStats } from '@core/workout/stats'
import { workoutIssues } from '@core/workout/validate'
import { useFtp } from '../../db/use-athlete'
import { useRide } from '../../stores/ride'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { Select } from '../../ui/form'
import { PageHeader } from '../../ui/PageHeader'
import { Segmented } from '../../ui/Segmented'
import { copyOf, EXPORT_FORMATS, exportToZwift, exportWorkout, saveWorkout, type ExportFormat } from '../../workouts/library'
import { startWorkout } from '../workouts/start'
import { AiPanel } from './AiPanel'
import { Canvas } from './Canvas'
import { canRedo, canUndo } from './history'
import { Inspector } from './Inspector'
import { IssuesList } from './IssuesList'
import { builderCommand, isTextEntry, type BuilderCommand } from './keys'
import type { OpenDoc } from './load'
import { MetaCard } from './MetaCard'
import { Notice, type NoticeMessage } from './Notice'
import { Palette } from './Palette'
import { StatsBar } from './StatsBar'
import { editorReducer, initEditor, isDirty, type EditorAction } from './state'
import { TextMode } from './TextMode'
import { Toolbar } from './Toolbar'

type Mode = 'blocks' | 'text'
type Busy = 'save' | 'ride' | 'export' | 'zwift' | null

const MODES = [
  { value: 'blocks' as const, label: 'Blocks', hint: 'Build with the palette and the canvas' },
  { value: 'text' as const, label: 'Text', hint: 'Type the workout in intervals.icu syntax' },
]

const blockNavigation = () => true
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const COMMANDS: Record<BuilderCommand, EditorAction> = {
  prev: { type: 'selectStep', delta: -1 },
  next: { type: 'selectStep', delta: 1 },
  moveLeft: { type: 'moveSelected', delta: -1 },
  moveRight: { type: 'moveSelected', delta: 1 },
  duplicate: { type: 'duplicateSelected' },
  delete: { type: 'removeSelected' },
  undo: { type: 'undo' },
  redo: { type: 'redo' },
}

export interface BuilderEditorProps {
  doc: OpenDoc
  /** The id in the URL, kept in step with the saved workout. */
  urlId: string | undefined
  /** Tells the page which workout is open now, so the URL change after a save doesn't reload it. */
  onSaved: (id: string) => void
}

/** The workout builder for one opened document: header, stats, palette, canvas or text, inspector, actions. */
export function BuilderEditor({ doc, urlId, onSaved }: BuilderEditorProps) {
  const [state, dispatch] = useReducer(editorReducer, doc.workout, (w) => initEditor(w))
  const [preview, setPreview] = useState<Workout | null>(null)
  const [dragging, setDragging] = useState(false)
  const [mode, setMode] = useState<Mode>('blocks')
  const [notice, setNotice] = useState<NoticeMessage | null>(doc.notice)
  const [stored, setStored] = useState(doc.stored)
  const [busy, setBusy] = useState<Busy>(null)
  const [format, setFormat] = useState<ExportFormat>('zwo')
  const { ftpW, known } = useFtp()
  const riding = useRide((s) => s.active)
  const navigate = useNavigate()

  const { workout: committed, selected } = state.history.present
  const workout = preview ?? committed
  const timeline = useMemo(() => compileWorkout(workout), [workout])
  const stats = useMemo(() => workoutStats(timeline, ftpW), [timeline, ftpW])
  const issues = useMemo(() => workoutIssues(workout), [workout])
  const errors = issues.filter((i) => i.severity === 'error')
  const dirty = useMemo(() => isDirty(state), [state])
  const empty = committed.segments.length === 0
  const blockedReason = errors.length > 0 ? (empty ? 'Add at least one block first.' : `Fix this first: ${errors[0]?.message}`) : undefined

  const blocker = useBlocker({ shouldBlockFn: blockNavigation, disabled: !dirty, withResolver: true, enableBeforeUnload: false })
  const guardOpen = blocker.status === 'blocked'

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (dragging || guardOpen || e.defaultPrevented || isTextEntry(e.target) || isTextEntry(document.activeElement) || document.querySelector('[role="dialog"]')) return
    const cmd = builderCommand(e)
    if (!cmd) return
    e.preventDefault()
    dispatch(COMMANDS[cmd])
  })
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  const save = async (opts: { syncUrl: boolean }): Promise<Workout | null> => {
    if (blockedReason) {
      setNotice({ tone: 'bad', text: `Can't save yet. ${blockedReason}` })
      return null
    }
    setBusy('save')
    try {
      const saved = await saveWorkout(committed, ftpW)
      dispatch({ type: 'saved', workout: saved })
      setStored(true)
      onSaved(saved.id)
      setNotice({ tone: 'good', text: `Saved “${saved.name}” to your library.` })
      if (opts.syncUrl && urlId !== saved.id) void navigate({ to: '/builder', search: { id: saved.id }, replace: true, ignoreBlocker: true })
      return saved
    } catch (e) {
      setNotice({ tone: 'bad', text: `Couldn't save: ${message(e)}` })
      return null
    } finally {
      setBusy(null)
    }
  }

  const ride = async () => {
    const saved = await save({ syncUrl: false })
    if (!saved) return
    setBusy('ride')
    try {
      await startWorkout(saved)
      await navigate({ to: '/ride', ignoreBlocker: true })
    } catch (e) {
      setNotice({ tone: 'bad', text: `Couldn't start the ride: ${message(e)}` })
      setBusy(null)
    }
  }

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<void>) => {
    setBusy(kind)
    try {
      await fn()
    } catch (e) {
      setNotice({ tone: 'bad', text: message(e) })
    } finally {
      setBusy(null)
    }
  }

  const doExport = () =>
    run('export', async () => {
      const path = await exportWorkout(committed, format, ftpW)
      if (path) setNotice({ tone: 'good', text: `Exported to ${path}` })
    })

  const toZwift = () =>
    run('zwift', async () => {
      const r = await exportToZwift(committed, ftpW)
      if (r.error) setNotice({ tone: 'bad', text: r.error })
      else setNotice({ tone: 'good', text: r.paths.length ? `In Zwift under Custom Workouts (${r.paths.length} account${r.paths.length > 1 ? 's' : ''}).` : 'Downloaded the .zwo file.' })
    })

  const duplicate = () => {
    const copy = copyOf(committed)
    dispatch({ type: 'commit', workout: copy, selected })
    setStored(false)
    setNotice({ tone: 'info', text: `Now editing “${copy.name}”, a new workout. Save it to keep it (⌘Z goes back to the original).` })
  }

  const drafted = (w: Workout, model: string | null) => {
    dispatch({ type: 'commit', workout: w, selected: null })
    setStored(false)
    setMode('blocks')
    setNotice({ tone: 'info', text: `Drafted “${w.name}”${model ? ` with ${model}` : ''}. It isn't saved: check it, adjust it, then save. ⌘Z brings back what you had.` })
  }

  const add = (item: PaletteItem) => dispatch({ type: 'insert', item })
  // The inspector shows the live (mid-drag) block; its edits always apply to the committed workout.
  const selectedSeg = selected === null ? undefined : workout.segments[selected]
  const segmentIssues = selected === null ? [] : issues.filter((i) => i.segmentIndex === selected)
  const onSegment = (next: Segment, group?: string) => {
    if (selected === null) return
    dispatch({ type: 'commit', workout: replaceSegment(committed, selected, next), ...(group ? { group: `seg:${selected}:${group}` } : {}) })
  }

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8 pb-12">
      <PageHeader
        title="Workout builder"
        subtitle={`Targets in % of FTP, shown in watts at your FTP of ${ftpW} W${known ? '' : ' (not tested yet)'}.`}
        actions={
          <>
            <SaveState dirty={dirty} stored={stored} />
            <Button
              disabled={busy !== null || riding || !!blockedReason}
              onClick={() => void ride()}
              title={riding ? 'Finish the ride in progress first' : (blockedReason ?? 'Save, then start riding it')}
              data-testid="builder-ride"
            >
              {busy === 'ride' ? <Loader2 className="size-4 animate-spin" /> : <Bike className="size-4" />} Ride it
            </Button>
            <Button variant="primary" disabled={busy !== null} onClick={() => void save({ syncUrl: true })} title={blockedReason ?? 'Save to your library'} data-testid="builder-save">
              {busy === 'save' ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
            </Button>
          </>
        }
      />

      {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <MetaCard workout={committed} onChange={(w, group) => dispatch({ type: 'commit', workout: w, ...(group ? { group } : {}) })} />
          <StatsBar stats={stats} ftpW={ftpW} known={known} />

          <section className="rounded-2xl border border-line bg-panel p-4" aria-label="Blocks">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
              <Segmented ariaLabel="Edit as" value={mode} onChange={setMode} options={MODES} />
              <Toolbar
                state={{ count: committed.segments.length, selected, canUndo: canUndo(state.history), canRedo: canRedo(state.history) }}
                onCommand={(cmd) => dispatch(COMMANDS[cmd])}
              />
            </div>
            {mode === 'blocks' && <Palette onAdd={add} />}
            <div className="mt-3">
              <Canvas
                workout={workout}
                selected={selected}
                ftpW={ftpW}
                onSelect={(index) => dispatch({ type: 'select', index })}
                onPreview={setPreview}
                onCommit={(w, index) => dispatch({ type: 'commit', workout: w, selected: index })}
                onDragging={setDragging}
              />
            </div>
            {mode === 'blocks' ? (
              <p className="mt-2 text-[11px] text-ink-faint">
                Drag a block's right edge for duration (5 s steps, ⌥ for 1 s) and its top for power; drag the block itself to reorder. Esc cancels a drag.
              </p>
            ) : (
              <div className="mt-4">
                <TextMode key={state.rev} workout={committed} onSegments={(segments, group) => dispatch({ type: 'setSegments', segments, group })} />
              </div>
            )}
          </section>

          {!empty && <IssuesList issues={issues} onSelect={(index) => dispatch({ type: 'select', index })} />}
          <AiPanel onDrafted={drafted} />
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-line bg-panel" aria-label="Inspector">
            <div className="border-b border-line px-4 py-2.5 font-display text-sm font-semibold">Block</div>
            <Inspector segment={selectedSeg} index={selected} count={committed.segments.length} ftpW={ftpW} issues={segmentIssues} onChange={onSegment} />
          </section>

          <section className="space-y-2.5 rounded-2xl border border-line bg-panel p-4" aria-label="Export">
            <div className="font-display text-sm font-semibold">Export</div>
            <div className="flex items-center">
              <Select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)} aria-label="Export format" className="h-9 min-w-0 flex-1 rounded-r-none">
                {EXPORT_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </Select>
              <Button className="h-9 rounded-l-none border-l-0" disabled={busy !== null || !!blockedReason} onClick={() => void doExport()} title={blockedReason}>
                {busy === 'export' ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Export
              </Button>
            </div>
            <p className="text-[11px] text-ink-faint">{EXPORT_FORMATS.find((f) => f.id === format)?.hint}</p>
            <Button className="w-full" disabled={busy !== null || !!blockedReason} onClick={() => void toZwift()} title={blockedReason ?? 'Copies the .zwo into ~/Documents/Zwift/Workouts'}>
              {busy === 'zwift' && <Loader2 className="size-4 animate-spin" />} Export to Zwift
            </Button>
            <Button className="w-full" variant="ghost" onClick={duplicate} data-testid="builder-duplicate-workout">
              <Copy className="size-4" /> Duplicate as a new workout
            </Button>
          </section>
        </aside>
      </div>

      {blocker.status === 'blocked' && (
        <Dialog
          open
          onOpenChange={(o) => !o && blocker.reset()}
          title="Leave without saving?"
          description={`“${committed.name || 'This workout'}” has changes that aren't saved.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => blocker.reset()} data-testid="guard-stay">
                Keep editing
              </Button>
              <Button variant="danger" onClick={() => blocker.proceed()} data-testid="guard-discard">
                Discard changes
              </Button>
              <Button
                variant="primary"
                disabled={!!blockedReason || busy !== null}
                title={blockedReason}
                onClick={() => {
                  const { proceed, reset } = blocker
                  void save({ syncUrl: false }).then((saved) => (saved ? proceed() : reset()))
                }}
                data-testid="guard-save"
              >
                Save and leave
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink-dim">Discarding throws away everything since the last save, and the undo history with it.</p>
        </Dialog>
      )}
    </div>
  )
}

function SaveState({ dirty, stored }: { dirty: boolean; stored: boolean }) {
  if (dirty) {
    return (
      <span className="mr-1 flex items-center gap-1.5 text-xs text-ink-dim" data-testid="builder-dirty">
        <CircleDot className="size-3.5 text-warn" aria-hidden /> Unsaved changes
      </span>
    )
  }
  if (!stored) return null
  return (
    <span className="mr-1 flex items-center gap-1.5 text-xs text-ink-dim" data-testid="builder-clean">
      <CheckCircle2 className="size-3.5 text-good" aria-hidden /> Saved
    </span>
  )
}
