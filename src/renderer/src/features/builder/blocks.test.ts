import { describe, expect, it } from 'vitest'
import { newSegment, type PaletteItem } from '@core/workout/edit'
import { kindLabel, PALETTE, powerText, segmentSummary } from './blocks'

describe('builder block text', () => {
  it('names every kind', () => {
    const items: PaletteItem[] = ['z3', 'warmup', 'cooldown', 'ramp', 'intervals', 'freeride', 'maxeffort']
    expect(items.map((i) => kindLabel(newSegment(i)))).toEqual(['Steady', 'Warm-up', 'Cool-down', 'Ramp', 'Intervals', 'Free ride', 'Max effort'])
  })

  it('shows targets in their own unit first, with the other alongside', () => {
    expect(powerText({ unit: 'ftp', value: 0.88 }, 200)).toBe('88% · 176 W')
    expect(powerText({ unit: 'watts', value: 220 }, 200)).toBe('220 W · 110%')
    expect(powerText({ unit: 'ftp', value: 0.88 }, null)).toBe('88% FTP')
    expect(segmentSummary(newSegment('intervals'), 250)).toBe('4 × 3:00 at 110% · 275 W / 3:00 at 50% · 125 W')
    expect(segmentSummary(newSegment('warmup'), 200)).toBe('10:00, 45% · 90 W → 75% · 150 W')
  })

  it('offers the twelve palette blocks with their defaults', () => {
    expect(PALETTE.map((p) => p.label)).toEqual(['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Warm-up', 'Cool-down', 'Ramp', 'Intervals', 'Free ride', 'Max effort'])
    expect(PALETTE[1]?.hint).toBe('Add Z2 Endurance: 10:00 at 66% FTP')
    expect(PALETTE[11]?.hint).toBe('Add Max effort: 0:30 all-out, ERG off')
  })
})
