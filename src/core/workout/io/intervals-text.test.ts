import { describe, expect, it } from 'vitest'
import { compileWorkout, diffTimelines } from '../compile'
import type { Segment, Workout } from '../model'
import { formatDuration, parseDuration, parseIntervalsText, toIntervalsText, ZONE_MIDPOINTS } from './intervals-text'

const ftp = (value: number) => ({ unit: 'ftp' as const, value })
const watts = (value: number) => ({ unit: 'watts' as const, value })

function workout(segments: Segment[]): Workout {
  return { id: 't', name: 'Test', tags: [], sportType: 'bike', source: 'user', segments }
}

function parse(text: string): Segment[] {
  const { workout: w, errors } = parseIntervalsText(text)
  expect(errors).toEqual([])
  return w.segments
}

/** Text round trip: no parse errors and an identical compiled timeline. */
function roundTrip(w: Workout): string {
  const text = toIntervalsText(w)
  const back = parseIntervalsText(text)
  expect(back.errors, text).toEqual([])
  expect(diffTimelines(compileWorkout(w), compileWorkout(back.workout)), text).toBeNull()
  return text
}

const EVERYTHING = `Warm-up
- 10m warmup 40-75% 90rpm
- 3m 55%

Main set 4x
- Hard 2m 105% 95rpm
- Easy 1m 50%

- Blowout 5m max
- 1h2m30s Z2
- 90s 220w
- 5'30" 200-250w 85-95rpm
- 30s 120% avg
- 20m freeride
  > 0s Settle in
  > 19m30s [15s] Empty it!
- 5m freeride terrain
- 10m ramp 60-40%
- 20s max
`

