import { describe, expect, it } from 'vitest'
import { builderCommand, isTextEntry, type KeyLike } from './keys'

const key = (k: string, mods: Partial<Omit<KeyLike, 'key'>> = {}): KeyLike => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods })

describe('builder shortcuts', () => {
  it('maps arrows to select and Alt+arrows to move', () => {
    expect(builderCommand(key('ArrowLeft'))).toBe('prev')
    expect(builderCommand(key('ArrowRight'))).toBe('next')
    expect(builderCommand(key('ArrowLeft', { altKey: true }))).toBe('moveLeft')
    expect(builderCommand(key('ArrowRight', { altKey: true }))).toBe('moveRight')
    // ⌘← / ⇧← belong to the system (line start, selection).
    expect(builderCommand(key('ArrowLeft', { metaKey: true }))).toBeNull()
    expect(builderCommand(key('ArrowRight', { shiftKey: true }))).toBeNull()
  })

  it('maps ⌘D, Delete/⌫, ⌘Z and ⇧⌘Z (Ctrl works like ⌘)', () => {
    expect(builderCommand(key('d', { metaKey: true }))).toBe('duplicate')
    expect(builderCommand(key('D', { ctrlKey: true }))).toBe('duplicate')
    expect(builderCommand(key('Delete'))).toBe('delete')
    expect(builderCommand(key('Backspace'))).toBe('delete')
    expect(builderCommand(key('z', { metaKey: true }))).toBe('undo')
    expect(builderCommand(key('z', { metaKey: true, shiftKey: true }))).toBe('redo')
    expect(builderCommand(key('Z', { metaKey: true, shiftKey: true }))).toBe('redo')
    expect(builderCommand(key('y', { ctrlKey: true }))).toBe('redo')
  })

  it('leaves other keys alone', () => {
    expect(builderCommand(key('d'))).toBeNull()
    expect(builderCommand(key('z'))).toBeNull()
    expect(builderCommand(key('Backspace', { metaKey: true }))).toBeNull()
    expect(builderCommand(key('d', { metaKey: true, altKey: true }))).toBeNull()
    expect(builderCommand(key(' '))).toBeNull()
  })

  it('knows which elements take typing', () => {
    const el = (html: string) => {
      const d = document.createElement('div')
      d.innerHTML = html
      return d.firstElementChild
    }
    expect(isTextEntry(el('<input type="text">'))).toBe(true)
    expect(isTextEntry(el('<input>'))).toBe(true)
    expect(isTextEntry(el('<textarea></textarea>'))).toBe(true)
    expect(isTextEntry(el('<select></select>'))).toBe(true)
    expect(isTextEntry(el('<input type="checkbox">'))).toBe(false)
    expect(isTextEntry(el('<button>x</button>'))).toBe(false)
    expect(isTextEntry(null)).toBe(false)
  })
})
