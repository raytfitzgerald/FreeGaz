import { describe, expect, it } from 'vitest'
import { compileWorkout, diffTimelines, stepAt, targetAt, validateWorkout, type Timeline, type TimelineStep } from './compile'
import {
  computeFtpFromTest,
  EIGHT_MIN_TEST,
  FTP_TEST_20MIN,
  FTP_TEST_20MIN_GUIDED,
  FTP_TESTS,
  rampTest,
} from './ftp-tests'
import { parseIntervalsText, toIntervalsText } from './io/intervals-text'
import { parseZwo, toZwo } from './io/zwo'
import type { Workout } from './model'

/**
 * A synthetic 1 Hz ride: ERG steps at their target, ERG-off steps from
 * `rider(t, step)`, recording stops at `untilS`.
 */
function ride(tl: Timeline, ftpW: number, rider: (t: number, step: TimelineStep) => number | null, untilS = tl.durationS) {
  const out: (number | null)[] = []
  for (let t = 0; t < untilS; t++) {
    const step = stepAt(tl, t + 0.5)
    if (!step) break
    out.push(step.ergOff ? rider(t, step) : (targetAt(tl, t + 0.5, ftpW)?.watts ?? null))
  }
  return out
}

const effortOf = (tl: Timeline, label: string) => tl.steps.filter((s) => s.label === label)

describe('FTP_TEST_20MIN', () => {
  const tl = compileWorkout(FTP_TEST_20MIN)

  it('is a 70-minute Allen & Coggan test', () => {
    expect(tl.durationS).toBe(70 * 60)
    expect(FTP_TEST_20MIN.ftpTest).toEqual({ protocol: '20min', effortLabel: '20-min test effort', factor: 0.95 })
    expect(validateWorkout(FTP_TEST_20MIN)).toEqual([])
    expect(tl.steps.map((s) => [s.label, s.kind, s.durationS])).toEqual([
      ['Warm-up', 'ramp', 840],
      ['Fast pedal', 'on', 60],
      ['Easy', 'off', 60],
      ['Fast pedal', 'on', 60],
      ['Easy', 'off', 60],
      ['Fast pedal', 'on', 60],
      ['Easy', 'off', 60],
      ['Easy', 'steady', 300],
      ['Blowout', 'maxeffort', 300],
      ['Recover', 'steady', 600],
      ['20-min test effort', 'freeride', 1200],
      ['Cool-down', 'ramp', 600],
    ])
  })

  it('warms up for 20 minutes from 50 to 65 % with fast pedalling at 105 rpm', () => {
    const warm = tl.steps.filter((s) => s.endS <= 1200)
    expect(warm.at(-1)?.endS).toBe(1200)
    expect(warm[0]).toMatchObject({ from: { value: 0.5 }, to: { value: 0.65 }, role: 'warmup' })
    for (const s of warm.filter((x) => x.kind === 'on')) expect(s).toMatchObject({ from: { value: 0.75 }, cadence: { rpm: 105 } })
    for (const s of warm.filter((x) => x.kind === 'off')) expect(s.from?.value).toBe(0.5)
  })

  it('turns ERG off for the blowout and the effort, which rides a flat road', () => {
    const [effort] = effortOf(tl, '20-min test effort')
    expect(effort).toMatchObject({ kind: 'freeride', ergOff: true, flatRoad: true, durationS: 1200, startS: 2400 })
    expect(effortOf(tl, 'Blowout')[0]).toMatchObject({ kind: 'maxeffort', ergOff: true })
    expect(effortOf(tl, 'Recover')[0]?.from).toEqual({ unit: 'ftp', value: 0.525, low: 0.5, high: 0.55 })
    expect(tl.steps.at(-1)).toMatchObject({ role: 'cooldown', from: { value: 0.55 }, to: { value: 0.4 } })
  })

  it('paces the effort with cues at 0, 2, 5, 10, 15, 18 and 19:30 minutes', () => {
    const [effort] = effortOf(tl, '20-min test effort')
    const cues = tl.texts.filter((t) => t.stepIndex === effort?.index).map((t) => (t.atS - (effort?.startS ?? 0)) / 60)
    expect(cues).toEqual([0, 2, 5, 10, 15, 18, 19.5])
  })

  it('has a guided variant with an ERG blowout of 3 min at 110 % and 2 min at 120 %', () => {
    const g = compileWorkout(FTP_TEST_20MIN_GUIDED)
    expect(g.durationS).toBe(tl.durationS)
    expect(effortOf(g, 'Blowout').map((s) => [s.kind, s.durationS, s.from?.value, s.ergOff])).toEqual([
      ['steady', 180, 1.1, false],
      ['steady', 120, 1.2, false],
    ])
    expect(effortOf(g, '20-min test effort')[0]?.ergOff).toBe(true)
    expect(FTP_TEST_20MIN_GUIDED.segments[0]).not.toBe(FTP_TEST_20MIN.segments[0])
  })
})

