// Builder keyboard shortcuts. Every one is mirrored by a toolbar button whose
// title shows the key, so the mapping lives here once for both.

export type BuilderCommand = 'prev' | 'next' | 'moveLeft' | 'moveRight' | 'duplicate' | 'delete' | 'undo' | 'redo'

export interface KeyLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** ← → select, ⌥← ⌥→ move, ⌘D duplicate, Delete/⌫ remove, ⌘Z undo, ⇧⌘Z (or Ctrl+Y) redo. Ctrl counts as ⌘. */
export function builderCommand(e: KeyLike): BuilderCommand | null {
  const mod = e.metaKey || e.ctrlKey
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    if (mod || e.shiftKey) return null
    const left = key === 'ArrowLeft'
    if (e.altKey) return left ? 'moveLeft' : 'moveRight'
    return left ? 'prev' : 'next'
  }
  if ((key === 'Delete' || key === 'Backspace') && !mod && !e.altKey && !e.shiftKey) return 'delete'
  if (!mod || e.altKey) return null
  if (key === 'd' && !e.shiftKey) return 'duplicate'
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && e.ctrlKey && !e.shiftKey) return 'redo'
  return null
}

/** Shortcut hints for button titles (macOS glyphs). */
export const SHORTCUTS: Record<BuilderCommand, string> = {
  prev: '←',
  next: '→',
  moveLeft: '⌥←',
  moveRight: '⌥→',
  duplicate: '⌘D',
  delete: '⌫',
  undo: '⌘Z',
  redo: '⇧⌘Z',
}

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'])

/** Whether keys typed at `t` belong to a text field (so the builder must leave them alone). */
export function isTextEntry(t: EventTarget | null): boolean {
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true
  if (t instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(t.type)
  return t instanceof HTMLElement && t.isContentEditable
}
