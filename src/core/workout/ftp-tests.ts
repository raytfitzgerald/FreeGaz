// FTP test workouts and the analysis that turns a recorded ride into an FTP
// estimate. The tests are ordinary workouts carrying `ftpTest` metadata; the
// effort steps are found by label (see matchesEffortLabel). Deciding that a
// ramp-test rider has given up is the player's job, not this module's.

import type { Timeline, TimelineStep } from './compile'
import { formatDuration } from './io/text-tokens'
import { matchesEffortLabel } from './labels'
import type { FtpTestSpec, PowerTarget, Segment, TextEvent, Workout } from './model'
import { formatNumber } from './numbers'

export const TWENTY_MIN_EFFORT_LABEL = '20-min test effort'
export const EIGHT_MIN_EFFORT_LABEL = '8-min test effort'
export const RAMP_EFFORT_LABEL = 'Ramp'

/** More missing samples than this in an effort makes the result unreliable. */
export const MAX_MISSING_S = 3
/** This many consecutive zero-watt samples means the rider stopped. */
export const STOPPED_RUN_S = 5
/** Coefficient of variation of 30-s averages above this is uneven pacing. */
export const MAX_PACING_CV = 0.15
/** Ramp tests use the best window of this length; it may miss at most MAX_MISSING_S samples. */
export const RAMP_WINDOW_S = 60

const ftp = (value: number): PowerTarget => ({ unit: 'ftp', value })
const watts = (value: number): PowerTarget => ({ unit: 'watts', value })
/** Range target with the midpoint computed the way the importers compute it. */
const range = (low: number, high: number): PowerTarget => ({ unit: 'ftp', value: (low + high) / 2, low, high })

const TWENTY_MIN_CUES: TextEvent[] = [
  { offsetS: 0, message: 'Twenty minutes, starting now. Settle just below what you think you can hold.' },
  { offsetS: 120, message: 'Two minutes in. Find the pace you can hold and lock onto it.' },
  { offsetS: 300, message: 'A quarter done. Smooth and steady, no surges.' },
  { offsetS: 600, message: 'Halfway. Still in control? Nudge it up a few watts.' },
  { offsetS: 900, message: 'Five minutes left. Start building, a little more each minute.' },
  { offsetS: 1080, message: 'Two minutes to go. Spend what you have been saving.' },
  { offsetS: 1170, message: 'Thirty seconds. Empty the tank!' },
]

const twentyMinWarmup = (): Segment[] => [
  {
    kind: 'ramp',
    role: 'warmup',
    durationS: 840,
    from: ftp(0.5),
    to: ftp(0.65),
    label: 'Warm-up',
    text: [{ offsetS: 0, message: 'Easy warm-up. The hard part comes later; keep this relaxed.' }],
  },
  {
    kind: 'intervals',
    repeat: 3,
    label: 'Warm-up',
    on: { durationS: 60, power: ftp(0.75), cadence: { rpm: 105 }, label: 'Fast pedal' },
    off: { durationS: 60, power: ftp(0.5), label: 'Easy' },
    text: [{ offsetS: 0, message: 'Three fast-pedal minutes at 105 rpm, each followed by an easy minute.' }],
  },
  { kind: 'steady', durationS: 300, power: ftp(0.5), label: 'Easy' },
]

const twentyMinFinish = (): Segment[] => [
  { kind: 'steady', durationS: 600, power: range(0.5, 0.55), label: 'Recover' },
  { kind: 'freeride', durationS: 1200, flatRoad: true, label: TWENTY_MIN_EFFORT_LABEL, text: structuredClone(TWENTY_MIN_CUES) },
  {
    kind: 'ramp',
    role: 'cooldown',
    durationS: 600,
    from: ftp(0.55),
    to: ftp(0.4),
    label: 'Cool-down',
    text: [{ offsetS: 0, message: 'Done! Spin easy; your result is on the next screen.' }],
  },
]

const twentyMinSpec = (): FtpTestSpec => ({ protocol: '20min', effortLabel: TWENTY_MIN_EFFORT_LABEL, factor: 0.95 })

/** Allen & Coggan's 20-minute test (70 min): FTP = 95 % of the 20-min average. */
export const FTP_TEST_20MIN: Workout = {
  id: 'builtin:ftp-test-20min',
  name: 'FTP Test: 20 Minutes',
  author: 'FreeGaz',
  description:
    'The classic 20-minute test: a structured warm-up, a 5-minute blowout to clear the legs, then 20 minutes as hard as you can hold. ERG is off for the efforts, so pace with your gears; FTP is 95 % of your 20-minute average.',
  tags: ['test', 'ftp'],
  sportType: 'bike',
  segments: [
    ...twentyMinWarmup(),
    {
      kind: 'maxeffort',
      durationS: 300,
      label: 'Blowout',
      text: [{ offsetS: 0, message: 'Blowout: five minutes all-out. ERG is off, so shift and go.' }],
    },
    ...twentyMinFinish(),
  ],
  source: 'builtin',
  ftpTest: twentyMinSpec(),
}

