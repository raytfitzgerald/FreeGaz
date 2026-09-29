import { describe, expect, it } from 'vitest'
import { amend, canRedo, canUndo, commit, createHistory, HISTORY_LIMIT, redo, undo } from './history'

describe('builder history', () => {
  it('undoes and redoes commits in order', () => {
    let h = createHistory(0)
    h = commit(h, 1)
    h = commit(h, 2)
    expect(canUndo(h)).toBe(true)
    expect(canRedo(h)).toBe(false)
    h = undo(h)
    expect(h.present).toBe(1)
    h = undo(h)
    expect(h.present).toBe(0)
    expect(undo(h)).toBe(h)
    h = redo(redo(h))
    expect(h.present).toBe(2)
    expect(redo(h)).toBe(h)
  })

  it('a new commit clears redo', () => {
    const h = commit(undo(commit(createHistory('a'), 'b')), 'c')
    expect(h.present).toBe('c')
    expect(canRedo(h)).toBe(false)
    expect(undo(h).present).toBe('a')
  })

  it('coalesces a run of commits in the same group into one step', () => {
    let h = createHistory('')
    for (const s of ['S', 'Sw', 'Swe', 'Swee', 'Sweet']) h = commit(h, s, 'name')
    expect(h.present).toBe('Sweet')
    expect(h.past).toEqual([''])
    // Another group, or no group, starts a new step.
    h = commit(h, 'Sweet!', 'label')
    h = commit(h, 'Sweet!!')
    h = commit(h, 'Sweet!!!')
    expect(h.past).toEqual(['', 'Sweet', 'Sweet!', 'Sweet!!'])
    // Undo breaks the group, so typing again after an undo is a new step.
    h = commit(undo(commit(h, 'x', 'name')), 'y', 'name')
    expect(undo(h).present).toBe('Sweet!!!')
  })

  it(`keeps at most ${HISTORY_LIMIT} undo steps`, () => {
    let h = createHistory(0)
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = commit(h, i)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    for (let i = 0; i < HISTORY_LIMIT; i++) h = undo(h)
    expect(h.present).toBe(20)
    expect(canUndo(h)).toBe(false)
  })

  it('amends the present without adding a step or dropping redo', () => {
    const h = undo(commit(createHistory({ v: 1, sel: 0 }), { v: 2, sel: 0 }))
    const a = amend(h, { ...h.present, sel: 3 })
    expect(a.present).toEqual({ v: 1, sel: 3 })
    expect(a.past).toHaveLength(0)
    expect(canRedo(a)).toBe(true)
    expect(a.group).toBeNull()
  })
})