describe('rampTest', () => {
  it('is Zwift-style by default: 100 W plus 20 W a minute after a 5-minute warm-up', () => {
    const w = rampTest()
    const tl = compileWorkout(w)
    expect(w.id).toBe('builtin:ramp-test')
    expect(w.ftpTest).toEqual({ protocol: 'ramp', effortLabel: 'Ramp', factor: 0.75 })
    expect(tl.steps[0]).toMatchObject({ label: 'Warm-up', role: 'warmup', durationS: 300 })
    const steps = tl.steps.filter((s) => s.label?.startsWith('Ramp step'))
    expect(steps).toHaveLength(30)
    expect(steps.slice(0, 3).map((s) => [s.label, s.startS, s.durationS, s.from])).toEqual([
      ['Ramp step 1', 300, 60, { unit: 'watts', value: 100 }],
      ['Ramp step 2', 360, 60, { unit: 'watts', value: 120 }],
      ['Ramp step 3', 420, 60, { unit: 'watts', value: 140 }],
    ])
    expect(steps.at(-1)?.from).toEqual({ unit: 'watts', value: 680 })
    expect(validateWorkout(w)).toEqual([])
  })

  it('scales with FTP TrainerRoad-style, and takes explicit options', () => {
    const tl = compileWorkout(rampTest({ ftpW: 250 }))
    const targets = tl.steps.filter((s) => s.label?.startsWith('Ramp step')).map((s) => s.from?.value)
    expect(targets.slice(0, 4)).toEqual([125, 140, 155, 170])
    const custom = rampTest({ startW: 150, stepW: 25, stepS: 30, maxSteps: 4 })
    expect(custom.id).toBe('builtin:ramp-test:150-25-30-4')
    expect(compileWorkout(custom).steps.map((s) => s.label)).toEqual([
      'Warm-up',
      'Ramp step 1',
      'Ramp step 2',
      'Ramp step 3',
      'Ramp step 4',
      'Cool-down',
    ])
    expect(() => rampTest({ stepW: 0 })).toThrow(RangeError)
    expect(() => rampTest({ maxSteps: 2.5 })).toThrow(RangeError)
  })
})

describe('EIGHT_MIN_TEST', () => {
  it('has two 8-minute ERG-off efforts ten minutes apart', () => {
    const tl = compileWorkout(EIGHT_MIN_TEST)
    const efforts = effortOf(tl, '8-min test effort')
    expect(efforts.map((s) => [s.kind, s.durationS, s.ergOff])).toEqual([
      ['freeride', 480, true],
      ['freeride', 480, true],
    ])
    expect((efforts[1]?.startS ?? 0) - (efforts[0]?.endS ?? 0)).toBe(600)
    expect(EIGHT_MIN_TEST.ftpTest?.factor).toBe(0.9)
    expect(tl.durationS).toBe(59 * 60)
  })
})

describe('FTP_TESTS', () => {
  it.each(FTP_TESTS)('$name validates and round-trips through ZWO and text', (w) => {
    expect(validateWorkout(w)).toEqual([])
    const tl = compileWorkout(w)
    const zwo = compileWorkout(parseZwo(toZwo(w, { ftpW: 250 })))
    if (w.ftpTest?.protocol === 'ramp') {
      // ZWO has no absolute watts: the ramp comes back as FTP fractions of the same watts.
      expect(zwo.steps.map((s) => (s.from?.value ?? 0) * 250)).toEqual(
        tl.steps.map((s) => expect.closeTo(s.from?.unit === 'watts' ? s.from.value : 0, 6)),
      )
    } else {
      expect(diffTimelines(tl, zwo)).toBeNull()
    }
    const back = parseIntervalsText(toIntervalsText(w))
    expect(back.errors).toEqual([])
    expect(diffTimelines(tl, compileWorkout(back.workout))).toBeNull()
  })
})

