// Property tests: random valid workouts survive ZWO and text export, and the
// parsers never fail on garbage with anything but a format error.

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { compileWorkout, diffTimelines, targetAt, workoutIssues } from '../compile'
import type { CadenceTarget, IntervalPart, PowerTarget, Segment, TextEvent, Workout } from '../model'
import { parseErgMrc } from './ergmrc'
import { WorkoutFormatError } from './errors'
import { parseIntervalsText, toIntervalsText } from './intervals-text'
import { parseZwo, toZwo } from './zwo'

const RUNS = { numRuns: 300 }

const nil = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: undefined })

// Labels and messages deliberately include characters that are special in
// XML or in the text syntax: - > " \ [ ] digits and "x".
const CHARS = 'abcdefghijklmnopqrstuvwxyz ABCXYZ0123456789->"\\[]&<\':xms%'.split('')
const text = (maxLength: number) => fc.string({ unit: fc.constantFrom(...CHARS), minLength: 1, maxLength })

const ftpValue = fc.integer({ min: 0, max: 200 }).map((n) => n / 100)
const ftpTarget: fc.Arbitrary<PowerTarget> = ftpValue.map((value) => ({ unit: 'ftp', value }))
const wattTarget: fc.Arbitrary<PowerTarget> = fc.integer({ min: 40, max: 900 }).map((value) => ({ unit: 'watts', value }))
const ftpRange: fc.Arbitrary<PowerTarget> = fc
  .tuple(fc.integer({ min: 30, max: 150 }), fc.integer({ min: 1, max: 25 }))
  .map(([lo, width]) => {
    const low = lo / 100
    const high = (lo + width) / 100
    return { unit: 'ftp', value: (low + high) / 2, low, high }
  })
const wattRange: fc.Arbitrary<PowerTarget> = fc
  .tuple(fc.integer({ min: 40, max: 700 }), fc.integer({ min: 1, max: 100 }))
  .map(([low, width]) => ({ unit: 'watts', value: (2 * low + width) / 2, low, high: low + width }))

const cadence: fc.Arbitrary<CadenceTarget | undefined> = nil(
  fc.oneof(
    fc.integer({ min: 40, max: 130 }).map((rpm) => ({ rpm })),
    fc.tuple(fc.integer({ min: 40, max: 120 }), fc.integer({ min: 1, max: 20 })).map(([low, w]) => ({ low, high: low + w })),
  ),
)
const duration = fc.integer({ min: 1, max: 1200 })
const texts = (totalS: number): fc.Arbitrary<TextEvent[] | undefined> =>
  nil(
    fc.array(
      fc.record({
        offsetS: fc.integer({ min: 0, max: totalS - 1 }),
        message: text(24).filter((m) => m.trim() !== ''),
        durationS: nil(fc.integer({ min: 1, max: 30 })),
      }),
      { minLength: 1, maxLength: 3 },
    ),
  )

interface Units {
  target: fc.Arbitrary<PowerTarget>
  range: fc.Arbitrary<PowerTarget>
  /** ZWO reads Cooldown as descending, so its generator keeps cool-downs falling. */
  fallingCooldowns: boolean
}

function segmentArb(u: Units): fc.Arbitrary<Segment> {
  const common = { label: nil(text(16)), cadence }
  const steady = fc.record({
    kind: fc.constant('steady' as const),
    durationS: duration,
    power: fc.oneof(u.target, u.range),
    showAverage: nil(fc.constant(true)),
    ...common,
  })
  const ramp = fc
    .record({
      kind: fc.constant('ramp' as const),
      role: fc.constantFrom('warmup' as const, 'cooldown' as const, 'ramp' as const),
      durationS: duration,
      from: u.target,
      to: u.target,
      ...common,
    })
    .map((r) => (u.fallingCooldowns && r.role === 'cooldown' && r.from.unit === r.to.unit && r.from.value < r.to.value ? { ...r, from: r.to, to: r.from } : r))
  const part: fc.Arbitrary<IntervalPart> = fc.record({ durationS: fc.integer({ min: 1, max: 600 }), power: fc.oneof(u.target, u.range), cadence, label: nil(text(12)) })
  const intervals = fc.record({
    kind: fc.constant('intervals' as const),
    repeat: fc.integer({ min: 1, max: 8 }),
    on: part,
    off: part,
    showAverage: nil(fc.constant(true)),
    ...common,
  })
  const freeride = fc.record({ kind: fc.constant('freeride' as const), durationS: duration, flatRoad: nil(fc.boolean()), ...common })
  const maxeffort = fc.record({ kind: fc.constant('maxeffort' as const), durationS: duration, ...common })
  return fc
    .oneof(steady, ramp, intervals, freeride, maxeffort)
    .chain((seg: Segment) => {
      const total = seg.kind === 'intervals' ? seg.repeat * (seg.on.durationS + seg.off.durationS) : seg.durationS
      return texts(total).map((t) => (t ? { ...seg, text: t } : seg))
    })
}

