import { describe, expect, it } from 'vitest'
import {
  compileWorkout,
  DEFAULT_TEXT_DURATION_S,
  diffTimelines,
  resolvePower,
  stepAt,
  targetAt,
  validateWorkout,
  workoutIssues,
} from './compile'
import type { Segment, Workout } from './model'

const ftp = (value: number) => ({ unit: 'ftp' as const, value })
const watts = (value: number) => ({ unit: 'watts' as const, value })

function workout(segments: Segment[], extra: Partial<Workout> = {}): Workout {
  return { id: 't', name: 'Test', tags: [], sportType: 'bike', source: 'user', segments, ...extra }
}

const sample = workout([
  { kind: 'ramp', role: 'warmup', durationS: 600, from: ftp(0.4), to: ftp(0.75), label: 'Warm-up' },
  { kind: 'steady', durationS: 300, power: ftp(0.8), cadence: { rpm: 90 } },
  {
    kind: 'intervals',
    repeat: 3,
    on: { durationS: 60, power: ftp(1.2), label: 'Hard' },
    off: { durationS: 30, power: ftp(0.5), cadence: { rpm: 85 } },
    cadence: { rpm: 100 },
    label: 'VO2',
    text: [
      { offsetS: 0, message: 'Go!' },
      { offsetS: 200, message: 'Last one', durationS: 5 },
    ],
  },
  { kind: 'freeride', durationS: 120, label: 'Free' },
  { kind: 'maxeffort', durationS: 20 },
  { kind: 'ramp', role: 'cooldown', durationS: 300, from: ftp(0.6), to: ftp(0.4) },
])

describe('compileWorkout', () => {
  const tl = compileWorkout(sample)

  it('lays steps end to end with absolute times', () => {
    expect(tl.durationS).toBe(600 + 300 + 3 * 90 + 120 + 20 + 300)
    expect(tl.steps).toHaveLength(1 + 1 + 6 + 1 + 1 + 1)
    for (const [i, s] of tl.steps.entries()) {
      expect(s.index).toBe(i)
      expect(s.endS - s.startS).toBe(s.durationS)
      if (i > 0) expect(s.startS).toBe(tl.steps[i - 1]?.endS)
    }
  })

  it('keeps ramp endpoints and roles, and shares from/to on steady steps', () => {
    const [warm, steady] = tl.steps
    expect(warm).toMatchObject({ kind: 'ramp', role: 'warmup', from: ftp(0.4), to: ftp(0.75), label: 'Warm-up', ergOff: false })
    expect(steady).toMatchObject({ kind: 'steady', from: ftp(0.8), cadence: { rpm: 90 } })
    expect(steady?.from).toBe(steady?.to)
    expect(tl.steps.at(-1)).toMatchObject({ kind: 'ramp', role: 'cooldown', from: ftp(0.6), to: ftp(0.4) })
  })

  it('expands intervals into on/off steps with rep indexes and fallbacks', () => {
    const reps = tl.steps.filter((s) => s.segmentIndex === 2)
    expect(reps.map((s) => `${s.kind}${s.repIndex}`)).toEqual(['on0', 'off0', 'on1', 'off1', 'on2', 'off2'])
    expect(reps[0]).toMatchObject({ label: 'Hard', cadence: { rpm: 100 }, from: ftp(1.2), durationS: 60 })
    expect(reps[1]).toMatchObject({ label: 'VO2', cadence: { rpm: 85 }, from: ftp(0.5), durationS: 30 })
  })

  it('marks ERG-off steps and resolves flatRoad', () => {
    const free = tl.steps.find((s) => s.kind === 'freeride')
    const max = tl.steps.find((s) => s.kind === 'maxeffort')
    expect(free).toMatchObject({ ergOff: true, from: null, to: null, flatRoad: true, label: 'Free' })
    expect(max).toMatchObject({ ergOff: true, from: null, to: null })
    expect(max && 'flatRoad' in max).toBe(false)
  })

  it('places interval text offsets across the whole expanded segment', () => {
    const start = 900
    expect(tl.texts).toEqual([
      { atS: start, message: 'Go!', durationS: DEFAULT_TEXT_DURATION_S, stepIndex: 2 },
      // 200 s into 3 × (60 + 30): rep 2's on step starts at 180 s.
      { atS: start + 200, message: 'Last one', durationS: 5, stepIndex: 6 },
    ])
    expect(tl.steps[6]).toMatchObject({ kind: 'on', repIndex: 2 })
  })

  it('omits undefined optional fields', () => {
    const s = tl.steps[1]
    expect(s && Object.keys(s).sort()).toEqual(
      ['cadence', 'durationS', 'endS', 'ergOff', 'from', 'index', 'kind', 'segmentIndex', 'startS', 'to'].sort(),
    )
  })

  it('normalizes labels and messages, and drops cues outside their segment', () => {
    const t = compileWorkout(
      workout([
        {
          kind: 'steady',
          durationS: 60,
          power: ftp(0.5),
          label: '  Easy \n spin ',
          text: [
            { offsetS: 30, message: ' second\n' },
            { offsetS: 10, message: 'first' },
            { offsetS: 60, message: 'too late' },
            { offsetS: -1, message: 'too early' },
            { offsetS: 20, message: '   ' },
          ],
        },
        { kind: 'steady', durationS: 60, power: ftp(0.5), label: '   ' },
      ]),
    )
    expect(t.steps[0]?.label).toBe('Easy spin')
    expect(t.steps[1] && 'label' in t.steps[1]).toBe(false)
    expect(t.texts.map((x) => x.message)).toEqual(['first', 'second'])
  })

  it('keeps steady ranges but strips them from ramps and degenerate ones', () => {
    const t = compileWorkout(
      workout([
        { kind: 'steady', durationS: 60, power: { unit: 'ftp', value: 0.9, low: 0.88, high: 0.92 } },
        { kind: 'steady', durationS: 60, power: { unit: 'ftp', value: 0.9, low: 0.9, high: 0.9 } },
        { kind: 'ramp', role: 'ramp', durationS: 60, from: { unit: 'ftp', value: 0.5, low: 0.4, high: 0.6 }, to: ftp(0.7) },
      ]),
    )
    expect(t.steps[0]?.from).toEqual({ unit: 'ftp', value: 0.9, low: 0.88, high: 0.92 })
    expect(t.steps[1]?.from).toEqual(ftp(0.9))
    expect(t.steps[2]?.from).toEqual(ftp(0.5))
  })

  it('skips zero-length steps but keeps segment indexes', () => {
    const t = compileWorkout(
      workout([
        { kind: 'steady', durationS: 0, power: ftp(0.5) },
        { kind: 'intervals', repeat: 2, on: { durationS: 30, power: ftp(1) }, off: { durationS: 0, power: ftp(0.5) } },
      ]),
    )
    expect(t.steps.map((s) => [s.segmentIndex, s.kind])).toEqual([
      [1, 'on'],
      [1, 'on'],
    ])
    expect(t.durationS).toBe(60)
  })

  it('compiles an empty workout to an empty timeline', () => {
    expect(compileWorkout(workout([]))).toEqual({ steps: [], durationS: 0, texts: [] })
  })
})

