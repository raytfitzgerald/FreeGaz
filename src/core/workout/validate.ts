// Human-readable workout problems for the builder and importers. Errors make
// a workout unrideable or ambiguous; warnings flag lossy exports or likely
// mistakes. Deliberately independent of compile.ts (which re-exports this).

import { matchesEffortLabel, normalizeText } from './labels'
import type { CadenceTarget, PowerTarget, Segment, Workout } from './model'
import { formatClock, formatNumber } from './numbers'

export type IssueSeverity = 'error' | 'warning'

export interface WorkoutIssue {
  severity: IssueSeverity
  message: string
  /** 0-based index into workout.segments, when the issue belongs to one. */
  segmentIndex?: number
}

export const MAX_WORKOUT_S = 10 * 3600
/** Zwift is unreliable with very long step lists; exporters warn past this. */
export const ZWIFT_MAX_STEPS = 250

/** Every problem as a message (errors and warnings). Empty means valid. */
export function validateWorkout(w: Workout): string[] {
  return workoutIssues(w).map((i) => i.message)
}

export function workoutIssues(w: Workout): WorkoutIssue[] {
  const issues: WorkoutIssue[] = []
  if (!normalizeText(w.name)) issues.push({ severity: 'error', message: 'The workout needs a name.' })
  if (w.segments.length === 0) {
    issues.push({ severity: 'error', message: 'The workout is empty: add at least one step.' })
    return issues
  }
  let totalS = 0
  let steps = 0
  w.segments.forEach((seg, i) => {
    const where = `Step ${i + 1} (${kindName(seg)})`
    const push = (severity: IssueSeverity, message: string) =>
      issues.push({ severity, message: `${where}: ${message}`, segmentIndex: i })
    const durationS = checkSegment(seg, push)
    if (durationS > 0) totalS += durationS
    steps += seg.kind === 'intervals' ? 2 * (Number.isFinite(seg.repeat) ? Math.max(0, Math.floor(seg.repeat)) : 0) : 1
    checkTexts(seg, durationS, push)
  })
  if (totalS > MAX_WORKOUT_S) {
    issues.push({ severity: 'error', message: `The workout is ${formatClock(totalS)} long; the limit is 10 hours.` })
  }
  if (steps > ZWIFT_MAX_STEPS) {
    issues.push({
      severity: 'warning',
      message: `The workout has ${steps} steps; Zwift may not load files with more than ${ZWIFT_MAX_STEPS}.`,
    })
  }
  const test = w.ftpTest
  if (test && !w.segments.some((s) => segmentLabels(s).some((l) => matchesEffortLabel(l, test.effortLabel)))) {
    issues.push({
      severity: 'error',
      message: `FTP test effort "${test.effortLabel}" doesn't match any step label.`,
    })
  }
  return issues
}

type Push = (severity: IssueSeverity, message: string) => void

/** Checks durations, power and cadence; returns the segment's duration (0 if invalid). */
function checkSegment(seg: Segment, push: Push): number {
  switch (seg.kind) {
    case 'intervals': {
      let ok = true
      if (!Number.isInteger(seg.repeat) || seg.repeat < 1) {
        push('error', 'the repeat count must be a whole number of at least 1.')
        ok = false
      }
      for (const [name, part] of [['on', seg.on], ['off', seg.off]] as const) {
        if (!checkDuration(part.durationS, `the ${name} duration`, push)) ok = false
        checkPower(part.power, `${name} power`, true, push)
        checkCadence(part.cadence, push)
      }
      checkCadence(seg.cadence, push)
      return ok ? seg.repeat * (seg.on.durationS + seg.off.durationS) : 0
    }
    case 'steady':
      checkPower(seg.power, 'power', true, push)
      break
    case 'ramp': {
      checkPower(seg.from, 'start power', false, push)
      checkPower(seg.to, 'end power', false, push)
      if (seg.role === 'cooldown' && seg.from.unit === seg.to.unit && seg.from.value < seg.to.value) {
        push('warning', 'this cool-down rises; Zwift export writes it as a plain Ramp.')
      }
      break
    }
    case 'freeride':
    case 'maxeffort':
      break
  }
  checkCadence(seg.cadence, push)
  return checkDuration(seg.durationS, 'the duration', push) ? seg.durationS : 0
}