describe('computeFtpFromTest', () => {
  const tl20 = compileWorkout(FTP_TEST_20MIN)
  const effort20 = effortOf(tl20, '20-min test effort')[0] as TimelineStep
  const inEffort = (t: number) => t >= effort20.startS && t < effort20.endS

  it('takes 95 % of a steady 20-minute effort', () => {
    const r = computeFtpFromTest(FTP_TEST_20MIN, tl20, ride(tl20, 250, () => 250))
    expect(r).toEqual({
      ftpW: 237.5,
      basisW: 250,
      basis: '95 % of your 250 W average over the 20-min test effort',
      valid: true,
      problems: [],
    })
  })

  it('tolerates three missing seconds but not four', () => {
    const withGaps = (n: number) =>
      ride(tl20, 250, (t) => (inEffort(t) && t - effort20.startS < n ? null : 250))
    expect(computeFtpFromTest(FTP_TEST_20MIN, tl20, withGaps(3))).toMatchObject({ ftpW: 237.5, valid: true })
    const r = computeFtpFromTest(FTP_TEST_20MIN, tl20, withGaps(4))
    expect(r).toMatchObject({ ftpW: 237.5, valid: false, problems: ['The effort is missing 4 s of power.'] })
  })

  it('flags a rider who stopped, and uneven pacing', () => {
    const stopped = ride(tl20, 250, (t) => (t - effort20.startS >= 600 && t - effort20.startS < 605 ? 0 : 250))
    expect(computeFtpFromTest(FTP_TEST_20MIN, tl20, stopped)?.problems).toEqual([
      'The effort has 5 s in a row at 0 W; it looks like you stopped pedaling.',
    ])
    const surging = ride(tl20, 250, (t) => (Math.floor((t - effort20.startS) / 30) % 2 === 0 ? 150 : 350))
    const r = computeFtpFromTest(FTP_TEST_20MIN, tl20, surging)
    expect(r).toMatchObject({ basisW: 250, valid: false, problems: ['The effort was paced unevenly (30-s averages varied by 40 %).'] })
  })

  it('counts an unfinished recording as missing power', () => {
    const quit = ride(tl20, 250, () => 260, effort20.startS + 600)
    const r = computeFtpFromTest(FTP_TEST_20MIN, tl20, quit)
    expect(r).toMatchObject({ basisW: 260, valid: false, problems: ['The effort is missing 600 s of power.'] })
  })

  it('returns null for non-tests, missing efforts or no power at all', () => {
    const plain: Workout = { ...FTP_TEST_20MIN, ftpTest: undefined }
    expect(computeFtpFromTest(plain, tl20, [])).toBeNull()
    expect(computeFtpFromTest(FTP_TEST_20MIN, compileWorkout(EIGHT_MIN_TEST), [])).toBeNull()
    expect(computeFtpFromTest(FTP_TEST_20MIN, tl20, ride(tl20, 250, () => null))).toBeNull()
  })

  it('takes 75 % of the best minute of a ramp, counting the failed step', () => {
    const w = rampTest()
    const tl = compileWorkout(w)
    const step12 = tl.steps.find((s) => s.label === 'Ramp step 12') as TimelineStep
    // Holds every step through 11 (300 W), then fails 30 s into step 12 (320 W).
    const power = ride(tl, 250, () => null, step12.startS + 30)
    const r = computeFtpFromTest(w, tl, power)
    expect(r).toEqual({ ftpW: 232.5, basisW: 310, basis: '75 % of your best minute (310 W)', valid: true, problems: [] })
    // Zeros recorded after the failure don't change the best minute.
    const zeros = [...power, ...Array.from({ length: 120 }, () => 0)]
    expect(computeFtpFromTest(w, tl, zeros)?.ftpW).toBe(232.5)
  })

  it('reports a ramp without a complete minute', () => {
    const w = rampTest()
    const tl = compileWorkout(w)
    const power = ride(tl, 250, () => null, 300 + 40)
    expect(computeFtpFromTest(w, tl, power)).toMatchObject({
      basisW: 100,
      ftpW: 75,
      valid: false,
      problems: ['No complete minute of power was recorded during the ramp.'],
    })
  })

  it('takes 90 % of the mean of both 8-minute efforts', () => {
    const tl = compileWorkout(EIGHT_MIN_TEST)
    const [first] = effortOf(tl, '8-min test effort')
    const power = ride(tl, 250, (t) => (first && t < first.endS ? 260 : 250))
    expect(computeFtpFromTest(EIGHT_MIN_TEST, tl, power)).toEqual({
      ftpW: 229.5,
      basisW: 255,
      basis: '90 % of the mean of your efforts (260 W and 250 W)',
      valid: true,
      problems: [],
    })
    const oneOnly = ride(tl, 250, (t) => (first && t < first.endS ? 260 : null))
    expect(computeFtpFromTest(EIGHT_MIN_TEST, tl, oneOnly)).toMatchObject({
      basisW: 260,
      valid: false,
      problems: [
        'Effort 2 is missing 480 s of power.',
        'Only one of the two efforts has power data, so the estimate rests on a single effort.',
      ],
    })
  })
})
