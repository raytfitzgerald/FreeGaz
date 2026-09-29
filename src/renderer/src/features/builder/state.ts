// The builder's editing state: an undoable draft (workout + selection), the
// content key of the version on disk for the unsaved-changes check, and a
// revision that text mode watches. Pure: the React side only dispatches.
import {
  duplicateSegment,
  insertionIndex,
  insertSegment,
  moveSegment,
  newSegment,
  removeSegment,
  type PaletteItem,
} from '@core/workout/edit'
import type { Segment, Workout } from '@core/workout/model'
import { amend, commit, createHistory, redo, undo, type History } from './history'

export interface Draft {
  workout: Workout
  /** Index of the selected segment, or null. Undo restores it with the workout. */
  selected: number | null
}

export interface EditorState {
  history: History<Draft>
  /** contentKey of the saved (or untouched) version; null when there is none, so the draft is dirty until saved. */
  cleanKey: string | null
  /** Bumped by every workout change that didn't come from text mode (text mode re-reads the workout then). */
  rev: number
}

export type EditorAction =
  | { type: 'commit'; workout: Workout; selected?: number | null; group?: string }
  /** Text mode: new segments for the current workout (never bumps `rev`). */
  | { type: 'setSegments'; segments: Segment[]; group: string }
  | { type: 'select'; index: number | null }
  | { type: 'selectStep'; delta: -1 | 1 }
  | { type: 'moveSelected'; delta: -1 | 1 }
  | { type: 'insert'; item: PaletteItem }
  | { type: 'duplicateSelected' }
  | { type: 'removeSelected' }
  | { type: 'undo' }
  | { type: 'redo' }
  /** The workout just written to the library: it becomes the clean baseline. */
  | { type: 'saved'; workout: Workout }

/**
 * Identity of a workout's content for the unsaved-changes check: everything
 * but the timestamps saveWorkout stamps on.
 */
export function contentKey(w: Workout): string {
  return JSON.stringify(w, (k, v: unknown) => (k === 'createdAt' || k === 'updatedAt' ? undefined : v))
}

/** `clean: false` opens a workout that exists nowhere yet (AI, duplicate) as unsaved. */
export function initEditor(workout: Workout, clean = true): EditorState {
  return { history: createHistory({ workout, selected: null }), cleanKey: clean ? contentKey(workout) : null, rev: 0 }
}

export function isDirty(s: EditorState): boolean {
  return s.cleanKey !== contentKey(s.history.present.workout)
}

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  const { workout: w, selected } = s.history.present
  const n = w.segments.length
  switch (a.type) {
    case 'commit': {
      const sel = a.selected === undefined ? clampSelection(selected, a.workout.segments.length) : a.selected
      if (a.workout === w && sel === selected) return s
      return change(s, { workout: a.workout, selected: sel }, a.group)
    }
    case 'setSegments': {
      const next = { ...w, segments: a.segments }
      return { ...s, history: commit(s.history, { workout: next, selected: clampSelection(selected, a.segments.length) }, a.group) }
    }
    case 'select': {
      const index = a.index !== null && a.index >= 0 && a.index < n ? a.index : null
      return index === selected ? s : { ...s, history: amend(s.history, { workout: w, selected: index }) }
    }
    case 'selectStep': {
      if (n === 0) return s
      const index = selected === null ? (a.delta > 0 ? 0 : n - 1) : Math.max(0, Math.min(n - 1, selected + a.delta))
      return index === selected ? s : { ...s, history: amend(s.history, { workout: w, selected: index }) }
    }
    case 'moveSelected': {
      if (selected === null) return s
      const to = selected + a.delta
      if (to < 0 || to >= n) return s
      return change(s, { workout: moveSegment(w, selected, to), selected: to })
    }
    case 'insert': {
      const at = insertionIndex(w, selected)
      return change(s, { workout: insertSegment(w, at, newSegment(a.item)), selected: at })
    }
    case 'duplicateSelected':
      return selected === null ? s : change(s, { workout: duplicateSegment(w, selected), selected: selected + 1 })
    case 'removeSelected': {
      if (selected === null) return s
      const next = removeSegment(w, selected)
      return change(s, { workout: next, selected: clampSelection(selected, next.segments.length) })
    }
    case 'undo': {
      const history = undo(s.history)
      return history === s.history ? s : { ...s, history, rev: s.rev + 1 }
    }
    case 'redo': {
      const history = redo(s.history)
      return history === s.history ? s : { ...s, history, rev: s.rev + 1 }
    }
    case 'saved':
      return { ...s, cleanKey: contentKey(a.workout) }
  }
}

function change(s: EditorState, next: Draft, group?: string): EditorState {
  return { ...s, history: commit(s.history, next, group ?? null), rev: s.rev + 1 }
}

function clampSelection(selected: number | null, n: number): number | null {
  if (selected === null || n === 0) return null
  return Math.max(0, Math.min(n - 1, selected))
}