describe('stepAt / targetAt', () => {
  const tl = compileWorkout(sample)

  it('finds steps with start inclusive and end exclusive', () => {
    expect(stepAt(tl, 0)?.index).toBe(0)
    expect(stepAt(tl, 599.999)?.index).toBe(0)
    expect(stepAt(tl, 600)?.index).toBe(1)
    expect(stepAt(tl, tl.durationS - 0.001)?.index).toBe(tl.steps.length - 1)
    expect(stepAt(tl, tl.durationS)).toBeNull()
    expect(stepAt(tl, -1)).toBeNull()
    expect(stepAt(tl, Number.NaN)).toBeNull()
  })

  it('binary-searches long timelines', () => {
    const long = compileWorkout(
      workout([{ kind: 'intervals', repeat: 500, on: { durationS: 7, power: ftp(1) }, off: { durationS: 3, power: ftp(0.5) } }]),
    )
    for (const t of [0, 6.9, 7, 9.99, 10, 1234.5, 4999.9]) {
      const s = stepAt(long, t)
      expect(s && s.startS <= t && t < s.endS).toBe(true)
    }
  })

  it('interpolates ramps linearly and reports ERG-off steps', () => {
    const mid = targetAt(tl, 300, 250)
    expect(mid?.watts).toBeCloseTo(250 * (0.4 + (0.75 - 0.4) / 2), 9)
    expect(mid?.fraction).toBeCloseTo(0.575, 9)
    expect(mid).toMatchObject({ stepElapsedS: 300, stepRemainingS: 300, ergOff: false })
    expect(mid?.next?.index).toBe(1)
    const steady = targetAt(tl, 700, 200)
    expect(steady).toMatchObject({ watts: 160, cadence: { rpm: 90 } })
    const free = targetAt(tl, 1200, 250)
    expect(free).toMatchObject({ watts: null, fraction: null, ergOff: true })
    expect(targetAt(tl, tl.durationS - 1, 250)?.next).toBeNull()
    expect(targetAt(tl, tl.durationS, 250)).toBeNull()
  })

  it('resolves watts targets as-is and mixed-unit ramps in watts', () => {
    expect(resolvePower(ftp(0.9), 300)).toBe(270)
    expect(resolvePower(watts(215), 300)).toBe(215)
    const t = compileWorkout(workout([{ kind: 'ramp', role: 'ramp', durationS: 100, from: watts(100), to: ftp(1) }]))
    expect(targetAt(t, 50, 300)?.watts).toBe(200)
    expect(targetAt(t, 50, 300)?.fraction).toBeCloseTo(2 / 3, 12)
  })
})

