import { describe, expect, it } from 'vitest'
import { newSegment, newWorkout } from '@core/workout/edit'
import type { Workout } from '@core/workout/model'
import { contentKey, editorReducer, initEditor, isDirty, type EditorAction, type EditorState } from './state'

const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, s)
const kinds = (s: EditorState) => s.history.present.workout.segments.map((seg) => (seg.kind === 'steady' ? `s${seg.power.value}` : seg.kind))
const sel = (s: EditorState) => s.history.present.selected

describe('builder editor state', () => {
  const fresh = () => initEditor(newWorkout('user:t'))

  it('inserts palette blocks after the selection (or at the end) and selects them', () => {
    let s = run(fresh(), { type: 'insert', item: 'warmup' }, { type: 'insert', item: 'z4' })
    expect(kinds(s)).toEqual(['ramp', 's0.98'])
    expect(sel(s)).toBe(1)
    s = run(s, { type: 'select', index: 0 }, { type: 'insert', item: 'z2' })
    expect(kinds(s)).toEqual(['ramp', 's0.66', 's0.98'])
    expect(sel(s)).toBe(1)
    s = run(s, { type: 'select', index: null }, { type: 'insert', item: 'cooldown' })
    expect(kinds(s)).toEqual(['ramp', 's0.66', 's0.98', 'ramp'])
    expect(sel(s)).toBe(3)
  })

  it('steps the selection and moves the selected block, staying in range', () => {
    let s = run(fresh(), { type: 'insert', item: 'z1' }, { type: 'insert', item: 'z2' }, { type: 'insert', item: 'z3' }, { type: 'select', index: null })
    expect(sel(run(s, { type: 'selectStep', delta: 1 }))).toBe(0)
    expect(sel(run(s, { type: 'selectStep', delta: -1 }))).toBe(2)
    s = run(s, { type: 'select', index: 0 }, { type: 'selectStep', delta: -1 })
    expect(sel(s)).toBe(0)
    s = run(s, { type: 'moveSelected', delta: 1 }, { type: 'moveSelected', delta: 1 })
    expect(kinds(s)).toEqual(['s0.66', 's0.83', 's0.5'])
    expect(sel(s)).toBe(2)
    // Past the end is a no-op, not a step.
    expect(run(s, { type: 'moveSelected', delta: 1 })).toBe(s)
    expect(run(s, { type: 'select', index: 9 }).history.present.selected).toBeNull()
  })

  it('duplicates and deletes the selection', () => {
    let s = run(fresh(), { type: 'insert', item: 'z2' }, { type: 'insert', item: 'intervals' }, { type: 'duplicateSelected' })
    expect(kinds(s)).toEqual(['s0.66', 'intervals', 'intervals'])
    expect(sel(s)).toBe(2)
    s = run(s, { type: 'removeSelected' })
    expect(kinds(s)).toEqual(['s0.66', 'intervals'])
    expect(sel(s)).toBe(1)
    s = run(s, { type: 'select', index: 0 }, { type: 'removeSelected' }, { type: 'removeSelected' })
    expect(kinds(s)).toEqual([])
    expect(sel(s)).toBeNull()
    expect(run(s, { type: 'removeSelected' })).toBe(s)
    expect(run(s, { type: 'duplicateSelected' })).toBe(s)
  })

  it('undo restores the workout together with its selection', () => {
    let s = run(fresh(), { type: 'insert', item: 'z1' }, { type: 'insert', item: 'z5' }, { type: 'insert', item: 'z3' }, { type: 'select', index: 1 }, { type: 'removeSelected' })
    expect(kinds(s)).toEqual(['s0.5', 's0.83'])
    s = run(s, { type: 'undo' })
    expect(kinds(s)).toEqual(['s0.5', 's1.13', 's0.83'])
    expect(sel(s)).toBe(1)
    s = run(s, { type: 'redo' })
    expect(kinds(s)).toEqual(['s0.5', 's0.83'])
  })

  it('bumps the revision for every change except text-mode edits', () => {
    const s = run(fresh(), { type: 'insert', item: 'z2' })
    expect(s.rev).toBe(1)
    const t = run(s, { type: 'setSegments', segments: [newSegment('z4'), newSegment('z1')], group: 'text:1' })
    expect(t.rev).toBe(1)
    expect(kinds(t)).toEqual(['s0.98', 's0.5'])
    expect(sel(t)).toBe(0)
    // Text edits in one session are one undo step; undo bumps the revision.
    const u = run(t, { type: 'setSegments', segments: [newSegment('z6')], group: 'text:1' }, { type: 'undo' })
    expect(kinds(u)).toEqual(['s0.66'])
    expect(u.rev).toBe(2)
    expect(run(s, { type: 'select', index: 0 }).rev).toBe(1)
  })

  it('treats a commit of the same workout and selection as a no-op', () => {
    const s = run(fresh(), { type: 'insert', item: 'z2' })
    expect(run(s, { type: 'commit', workout: s.history.present.workout })).toBe(s)
  })

  it('tracks unsaved changes against the saved content, ignoring timestamps', () => {
    let s = fresh()
    expect(isDirty(s)).toBe(false)
    s = run(s, { type: 'insert', item: 'z2' })
    expect(isDirty(s)).toBe(true)
    // What saveWorkout returns: the same content plus timestamps.
    const saved: Workout = { ...s.history.present.workout, createdAt: 1, updatedAt: 2 }
    s = run(s, { type: 'saved', workout: saved })
    expect(isDirty(s)).toBe(false)
    s = run(s, { type: 'commit', workout: { ...s.history.present.workout, name: 'Renamed' }, group: 'name' })
    expect(isDirty(s)).toBe(true)
    // Undoing back to the saved content is clean again.
    expect(isDirty(run(s, { type: 'undo' }))).toBe(false)
    // A workout that was never saved anywhere is dirty from the start.
    expect(isDirty(initEditor(newWorkout('ai:x'), false))).toBe(true)
    expect(contentKey(saved)).toBe(contentKey({ ...saved, createdAt: 99 }))
  })
})