/** The 20-minute test with the blowout under ERG control (3 min at 110 % + 2 min at 120 %). */
export const FTP_TEST_20MIN_GUIDED: Workout = {
  id: 'builtin:ftp-test-20min-guided',
  name: 'FTP Test: 20 Minutes (Guided)',
  author: 'FreeGaz',
  description:
    'The 20-minute test with a guided blowout: ERG holds 110 % then 120 % of your current FTP instead of an all-out effort, which is easier to pace if you are new to testing. FTP is 95 % of your 20-minute average.',
  tags: ['test', 'ftp'],
  sportType: 'bike',
  source: 'builtin',
  ftpTest: twentyMinSpec(),
  segments: [
    ...twentyMinWarmup(),
    {
      kind: 'steady',
      durationS: 180,
      power: ftp(1.1),
      label: 'Blowout',
      text: [{ offsetS: 0, message: 'Guided blowout: three minutes at 110 %, then two at 120 %.' }],
    },
    { kind: 'steady', durationS: 120, power: ftp(1.2), label: 'Blowout' },
    ...twentyMinFinish(),
  ],
}

const EIGHT_MIN_CUES: TextEvent[] = [
  { offsetS: 0, message: 'Eight minutes, hard and even. Start a touch below your limit.' },
  { offsetS: 180, message: 'Three minutes in. Settle and hold.' },
  { offsetS: 360, message: 'Two minutes left. Start building.' },
  { offsetS: 450, message: 'Thirty seconds. Everything now!' },
]

/** Two 8-minute efforts with 10 minutes between (59 min): FTP = 90 % of their mean. */
export const EIGHT_MIN_TEST: Workout = {
  id: 'builtin:ftp-test-8min',
  name: 'FTP Test: 2 × 8 Minutes',
  author: 'FreeGaz',
  description:
    'Two 8-minute maximal efforts with ten minutes of recovery between them. Shorter efforts are easier to pace than a 20-minute test; FTP is 90 % of the average of both efforts, so give the second one everything too.',
  tags: ['test', 'ftp'],
  sportType: 'bike',
  segments: [
    { kind: 'ramp', role: 'warmup', durationS: 720, from: ftp(0.45), to: ftp(0.7), label: 'Warm-up' },
    {
      kind: 'intervals',
      repeat: 3,
      label: 'Openers',
      on: { durationS: 60, power: ftp(0.95) },
      off: { durationS: 60, power: ftp(0.5), label: 'Easy' },
    },
    { kind: 'steady', durationS: 300, power: ftp(0.5), label: 'Easy' },
    { kind: 'freeride', durationS: 480, flatRoad: true, label: EIGHT_MIN_EFFORT_LABEL, text: structuredClone(EIGHT_MIN_CUES) },
    {
      kind: 'steady',
      durationS: 600,
      power: ftp(0.5),
      label: 'Recover',
      text: [{ offsetS: 540, message: 'One minute until the second effort.' }],
    },
    { kind: 'freeride', durationS: 480, flatRoad: true, label: EIGHT_MIN_EFFORT_LABEL, text: structuredClone(EIGHT_MIN_CUES) },
    { kind: 'ramp', role: 'cooldown', durationS: 600, from: ftp(0.55), to: ftp(0.4), label: 'Cool-down' },
  ],
  source: 'builtin',
  ftpTest: { protocol: '8min', effortLabel: EIGHT_MIN_EFFORT_LABEL, factor: 0.9 },
}

export interface RampTestOptions {
  /** When set, steps scale with it: start at 50 % FTP, +6 % FTP per step. */
  ftpW?: number
  startW?: number
  stepW?: number
  stepS?: number
  maxSteps?: number
}

/**
 * A ramp test in absolute watts: 5 min warm-up, then `maxSteps` steps labeled
 * "Ramp step N" that each get `stepW` harder, then a cool-down the player can
 * jump to when the rider fails. Without ftpW it starts at 100 W and adds 20 W
 * per minute; with ftpW it starts at 50 % FTP and adds 6 % FTP per minute.
 * FTP = 75 % of the best 1-minute power.
 */