describe('diffTimelines', () => {
  it('treats tiny float noise as equal and reports real differences with a path', () => {
    const a = compileWorkout(sample)
    const b = structuredClone(a)
    const first = b.steps[1]
    if (first?.from) first.from.value += 1e-9
    expect(diffTimelines(a, b)).toBeNull()
    if (first) first.label = 'changed'
    expect(diffTimelines(a, b)).toBe('timeline.steps[1].label: undefined ≠ "changed"')
  })
})

describe('validateWorkout', () => {
  it('accepts a sane workout', () => {
    expect(validateWorkout(sample)).toEqual([])
  })

  it('rejects empty workouts and missing names', () => {
    expect(validateWorkout(workout([], { name: ' ' }))).toEqual([
      'The workout needs a name.',
      'The workout is empty: add at least one step.',
    ])
  })

  it('rejects zero and negative durations, negative power and bad repeats', () => {
    const problems = validateWorkout(
      workout([
        { kind: 'steady', durationS: 0, power: ftp(0.5) },
        { kind: 'steady', durationS: 60, power: ftp(-0.1) },
        { kind: 'freeride', durationS: -5 },
        { kind: 'intervals', repeat: 2.5, on: { durationS: 30, power: ftp(1) }, off: { durationS: 0, power: ftp(0.5) } },
      ]),
    )
    expect(problems).toEqual([
      'Step 1 (steady): the duration must be more than 0 seconds.',
      'Step 2 (steady): power is negative.',
      'Step 3 (free ride): the duration must be more than 0 seconds.',
      'Step 4 (intervals): the repeat count must be a whole number of at least 1.',
      'Step 4 (intervals): the off duration must be more than 0 seconds.',
    ])
  })

  it('flags workouts over 10 hours and warns past 250 steps', () => {
    expect(validateWorkout(workout([{ kind: 'steady', durationS: 10 * 3600 + 1, power: ftp(0.5) }]))).toEqual([
      'The workout is 10:00:01 long; the limit is 10 hours.',
    ])
    const issues = workoutIssues(
      workout([{ kind: 'intervals', repeat: 126, on: { durationS: 10, power: ftp(1) }, off: { durationS: 10, power: ftp(0.5) } }]),
    )
    expect(issues).toEqual([
      { severity: 'warning', message: 'The workout has 252 steps; Zwift may not load files with more than 250.' },
    ])
  })

  it('checks cues, ranges, cadence and FTP-test labels', () => {
    const problems = validateWorkout(
      workout(
        [
          {
            kind: 'steady',
            durationS: 60,
            power: { unit: 'ftp', value: 0.9, low: 0.95, high: 0.85 },
            cadence: { low: 80 },
            text: [{ offsetS: 60, message: 'late' }],
          },
          { kind: 'ramp', role: 'cooldown', durationS: 60, from: ftp(0.4), to: ftp(0.6) },
        ],
        { ftpTest: { protocol: '20min', effortLabel: '20-min test effort', factor: 0.95 } },
      ),
    )
    expect(problems).toEqual([
      'Step 1 (steady): power range starts above where it ends.',
      'Step 1 (steady): a cadence range needs both a low and a high value.',
      'Step 1 (steady): text cue "late" at 1:00 is past the step\'s end (1:00).',
      'Step 2 (cool-down): this cool-down rises; Zwift export writes it as a plain Ramp.',
      'FTP test effort "20-min test effort" doesn\'t match any step label.',
    ])
  })

  it('tags issues with severity and segment index', () => {
    const issues = workoutIssues(workout([{ kind: 'steady', durationS: 0.5, power: ftp(5) }]))
    expect(issues).toEqual([
      { severity: 'warning', message: 'Step 1 (steady): power is 500 % of FTP; is the unit right?', segmentIndex: 0 },
      { severity: 'warning', message: 'Step 1 (steady): the duration is under 1 second; exports round it to whole seconds.', segmentIndex: 0 },
    ])
  })
})