describe('parseIntervalsText', () => {
  it('reads every syntax feature', () => {
    expect(parse(EVERYTHING)).toEqual([
      { kind: 'ramp', role: 'warmup', durationS: 600, from: ftp(0.4), to: ftp(0.75), cadence: { rpm: 90 }, label: 'Warm-up' },
      { kind: 'steady', durationS: 180, power: ftp(0.55), label: 'Warm-up' },
      {
        kind: 'intervals',
        repeat: 4,
        on: { durationS: 120, power: ftp(1.05), cadence: { rpm: 95 }, label: 'Hard' },
        off: { durationS: 60, power: ftp(0.5), label: 'Easy' },
        label: 'Main set',
      },
      { kind: 'maxeffort', durationS: 300, label: 'Blowout' },
      { kind: 'steady', durationS: 3750, power: ftp(0.66) },
      { kind: 'steady', durationS: 90, power: watts(220) },
      { kind: 'steady', durationS: 330, power: { unit: 'watts', value: 225, low: 200, high: 250 }, cadence: { low: 85, high: 95 } },
      { kind: 'steady', durationS: 30, power: ftp(1.2), showAverage: true },
      {
        kind: 'freeride',
        durationS: 1200,
        text: [
          { offsetS: 0, message: 'Settle in' },
          { offsetS: 1170, message: 'Empty it!', durationS: 15 },
        ],
      },
      { kind: 'freeride', durationS: 300, flatRoad: false },
      { kind: 'ramp', role: 'ramp', durationS: 600, from: ftp(0.6), to: ftp(0.4) },
      { kind: 'maxeffort', durationS: 20 },
    ])
  })

  it('uses Coggan zone midpoints for Z1..Z7', () => {
    const segs = parse([1, 2, 3, 4, 5, 6, 7].map((z) => `- 1m z${z}`).join('\n'))
    expect(segs.map((s) => (s.kind === 'steady' ? s.power.value : null))).toEqual([0.5, 0.66, 0.83, 0.98, 1.13, 1.35, 1.6])
    expect(ZONE_MIDPOINTS).toEqual([0.5, 0.66, 0.83, 0.98, 1.13, 1.35, 1.6])
  })

  it('accepts ramp keywords and units in any order, and "% FTP"', () => {
    expect(parse('- 5m 50-75% ramp\n- 5m cooldown 75%-50%\n- 5m ramp 100w-80%\n- 5m 75% FTP')).toEqual([
      { kind: 'ramp', role: 'ramp', durationS: 300, from: ftp(0.5), to: ftp(0.75) },
      { kind: 'ramp', role: 'cooldown', durationS: 300, from: ftp(0.75), to: ftp(0.5) },
      { kind: 'ramp', role: 'ramp', durationS: 300, from: watts(100), to: ftp(0.8) },
      { kind: 'steady', durationS: 300, power: ftp(0.75) },
    ])
  })

  it('turns two-step steady repeats into intervals and expands the rest', () => {
    const segs = parse(`3x
- 1m 90%
- 1m 100%
- 1m 110%

Sprints 2x
- Go 10s max
- 50s 50%

Mixed 2x
- 1m 100% avg
- 1m 50%
`)
    expect(segs.map((s) => [s.kind, s.label])).toEqual([
      ['steady', undefined],
      ['steady', undefined],
      ['steady', undefined],
      ['steady', undefined],
      ['steady', undefined],
      ['steady', undefined],
      ['steady', undefined],
      ['steady', undefined],
      ['steady', undefined],
      ['maxeffort', 'Go'],
      ['steady', 'Sprints'],
      ['maxeffort', 'Go'],
      ['steady', 'Sprints'],
      ['steady', 'Mixed'],
      ['steady', 'Mixed'],
      ['steady', 'Mixed'],
      ['steady', 'Mixed'],
    ])
  })

  it('merges consecutive header lines and repeats cues per rep', () => {
    const [seg] = parse(`Main set
3x
> 0s Here we go
- 30s 120%
  > 10s Push
- 30s 50%
  > 20s Get ready
`)
    expect(seg).toMatchObject({ kind: 'intervals', repeat: 3, label: 'Main set' })
    expect(seg?.text?.map((t) => [t.offsetS, t.message])).toEqual([
      [0, 'Here we go'],
      [10, 'Push'],
      [50, 'Get ready'],
      [70, 'Push'],
      [110, 'Get ready'],
      [130, 'Push'],
      [170, 'Get ready'],
    ])
  })

  it('places section cues of expanded repeats in the right copy', () => {
    const segs = parse(`Ladder 2x
> 2m30s Halfway there
- 1m 90%
- 1m 100%
- 1m 110%
`)
    expect(segs).toHaveLength(6)
    expect(segs.map((s) => s.text?.map((t) => [t.offsetS, t.message]))).toEqual([
      undefined,
      undefined,
      [[30, 'Halfway there']],
      undefined,
      undefined,
      undefined,
    ])
  })

  it('reads quoted labels that contain times, and every duration form', () => {
    expect(parse('- "5m easy" 5m 50%')).toEqual([{ kind: 'steady', durationS: 300, power: ftp(0.5), label: '5m easy' }])
    const cases: [string, number][] = [
      ['1h2m30s', 3750],
      ['1h', 3600],
      ['5m', 300],
      ['30s', 30],
      ['90s', 90],
      ['1.5m', 90],
      ['10min', 600],
      ['2mins', 120],
      ['1m30', 90],
      ['1h30', 5400],
      [`5'30"`, 330],
      [`5'`, 300],
      [`45"`, 45],
      ['5′30″', 330],
      ['5:30', 330],
      ['1:02:30', 3750],
      ['2H', 7200],
    ]
    for (const [tok, s] of cases) expect(parseDuration(tok), tok).toBe(s)
    for (const tok of ['', '5', 'm', '5x', '1m75', '2km', 'Z2', '5m5h']) expect(parseDuration(tok), tok).toBeNull()
  })

  it('reports typos with line numbers and parses everything else', () => {
    const { workout: w, errors } = parseIntervalsText(`Warm-up
- 10m warmup 45-70%
- 5x 75%
- 5m Z9
- 5m 80% sparkles
- 2km 80%
- 5m 70% hr
- 5m ramp 80%
- 5m 50%-250w
- 5m 80% 90% freeride
- 5m 80% 90rpm 100rpm

Empty 3x

> 10s orphan

- 1m 50%
  > 2m too late
  > soon hello
0x
- 1m 50%
`)
    expect(errors).toEqual([
      { line: 3, message: 'Missing duration: start the step with a time such as 5m, 30s or 1h2m.' },
      { line: 4, message: 'Unknown zone "Z9": use Z1 to Z7.' },
      { line: 4, message: 'Missing target: add a power (75%, 220w, Z2), a ramp (ramp 50-75%), freeride or max.' },
      { line: 5, message: 'Unknown "sparkles".' },
      { line: 6, message: 'Distance steps like "2km" aren\'t supported; use a time such as 5m.' },
      { line: 7, message: 'Heart-rate and pace targets aren\'t supported; use power such as 75%, 220w or Z2.' },
      { line: 8, message: '"ramp" needs a start and end power, like ramp 50-75%.' },
      { line: 9, message: 'A power range needs one unit, like 90-95% or 200-250w.' },
      { line: 10, message: 'A step takes one target; using the first.' },
      { line: 11, message: 'Only one cadence per step ("100rpm").' },
      { line: 13, message: '"3x" repeats nothing: put its steps right below it, with no blank line.' },
      { line: 15, message: 'This cue has no step to attach to.' },
      { line: 18, message: 'This cue at 2m is past the end of its 1m step.' },
      { line: 19, message: 'A cue starts with its time, like "> 2m Stay smooth" (got "soon").' },
      { line: 20, message: 'Repeat counts go from 1x to 500x.' },
    ])
    expect(w.segments).toEqual([
      { kind: 'ramp', role: 'warmup', durationS: 600, from: ftp(0.45), to: ftp(0.7), label: 'Warm-up' },
      { kind: 'steady', durationS: 300, power: ftp(0.8), label: 'Warm-up' },
      { kind: 'steady', durationS: 300, power: ftp(0.7), label: 'Warm-up' },
      { kind: 'steady', durationS: 300, power: ftp(0.8), label: 'Warm-up' },
      { kind: 'steady', durationS: 300, power: ftp(0.8), cadence: { rpm: 90 }, label: 'Warm-up' },
      { kind: 'steady', durationS: 60, power: ftp(0.5) },
      { kind: 'steady', durationS: 60, power: ftp(0.5) },
    ])
  })

  it('drops cues under a step that failed to parse', () => {
    const { workout: w, errors } = parseIntervalsText('- 5m 50%\n- oops\n  > 10s Go')
    expect(errors.map((e) => e.line)).toEqual([2])
    expect(w.segments).toEqual([{ kind: 'steady', durationS: 300, power: ftp(0.5) }])
  })

  it('fills workout fields from options, with a content-hash id by default', () => {
    const text = '- 5m 50%'
    expect(parseIntervalsText(text).workout).toMatchObject({ id: expect.stringMatching(/^text:[0-9a-f]{8}$/), name: 'Untitled workout', source: 'user' })
    const { workout: w } = parseIntervalsText(text, {
      newId: () => 'w1',
      name: ' Easy ',
      author: 'Me',
      description: 'Spin',
      tags: ['recovery'],
      source: 'ai',
      ftpTest: { protocol: '8min', effortLabel: 'Go', factor: 0.9 },
    })
    expect(w).toMatchObject({ id: 'w1', name: 'Easy', author: 'Me', description: 'Spin', tags: ['recovery'], source: 'ai' })
    expect(w.ftpTest).toEqual({ protocol: '8min', effortLabel: 'Go', factor: 0.9 })
  })
})

