import { describe, expect, it } from 'vitest'
import { contentId, fnv1a32, slugify } from './ids'

describe('ids', () => {
  it('hashes with 32-bit FNV-1a', () => {
    // Reference values for FNV-1a 32.
    expect(fnv1a32('')).toBe('811c9dc5')
    expect(fnv1a32('a')).toBe('e40c292c')
    expect(fnv1a32('foobar')).toBe('bf9cf968')
    expect(contentId('zwo', 'foobar')).toBe('zwo:bf9cf968')
  })

  it('slugifies names to lowercase ASCII', () => {
    expect(slugify('Sweet Spot 3×15')).toBe('sweet-spot-3x15')
    expect(slugify('Rønnestad-Style 30/15s')).toBe('ronnestad-style-30-15s')
    expect(slugify('Æble Straße')).toBe('aeble-strasse')
    expect(slugify('Café  Crème!')).toBe('cafe-creme')
    expect(slugify('  --  ')).toBe('')
  })
})