function workoutArb(u: Units): fc.Arbitrary<Workout> {
  return fc.array(segmentArb(u), { minLength: 1, maxLength: 10 }).map((segments) => ({
    id: 'prop',
    name: 'Property',
    tags: [],
    sportType: 'bike' as const,
    source: 'user' as const,
    segments,
  }))
}

const ftpOnly = workoutArb({ target: ftpTarget, range: ftpRange, fallingCooldowns: true })
const mixedUnits = workoutArb({ target: fc.oneof(ftpTarget, wattTarget), range: fc.oneof(ftpRange, wattRange), fallingCooldowns: false })

describe('round trips (fast-check)', () => {
  it('generates valid workouts', () => {
    fc.assert(
      fc.property(mixedUnits, (w) => {
        expect(workoutIssues(w).filter((i) => i.severity === 'error')).toEqual([])
      }),
      RUNS,
    )
  })

  it('toZwo → parseZwo compiles to the same timeline', () => {
    fc.assert(
      fc.property(ftpOnly, (w) => {
        expect(diffTimelines(compileWorkout(w), compileWorkout(parseZwo(toZwo(w))))).toBeNull()
      }),
      RUNS,
    )
  })

  it('toZwo with an FTP keeps absolute-watt targets as the same watts', () => {
    fc.assert(
      fc.property(mixedUnits, fc.integer({ min: 100, max: 450 }), (w, ftpW) => {
        const a = compileWorkout(w)
        const b = compileWorkout(parseZwo(toZwo(w, { ftpW })))
        expect(b.steps.map((s) => [s.kind, s.startS, s.endS])).toEqual(a.steps.map((s) => [s.kind, s.startS, s.endS]))
        for (const s of a.steps) {
          const t = s.startS + s.durationS / 2
          expect(targetAt(b, t, ftpW)?.watts ?? null).toBeCloseTo(targetAt(a, t, ftpW)?.watts ?? 0, 3)
        }
      }),
      RUNS,
    )
  })

  it('toIntervalsText → parseIntervalsText compiles to the same timeline, without errors', () => {
    fc.assert(
      fc.property(mixedUnits, (w) => {
        const txt = toIntervalsText(w)
        const back = parseIntervalsText(txt)
        expect(back.errors, txt).toEqual([])
        expect(diffTimelines(compileWorkout(w), compileWorkout(back.workout)), txt).toBeNull()
      }),
      RUNS,
    )
  })
})

describe('parsers on garbage (fast-check)', () => {
  const lines = fc.array(fc.oneof(fc.string(), fc.constantFrom('- ', '> ', '3x', '- 5m', '- 5m 50%', '[COURSE DATA]', '0 50', '')), { maxLength: 12 }).map((l) => l.join('\n'))

  it('parseIntervalsText never throws', () => {
    fc.assert(
      fc.property(lines, (s) => {
        const r = parseIntervalsText(s)
        for (const e of r.errors) expect(e.line).toBeGreaterThanOrEqual(1)
      }),
      RUNS,
    )
  })

  it('parseZwo and parseErgMrc only throw WorkoutFormatError', () => {
    const xmlish = fc.oneof(
      fc.string(),
      lines,
      fc.string().map((s) => `<workout_file><workout><SteadyState Duration="${s}" Power="0.5"/></workout></workout_file>`),
      fc.string().map((s) => `<workout_file><name>${s}</name><workout>${s}</workout></workout_file>`),
    )
    fc.assert(
      fc.property(xmlish, (s) => {
        for (const parse of [parseZwo, parseErgMrc]) {
          try {
            parse(s)
          } catch (e) {
            expect(e).toBeInstanceOf(WorkoutFormatError)
          }
        }
      }),
      RUNS,
    )
  })
})
