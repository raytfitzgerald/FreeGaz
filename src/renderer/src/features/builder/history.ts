// Undo/redo as a bounded stack of immutable snapshots. Consecutive commits
// that share a group key (typing into one field, one text-mode session)
// coalesce into a single step.

export const HISTORY_LIMIT = 100

export interface History<T> {
  past: readonly T[]
  present: T
  future: readonly T[]
  /** Group of the last commit: a commit with the same group replaces it instead of adding a step. */
  group: string | null
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], group: null }
}

/** A new present. Clears redo; keeps at most HISTORY_LIMIT undo steps. */
export function commit<T>(h: History<T>, next: T, group: string | null = null): History<T> {
  if (group !== null && group === h.group) return { ...h, present: next, future: [] }
  const past = [...h.past, h.present]
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT)
  return { past, present: next, future: [], group }
}

/** Replaces the present without adding a step (for state that rides along, like the selection). */
export function amend<T>(h: History<T>, next: T): History<T> {
  return { ...h, present: next, group: null }
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1] as T, future: [h.present, ...h.future], group: null }
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h
  return { past: [...h.past, h.present], present: h.future[0] as T, future: h.future.slice(1), group: null }
}

export const canUndo = (h: History<unknown>): boolean => h.past.length > 0
export const canRedo = (h: History<unknown>): boolean => h.future.length > 0