export function rampTest(opts: RampTestOptions = {}): Workout {
  const scaled = opts.ftpW !== undefined && Number.isFinite(opts.ftpW) && opts.ftpW > 0 ? opts.ftpW : undefined
  const startW = opts.startW ?? (scaled ? 0.5 * scaled : 100)
  const stepW = opts.stepW ?? (scaled ? 0.06 * scaled : 20)
  const stepS = opts.stepS ?? 60
  const maxSteps = opts.maxSteps ?? 30
  for (const [name, v] of [
    ['startW', startW],
    ['stepW', stepW],
    ['stepS', stepS],
  ] as const) {
    if (!Number.isFinite(v) || v <= 0) throw new RangeError(`rampTest: ${name} must be positive`)
  }
  if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new RangeError('rampTest: maxSteps must be a whole number of at least 1')

  const steps: Segment[] = []
  for (let n = 1; n <= maxSteps; n++) {
    steps.push({ kind: 'steady', durationS: stepS, power: watts(Math.round(startW + (n - 1) * stepW)), label: `Ramp step ${n}` })
  }
  const first = steps[0]
  if (first) {
    first.text = [
      {
        offsetS: 0,
        message: `The ramp starts: +${formatNumber(stepW, 0)} W every ${stepS === 60 ? 'minute' : formatDuration(stepS)}. Keep going until you can't hold it.`,
      },
    ]
  }
  const isDefault = opts.ftpW === undefined && opts.startW === undefined && opts.stepW === undefined && opts.stepS === undefined && opts.maxSteps === undefined
  const params = [startW, stepW, stepS, maxSteps].map((v) => formatNumber(v, 2)).join('-')
  return {
    id: isDefault ? 'builtin:ramp-test' : `builtin:ramp-test:${params}`,
    name: 'FTP Test: Ramp',
    author: 'FreeGaz',
    description: `One-minute steps that get ${formatNumber(stepW, 0)} W harder until you can't hold the target, so the test finds your limit for you. FTP is 75 % of your best one-minute power; ERG stays on throughout.`,
    tags: ['test', 'ftp'],
    sportType: 'bike',
    segments: [
      {
        kind: 'ramp',
        role: 'warmup',
        durationS: 300,
        from: watts(Math.round(0.6 * startW)),
        to: watts(Math.round(0.9 * startW)),
        label: 'Warm-up',
      },
      ...steps,
      {
        kind: 'ramp',
        role: 'cooldown',
        durationS: 300,
        from: watts(Math.round(0.8 * startW)),
        to: watts(Math.round(0.5 * startW)),
        label: 'Cool-down',
      },
    ],
    source: 'builtin',
    ftpTest: { protocol: 'ramp', effortLabel: RAMP_EFFORT_LABEL, factor: 0.75 },
  }
}

/** Every built-in FTP test, with the ramp test in its default (fixed-watt) form. */
export const FTP_TESTS: readonly Workout[] = [FTP_TEST_20MIN, FTP_TEST_20MIN_GUIDED, EIGHT_MIN_TEST, rampTest()]

// --- analysis -------------------------------------------------------------------

export interface FtpTestResult {
  /** The FTP estimate: factor × basisW. */
  ftpW: number
  /** The measured power the estimate is based on. */
  basisW: number
  /** How basisW was measured, for the result screen. */
  basis: string
  /** False when any problem makes the estimate unreliable. */
  valid: boolean
  problems: string[]
}

/**
 * FTP from a recorded test. `power` holds 1 Hz samples aligned with timeline
 * seconds (power[i] covers [i, i+1)); null means missing, never zero.
 * - 20min (and kolie-moore): factor × mean of the valid samples in the effort.
 * - ramp: factor × best 60-s average over the ramp steps; the partly ridden
 *   last step counts, and a minute may miss at most MAX_MISSING_S samples.
 * - 8min: factor × the mean of both efforts' averages.
 * Efforts are flagged for more than MAX_MISSING_S missing seconds, a run of
 * STOPPED_RUN_S zeros, or 30-s pacing variation above MAX_PACING_CV.
 * Returns null when `w` isn't an FTP test, its effort isn't in `tl`, or no
 * power was recorded during it.
 */
export function computeFtpFromTest(w: Workout, tl: Timeline, power: readonly (number | null)[]): FtpTestResult | null {
  const spec = w.ftpTest
  if (!spec) return null
  const efforts = tl.steps.filter((s) => matchesEffortLabel(s.label, spec.effortLabel))
  const first = efforts[0]
  const last = efforts.at(-1)
  if (!first || !last) return null
  switch (spec.protocol) {
    case 'ramp':
      return rampResult(spec, samplesBetween(first.startS, last.endS, power))
    case '8min':
      return twoEffortResult(spec, efforts, power)
    default:
      return singleEffortResult(spec, first, power)
  }
}

function singleEffortResult(spec: FtpTestSpec, effort: TimelineStep, power: readonly (number | null)[]): FtpTestResult | null {
  const check = checkEffort(samplesBetween(effort.startS, effort.endS, power), 'The effort')
  if (check.meanW === null) return null
  return result(spec, check.meanW, `${pct(spec.factor)} of your ${watt(check.meanW)} average over the ${spec.effortLabel}`, check.problems)
}

