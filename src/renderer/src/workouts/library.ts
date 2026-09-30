// The workout library: built-ins (shipped in code) plus the rider's own and
// imported workouts (Dexie). Import/export for .zwo, .mrc, .erg and
// intervals.icu text, and "Export to Zwift".
import { BUILTIN_WORKOUTS } from '@core/workout/builtins'
import { compileWorkout, type Timeline } from '@core/workout/compile'
import { FTP_TESTS } from '@core/workout/ftp-tests'
import { parseErgMrcWithWarnings, toErg, toMrc } from '@core/workout/io/ergmrc'
import { parseIntervalsText, toIntervalsText } from '@core/workout/io/intervals-text'
import { parseZwoWithWarnings, toZwo } from '@core/workout/io/zwo'
import type { Workout, WorkoutFolder } from '@core/workout/model'
import { workoutStats, type WorkoutStats } from '@core/workout/stats'
import { db, type StoredWorkout } from '../db/db'
import { bridge } from '../platform/bridge'

export const BUILTINS: readonly Workout[] = [...FTP_TESTS, ...BUILTIN_WORKOUTS]

export const tagLabel = (t: string) => (t === 'vo2max' ? 'VO2max' : t === 'ftp' ? 'FTP' : t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, ' '))

const FAVORITES_KEY = 'workouts.favorites'

export interface LibraryEntry {
  workout: Workout
  builtin: boolean
  favorite: boolean
  /** Which Workouts tab it lives on. */
  folder: 'freegaz' | WorkoutFolder
  /** Position in the Training plan, for workouts filed there. */
  planOrder?: number
  timeline: Timeline
  stats: WorkoutStats
}

const cache = new Map<string, { json: string; ftpW: number; entry: Omit<LibraryEntry, 'favorite' | 'folder' | 'planOrder'> }>()

/** Compiles and scores a workout (memoized per workout content and FTP). */
export function describeWorkout(workout: Workout, ftpW: number): Omit<LibraryEntry, 'favorite' | 'folder' | 'planOrder'> {
  const json = JSON.stringify(workout)
  const hit = cache.get(workout.id)
  if (hit && hit.json === json && hit.ftpW === ftpW) return hit.entry
  const timeline = compileWorkout(workout)
  const entry = { workout, builtin: workout.source === 'builtin', timeline, stats: workoutStats(timeline, ftpW) }
  cache.set(workout.id, { json, ftpW, entry })
  return entry
}

export async function loadLibrary(ftpW: number): Promise<LibraryEntry[]> {
  const [stored, favKv] = await Promise.all([db().workouts.toArray(), db().kv.get(FAVORITES_KEY)])
  const builtinFavs = new Set((favKv?.value as string[] | undefined) ?? [])
  const mine = stored
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((s) => ({ ...describeWorkout(s.json, ftpW), favorite: s.favorite, folder: s.json.folder ?? 'custom', planOrder: s.planOrder }) satisfies LibraryEntry)
  const builtins = BUILTINS.map((w) => ({ ...describeWorkout(w, ftpW), favorite: builtinFavs.has(w.id), folder: 'freegaz' }) satisfies LibraryEntry)
  return [...mine, ...builtins]
}

export async function getWorkout(id: string): Promise<Workout | null> {
  return BUILTINS.find((w) => w.id === id) ?? (await db().workouts.get(id))?.json ?? null
}

/** Saves a user/imported/AI workout (built-ins are read-only: save a copy instead). */
export async function saveWorkout(w: Workout, ftpW: number): Promise<Workout> {
  if (w.source === 'builtin') throw new Error('Built-in workouts are read-only; save a copy.')
  const now = Date.now()
  const existing = await db().workouts.get(w.id)
  const workout: Workout = { ...w, createdAt: w.createdAt ?? existing?.createdAt ?? now, updatedAt: now }
  const { stats } = describeWorkout(workout, ftpW)
  const row: StoredWorkout = {
    id: workout.id,
    name: workout.name,
    source: workout.source,
    tags: workout.tags,
    durationS: stats.durationS,
    tss: stats.tss,
    favorite: existing?.favorite ?? false,
    planOrder: workout.folder === 'plan' ? (existing?.json.folder === 'plan' && existing.planOrder !== undefined ? existing.planOrder : await nextPlanOrder()) : undefined,
    json: workout,
    createdAt: workout.createdAt!,
    updatedAt: now,
  }
  await db().workouts.put(row)
  return workout
}

async function nextPlanOrder(): Promise<number> {
  const rows = await db().workouts.toArray()
  return rows.reduce((m, r) => (r.json.folder === 'plan' ? Math.max(m, r.planOrder ?? 0) : m), 0) + 1
}

/** Files one of the rider's workouts in Custom workouts or the Training plan (at its end). */
export async function moveToFolder(id: string, folder: WorkoutFolder): Promise<void> {
  const row = await db().workouts.get(id)
  if (!row) throw new Error('Only your own workouts can be moved. Copy a FreeGaz workout to the builder first.')
  const json: Workout = { ...row.json }
  if (folder === 'plan') json.folder = 'plan'
  else delete json.folder
  const planOrder = folder === 'plan' ? (row.json.folder === 'plan' && row.planOrder !== undefined ? row.planOrder : await nextPlanOrder()) : undefined
  await db().workouts.put({ ...row, json, planOrder, updatedAt: Date.now() })
}