function checkDuration(d: number, what: string, push: Push): boolean {
  if (!Number.isFinite(d) || d <= 0) {
    push('error', `${what} must be more than 0 seconds.`)
    return false
  }
  if (d < 1) push('warning', `${what} is under 1 second; exports round it to whole seconds.`)
  return true
}

function checkPower(p: PowerTarget, what: string, rangeAllowed: boolean, push: Push): void {
  if (!Number.isFinite(p.value)) {
    push('error', `${what} is not a number.`)
    return
  }
  if (p.value < 0) push('error', `${what} is negative.`)
  if (p.unit === 'ftp' && p.value > 4) {
    push('warning', `${what} is ${formatNumber(p.value * 100, 1)} % of FTP; is the unit right?`)
  }
  if (p.unit === 'watts' && p.value > 3000) push('warning', `${what} is over 3000 W; is the unit right?`)
  if (p.low === undefined && p.high === undefined) return
  if (!rangeAllowed) {
    push('warning', `${what} has a range, which ramps ignore.`)
    return
  }
  if (!Number.isFinite(p.low) || !Number.isFinite(p.high)) {
    push('error', `${what} range needs both a low and a high value.`)
    return
  }
  const low = p.low ?? 0
  const high = p.high ?? 0
  if (low < 0) push('error', `${what} range is negative.`)
  if (low > high) push('error', `${what} range starts above where it ends.`)
  else if (p.value < low || p.value > high) push('warning', `${what} target lies outside its range.`)
}

function checkCadence(c: CadenceTarget | undefined, push: Push): void {
  if (!c) return
  for (const v of [c.rpm, c.low, c.high]) {
    if (v !== undefined && (!Number.isFinite(v) || v <= 0 || v > 250)) {
      push('error', 'cadence must be between 1 and 250 rpm.')
      return
    }
  }
  if ((c.low === undefined) !== (c.high === undefined)) push('error', 'a cadence range needs both a low and a high value.')
  else if (c.low !== undefined && c.high !== undefined && c.low > c.high) push('error', 'the cadence range starts above where it ends.')
}

function checkTexts(seg: Segment, durationS: number, push: Push): void {
  for (const e of seg.text ?? []) {
    const msg = normalizeText(e.message)
    if (msg === undefined) {
      push('error', 'a text cue has no message.')
      continue
    }
    const quoted = `"${msg.length > 30 ? `${msg.slice(0, 29)}…` : msg}"`
    if (!Number.isFinite(e.offsetS) || e.offsetS < 0) push('error', `text cue ${quoted} has a negative time offset.`)
    else if (durationS > 0 && e.offsetS >= durationS) {
      push('error', `text cue ${quoted} at ${formatClock(e.offsetS)} is past the step's end (${formatClock(durationS)}).`)
    }
    if (e.durationS !== undefined && (!Number.isFinite(e.durationS) || e.durationS <= 0)) {
      push('error', `text cue ${quoted} must show for more than 0 seconds.`)
    }
  }
}

function kindName(seg: Segment): string {
  switch (seg.kind) {
    case 'steady':
      return 'steady'
    case 'ramp':
      return seg.role === 'warmup' ? 'warm-up' : seg.role === 'cooldown' ? 'cool-down' : 'ramp'
    case 'intervals':
      return 'intervals'
    case 'freeride':
      return 'free ride'
    case 'maxeffort':
      return 'max effort'
  }
}

function segmentLabels(seg: Segment): (string | undefined)[] {
  return seg.kind === 'intervals' ? [seg.label, seg.on.label, seg.off.label] : [seg.label]
}