function twoEffortResult(spec: FtpTestSpec, efforts: TimelineStep[], power: readonly (number | null)[]): FtpTestResult | null {
  const checks = efforts.slice(0, 2).map((e, i) => checkEffort(samplesBetween(e.startS, e.endS, power), `Effort ${i + 1}`))
  const means = checks.flatMap((c) => (c.meanW === null ? [] : [c.meanW]))
  if (means.length === 0) return null
  const problems = checks.flatMap((c) => c.problems)
  if (means.length < 2) problems.push('Only one of the two efforts has power data, so the estimate rests on a single effort.')
  const basisW = mean(means)
  return result(spec, basisW, `${pct(spec.factor)} of the mean of your efforts (${means.map(watt).join(' and ')})`, problems)
}

function rampResult(spec: FtpTestSpec, all: (number | null)[]): FtpTestResult | null {
  // The recording usually ends inside the ramp. Trailing gaps are "after the
  // ride", not dropouts: counting them as missing would let a window average
  // only its later, harder seconds and overstate the best minute.
  let end = all.length
  while (end > 0 && all[end - 1] === null) end--
  const samples = all.slice(0, end)
  const best = bestWindowMean(samples, RAMP_WINDOW_S, RAMP_WINDOW_S - MAX_MISSING_S)
  if (best !== null) return result(spec, best, `${pct(spec.factor)} of your best minute (${watt(best)})`, [])
  const valid = samples.filter((v): v is number => v !== null)
  if (valid.length === 0) return null
  const basisW = mean(valid)
  return result(spec, basisW, `${pct(spec.factor)} of your ${watt(basisW)} average`, ['No complete minute of power was recorded during the ramp.'])
}

function result(spec: FtpTestSpec, basisW: number, basis: string, problems: string[]): FtpTestResult {
  return { ftpW: spec.factor * basisW, basisW, basis, valid: problems.length === 0, problems }
}

interface EffortCheck {
  meanW: number | null
  problems: string[]
}

function checkEffort(samples: (number | null)[], name: string): EffortCheck {
  const valid = samples.filter((v): v is number => v !== null)
  const problems: string[] = []
  const missing = samples.length - valid.length
  if (missing > MAX_MISSING_S) problems.push(`${name} is missing ${missing} s of power.`)
  const zeros = longestZeroRun(samples)
  if (zeros >= STOPPED_RUN_S) problems.push(`${name} has ${zeros} s in a row at 0 W; it looks like you stopped pedaling.`)
  const cv = pacingVariation(samples)
  if (cv !== null && cv > MAX_PACING_CV) {
    problems.push(`${name} was paced unevenly (30-s averages varied by ${formatNumber(cv * 100, 0)} %).`)
  }
  return { meanW: valid.length > 0 ? mean(valid) : null, problems }
}

/** Samples for [startS, endS); missing, negative or non-finite values become null. */
function samplesBetween(startS: number, endS: number, power: readonly (number | null)[]): (number | null)[] {
  const out: (number | null)[] = []
  for (let i = Math.max(0, Math.round(startS)); i < Math.round(endS); i++) {
    const v = power[i]
    out.push(typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
  }
  return out
}

/** Longest run of zero-watt samples; missing samples neither extend nor break a run. */
function longestZeroRun(samples: (number | null)[]): number {
  let best = 0
  let run = 0
  for (const v of samples) {
    if (v === null) continue
    run = v === 0 ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

/** Coefficient of variation of consecutive full 30-s averages; null with fewer than two. */
function pacingVariation(samples: (number | null)[]): number | null {
  const avgs: number[] = []
  for (let i = 0; i + 30 <= samples.length; i += 30) {
    const chunk = samples.slice(i, i + 30).filter((v): v is number => v !== null)
    if (chunk.length > 0) avgs.push(mean(chunk))
  }
  if (avgs.length < 2) return null
  const m = mean(avgs)
  if (m <= 0) return null
  return Math.sqrt(mean(avgs.map((a) => (a - m) ** 2))) / m
}

/** Best mean over windows of `size` samples holding at least `minValid` valid ones. */
function bestWindowMean(samples: (number | null)[], size: number, minValid: number): number | null {
  let sum = 0
  let count = 0
  let best: number | null = null
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]
    if (typeof v === 'number') {
      sum += v
      count++
    }
    const out = i >= size ? samples[i - size] : null
    if (typeof out === 'number') {
      sum -= out
      count--
    }
    if (i >= size - 1 && count >= minValid) {
      const m = sum / count
      if (best === null || m > best) best = m
    }
  }
  return best
}

function mean(xs: readonly number[]): number {
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

function pct(f: number): string {
  return `${formatNumber(f * 100, 1)} %`
}

function watt(w: number): string {
  return `${formatNumber(w, 0)} W`
}