describe('toIntervalsText', () => {
  it('writes idiomatic text that parses back identically', () => {
    const w = parseIntervalsText(EVERYTHING).workout
    expect(roundTrip(w)).toBe(`Warm-up
- 10m warmup 40-75% 90rpm
- 3m 55%

Main set 4x
- Hard 2m 105% 95rpm
- Easy 1m 50%

Blowout
- 5m max

- 1h2m30s 66%
- 1m30s 220w
- 5m30s 200-250w 85-95rpm
- 30s 120% avg
- 20m freeride
  > 0s Settle in
  > 19m30s [15s] Empty it!
- 5m freeride terrain
- 10m ramp 60-40%
- 20s max
`)
  })

  it('folds repeated step patterns back into Nx blocks', () => {
    const ladder = 'Ladder 3x\n- 1m 90%\n- 1m 100%\n- 1m 110%\n'
    expect(roundTrip(parseIntervalsText(ladder).workout)).toBe(ladder)
    const sprints = parseIntervalsText('Sprints 6x\n- Sprint 15s max\n- Easy 4m45s 45%\n').workout
    expect(roundTrip(sprints)).toBe('6x\n- Sprint 15s max\n- Easy 4m45s 45%\n')
  })

  it('writes interval cues as section cues', () => {
    const w = parseIntervalsText('Main 3x\n- 30s 120%\n  > 10s Push\n- 30s 50%\n').workout
    expect(roundTrip(w)).toBe('Main 3x\n> 10s Push\n> 1m10s Push\n> 2m10s Push\n- 30s 120%\n- 30s 50%\n')
  })

  it('keeps awkward labels and messages intact', () => {
    const w = workout([
      { kind: 'steady', durationS: 60, power: ftp(0.5), label: 'Sweet spot 3x' },
      { kind: 'steady', durationS: 60, power: ftp(0.5), label: '- dash first' },
      { kind: 'steady', durationS: 60, power: ftp(0.5), label: '5m easy' },
      { kind: 'steady', durationS: 60, power: ftp(0.5), label: '5m "easy" 3x' },
      { kind: 'steady', durationS: 60, power: ftp(0.5), label: 'Ramp step 3', text: [{ offsetS: 5, message: '[10s] left' }, { offsetS: 6, message: '[Tip] relax', durationS: 3 }] },
      { kind: 'intervals', repeat: 2, label: '> odd', on: { durationS: 30, power: ftp(1.2) }, off: { durationS: 30, power: ftp(0.5), label: 'Rest' } },
    ])
    const text = roundTrip(w)
    expect(text).toContain('- Sweet spot 3x 1m 50%')
    expect(text).toContain('- "5m easy" 1m 50%')
    expect(text).toContain('- "5m \\"easy\\" 3x" 1m 50%')
    expect(text).toContain('  > 5s [10s] [10s] left')
    expect(text).toContain('  > 6s [3s] [Tip] relax')
  })

  it('round-trips watts, mixed-unit ramps, ranges and cadence ranges', () => {
    roundTrip(
      workout([
        { kind: 'ramp', role: 'warmup', durationS: 300, from: watts(100), to: ftp(0.75), cadence: { low: 85, high: 95 } },
        { kind: 'steady', durationS: 61, power: { unit: 'ftp', value: 0.875, low: 0.85, high: 0.9 } },
        { kind: 'steady', durationS: 59.5, power: watts(212.5) },
        { kind: 'steady', durationS: 60, power: ftp(0.8833333) },
        { kind: 'freeride', durationS: 60, flatRoad: true, showAverage: true },
      ]),
    )
  })

  it('writes nothing for an empty workout', () => {
    expect(toIntervalsText(workout([]))).toBe('')
  })
})

describe('formatDuration', () => {
  it('writes compact h/m/s', () => {
    const cases: [number, string][] = [
      [0, '0s'],
      [30, '30s'],
      [90, '1m30s'],
      [300, '5m'],
      [3600, '1h'],
      [3750, '1h2m30s'],
      [3605, '1h5s'],
      [19.8, '19.8s'],
      [59.9999, '1m'],
      [-5, '0s'],
    ]
    for (const [s, text] of cases) expect(formatDuration(s), String(s)).toBe(text)
  })
})
