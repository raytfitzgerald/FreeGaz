import { describe, expect, it } from 'vitest'
import { riderInitials } from './rider'

describe('riderInitials', () => {
  it('uses up to two initials, or You', () => {
    expect(riderInitials('Ray Fitzgerald')).toBe('RF')
    expect(riderInitials('ray')).toBe('R')
    expect(riderInitials('  ')).toBe('You')
    expect(riderInitials(null)).toBe('You')
    expect(riderInitials('Émile Zola Jr')).toBe('ÉZ')
  })
})
