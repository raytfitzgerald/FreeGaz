import { describe, expect, it } from 'vitest'
import { GeneratedWorkoutSchema, type GeneratedWorkout } from '../ai/schemas'
import { compileWorkout } from './compile'
import { workoutFromGenerated, GENERATED_FALLBACK_NAME } from './from-generated'
import { toZwo, parseZwo } from './io/zwo'
import { diffTimelines } from './compile'
import { workoutIssues } from './validate'

/** A typical model answer to "45 min over-unders, finish with sprints", checked against the real schema. */
const OVER_UNDERS: GeneratedWorkout = GeneratedWorkoutSchema.parse({
  name: '  Over-Unders   and Sprints ',
  description: 'Alternate just over and just under threshold, then empty the tank.\n',
  tags: ['Threshold', 'over-unders', 'Sprints', 'threshold', '  '],
  segments: [
    { kind: 'ramp', role: 'warmup', durationS: 600, from: 0.45, to: 0.75, label: 'Warm-up' },
    { kind: 'intervals', repeat: 5, onS: 120, onPower: 1.05, offS: 120, offPower: 0.9, onCadence: 95, label: 'Over-unders' },
    { kind: 'steady', durationS: 300, power: 0.55, cadence: 90, label: '   ' },
    { kind: 'maxeffort', durationS: 15, label: 'Sprint' },
    { kind: 'freeride', durationS: 285 },
    { kind: 'ramp', role: 'cooldown', durationS: 300, from: 0.6, to: 0.4 },
  ],
  cues: [
    { atS: 610, message: 'First over: settle in' },
    { atS: 0, message: 'Easy start' },
    { atS: 610 + 240 * 2, message: 'Third rep, stay smooth' },
    { atS: 600 + 1200 + 300, message: 'Go!' },
    { atS: 2700, message: 'Past the end' },
    { atS: 30, message: '   ' },
  ],
})

describe('workoutFromGenerated', () => {
  const w = workoutFromGenerated(OVER_UNDERS, { id: 'ai:test' })

  it('keeps the metadata, normalized, as an unsaved AI workout', () => {
    expect(w).toMatchObject({ id: 'ai:test', name: 'Over-Unders and Sprints', sportType: 'bike', source: 'ai' })
    expect(w.description).toBe('Alternate just over and just under threshold, then empty the tank.')
    expect(w.tags).toEqual(['threshold', 'over-unders', 'sprints'])
    expect(w.createdAt).toBeUndefined()
    expect(w.ftpTest).toBeUndefined()
  })

  it('maps every segment kind with FTP-fraction targets', () => {
    expect(w.segments.map((s) => s.kind)).toEqual(['ramp', 'intervals', 'steady', 'maxeffort', 'freeride', 'ramp'])
    expect(w.segments[0]).toMatchObject({ role: 'warmup', durationS: 600, from: { unit: 'ftp', value: 0.45 }, to: { unit: 'ftp', value: 0.75 }, label: 'Warm-up' })
    expect(w.segments[1]).toMatchObject({
      repeat: 5,
      on: { durationS: 120, power: { unit: 'ftp', value: 1.05 }, cadence: { rpm: 95 } },
      off: { durationS: 120, power: { unit: 'ftp', value: 0.9 } },
      label: 'Over-unders',
    })
    expect(w.segments[1]).not.toHaveProperty('off.cadence')
    expect(w.segments[2]).toEqual({ kind: 'steady', durationS: 300, power: { unit: 'ftp', value: 0.55 }, cadence: { rpm: 90 } })
    expect(w.segments[3]).toMatchObject({ kind: 'maxeffort', durationS: 15, label: 'Sprint' })
    expect(w.segments[4]).toEqual({ kind: 'freeride', durationS: 285 })
    expect(w.segments[5]).toMatchObject({ role: 'cooldown', from: { value: 0.6 }, to: { value: 0.4 } })
  })

  it('re-homes absolute cues onto their segments and drops unplaceable ones', () => {
    expect(w.segments[0]?.text).toEqual([{ offsetS: 0, message: 'Easy start' }])
    // Interval cue offsets are relative to the whole block, so a later rep keeps its place.
    expect(w.segments[1]?.text).toEqual([
      { offsetS: 10, message: 'First over: settle in' },
      { offsetS: 490, message: 'Third rep, stay smooth' },
    ])
    expect(w.segments[3]?.text).toEqual([{ offsetS: 0, message: 'Go!' }])
    const cues = compileWorkout(w).texts
    expect(cues.map((c) => [c.atS, c.message])).toEqual([
      [0, 'Easy start'],
      [610, 'First over: settle in'],
      [1090, 'Third rep, stay smooth'],
      [2100, 'Go!'],
    ])
  })

  it('produces a valid, rideable workout that survives a ZWO round trip', () => {
    expect(workoutIssues(w).filter((i) => i.severity === 'error')).toEqual([])
    const tl = compileWorkout(w)
    expect(tl.durationS).toBe(45 * 60)
    expect(diffTimelines(compileWorkout(parseZwo(toZwo(w))), tl)).toBeNull()
  })

  it('falls back to a name and omits a blank description', () => {
    const bare = workoutFromGenerated(
      { name: '     ', description: '  ', tags: [], segments: [{ kind: 'steady', durationS: 60, power: 0.6 }], cues: [] },
      { id: 'ai:bare' },
    )
    expect(bare.name).toBe(GENERATED_FALLBACK_NAME)
    expect(bare).not.toHaveProperty('description')
    expect(bare.segments[0]).not.toHaveProperty('text')
  })
})