/** Moves a Training plan workout one place earlier (-1) or later (+1). */
export async function movePlanItem(id: string, by: -1 | 1): Promise<void> {
  await db().transaction('rw', db().workouts, async () => {
    const plan = (await db().workouts.toArray()).filter((r) => r.json.folder === 'plan').sort((a, b) => (a.planOrder ?? 0) - (b.planOrder ?? 0))
    const i = plan.findIndex((r) => r.id === id)
    const j = i + by
    if (i < 0 || j < 0 || j >= plan.length) return
    ;[plan[i], plan[j]] = [plan[j]!, plan[i]!]
    await Promise.all(plan.map((r, k) => db().workouts.update(r.id, { planOrder: k + 1 })))
  })
}

export async function deleteWorkout(id: string): Promise<void> {
  await db().workouts.delete(id)
}

export async function setFavorite(entry: LibraryEntry, favorite: boolean): Promise<void> {
  if (!entry.builtin) {
    await db().workouts.update(entry.workout.id, { favorite })
    return
  }
  await db().transaction('rw', db().kv, async () => {
    const favs = new Set(((await db().kv.get(FAVORITES_KEY))?.value as string[] | undefined) ?? [])
    if (favorite) favs.add(entry.workout.id)
    else favs.delete(entry.workout.id)
    await db().kv.put({ key: FAVORITES_KEY, value: [...favs] })
  })
}

/** A copy of any workout as the rider's own (new id, source "user"). */
export function copyOf(w: Workout, name = `${w.name} (copy)`): Workout {
  const { createdAt: _c, updatedAt: _u, ...rest } = structuredClone(w)
  return { ...rest, id: `user:${crypto.randomUUID()}`, name, source: 'user' }
}

export interface ImportResult {
  workout: Workout
  warnings: string[]
}

export const IMPORT_EXTENSIONS = ['.zwo', '.mrc', '.erg', '.txt'] as const

/** Parses a workout file by extension. Throws a rider-readable error on failure. */
export function parseWorkoutFile(fileName: string, text: string): ImportResult {
  const ext = fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? ''
  if (ext === '.zwo') {
    const r = parseZwoWithWarnings(text)
    return { workout: { ...r.workout, source: 'import' }, warnings: r.warnings }
  }
  if (ext === '.mrc' || ext === '.erg') {
    const r = parseErgMrcWithWarnings(text)
    return { workout: { ...r.workout, source: 'import', name: r.workout.name || fileName.replace(/\.[^.]+$/, '') }, warnings: r.warnings }
  }
  if (ext === '.txt') {
    // plain text has no name of its own: the file's name is the workout's
    const r = parseIntervalsText(text, { name: fileName.replace(/\.[^.]+$/, '') })
    if (r.workout.segments.length === 0) throw new Error(r.errors[0] ? `Line ${r.errors[0].line}: ${r.errors[0].message}` : 'No workout steps found.')
    return { workout: { ...r.workout, source: 'import' }, warnings: r.errors.map((e) => `Line ${e.line}: ${e.message}`) }
  }
  throw new Error(`FreeGaz can't read ${ext || 'this'} files. Use .zwo, .mrc, .erg or intervals.icu text (.txt).`)
}

export type ExportFormat = 'zwo' | 'mrc' | 'erg' | 'txt'

export const EXPORT_FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: 'zwo', label: 'Zwift (.zwo)', hint: 'Zwift, TrainerRoad, FulGaz, MyWhoosh and most apps' },
  { id: 'mrc', label: 'MRC (% FTP)', hint: 'Classic course file in percent of FTP' },
  { id: 'erg', label: 'ERG (watts)', hint: 'Classic course file in absolute watts at your FTP' },
  { id: 'txt', label: 'intervals.icu text', hint: 'Paste into the intervals.icu workout builder' },
]

export function workoutFileName(w: Workout, format: ExportFormat): string {
  return `${w.name.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'workout'}.${format}`
}

export function serializeWorkout(w: Workout, format: ExportFormat, ftpW: number): string {
  switch (format) {
    case 'zwo':
      return toZwo(w, { ftpW })
    case 'mrc':
      return toMrc(w, { ftpW })
    case 'erg':
      return toErg(w, ftpW)
    case 'txt':
      return toIntervalsText(w)
  }
}

export async function exportWorkout(w: Workout, format: ExportFormat, ftpW: number): Promise<string | null> {
  const text = serializeWorkout(w, format, ftpW)
  const res = await bridge().invoke('files.saveAs', {
    defaultName: workoutFileName(w, format),
    bytes: new TextEncoder().encode(text),
    filters: [{ name: EXPORT_FORMATS.find((f) => f.id === format)!.label, extensions: [format] }],
  })
  return res.path
}

/** Drops the .zwo into Zwift's custom-workouts folder. */
export async function exportToZwift(w: Workout, ftpW: number): Promise<{ paths: string[]; error: string | null }> {
  return bridge().invoke('files.exportZwift', { fileName: workoutFileName(w, 'zwo'), text: toZwo(w, { ftpW }) })
}
