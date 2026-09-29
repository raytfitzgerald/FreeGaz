import { describe, expect, it } from 'vitest'
import {
  addTags,
  formatCadenceInput,
  formatDurationInput,
  formatPercentInput,
  formatWattsInput,
  parseCadenceInput,
  parseDurationInput,
  parsePercentInput,
  parseRepeatInput,
  parseWattsInput,
  withOptional,
} from './fields'

describe('builder fields', () => {
  it('reads durations in the text-mode syntax or as bare seconds', () => {
    expect(['5:30', '5m30s', '5m 30s', '330s', '330', ' 5:30 '].map((t) => parseDurationInput(t))).toEqual([330, 330, 330, 330, 330, 330])
    expect(parseDurationInput('1:02:30')).toBe(3750)
    expect(parseDurationInput('1h')).toBe(3600)
    expect(parseDurationInput('90.4')).toBe(90)
    expect(['', 'abc', '5:3', '0', '0:00'].map((t) => parseDurationInput(t))).toEqual([null, null, null, null, null])
    // Cue offsets may be zero.
    expect(parseDurationInput('0:00', 0)).toBe(0)
    expect(formatDurationInput(330)).toBe('5:30')
    expect(formatDurationInput(3750)).toBe('1:02:30')
  })

  it('reads power as percent of FTP or watts', () => {
    expect(parsePercentInput('88')).toBe(0.88)
    expect(parsePercentInput('88.5 %')).toBe(0.885)
    expect(parsePercentInput('105%')).toBe(1.05)
    expect(['', '-5', 'abc', '1200'].map(parsePercentInput)).toEqual([null, null, null, null])
    expect(formatPercentInput(0.885)).toBe('88.5')
    expect(formatPercentInput(1.1)).toBe('110')
    expect(parseWattsInput('220')).toBe(220)
    expect(parseWattsInput('220.6 W')).toBe(221)
    expect(parseWattsInput('9000')).toBeNull()
    expect(formatWattsInput(220)).toBe('220')
  })

  it('reads repeat counts', () => {
    expect(parseRepeatInput('4')).toBe(4)
    expect(parseRepeatInput('4x')).toBe(4)
    expect(['0', '2.5', '', '501', 'four'].map(parseRepeatInput)).toEqual([null, null, null, null, null])
  })

  it('reads a single cadence, a range, or nothing', () => {
    expect(parseCadenceInput('90')).toEqual({ rpm: 90 })
    expect(parseCadenceInput('90 rpm')).toEqual({ rpm: 90 })
    expect(parseCadenceInput('95-85')).toEqual({ low: 85, high: 95 })
    expect(parseCadenceInput('85 – 95')).toEqual({ low: 85, high: 95 })
    expect(parseCadenceInput('90-90')).toEqual({ rpm: 90 })
    expect(parseCadenceInput('  ')).toBeUndefined()
    expect(['fast', '10', '300', '80-300'].map(parseCadenceInput)).toEqual([null, null, null, null])
    expect(formatCadenceInput({ rpm: 90 })).toBe('90')
    expect(formatCadenceInput({ low: 85, high: 95 })).toBe('85-95')
    expect(formatCadenceInput({ rpm: 90, low: 85, high: 95 })).toBe('90')
    expect(formatCadenceInput(undefined)).toBe('')
  })

  it('adds tags as slugs without duplicates', () => {
    expect(addTags(['threshold'], 'Sweet spot, threshold,, VO2max ')).toEqual(['threshold', 'sweet-spot', 'vo2max'])
    expect(addTags([], '  ,  ')).toEqual([])
  })

  it('sets or removes optional fields', () => {
    const seg = { kind: 'steady' as const, durationS: 60, label: 'Old' as string | undefined }
    expect(withOptional(seg, 'label', 'New')).toEqual({ kind: 'steady', durationS: 60, label: 'New' })
    const cleared = withOptional(seg, 'label', undefined)
    expect(cleared).toEqual({ kind: 'steady', durationS: 60 })
    expect('label' in cleared).toBe(false)
    expect(seg.label).toBe('Old')
  })
})
