// FreeGaz's text mode: the intervals.icu workout-builder syntax, plus a few
// FreeGaz extensions so that text ↔ workout is lossless.
//
//   Warm-up                         free text = section label for its steps
//   - 10m warmup 40-75% 90rpm       - <duration> <target> [cadence] [avg]
//   - 3m 55%
//                                   (a blank line ends a section)
//   Main set 4x                     "Nx" at the end of a header repeats the
//   - Over 2m 105%                  step lines below it, up to a blank line;
//   - Under 1m 95%                  words before the duration label the step
//
//   - Blowout 5m max
//   - 20m freeride
//     > 0s Settle in                cue: "> <offset> [display time] message"
//     > 19m30s [15s] Empty it!
//
// Durations: 1h2m30s, 5m, 30s, 90s, 1.5m, 1m30, 5'30", 5:30.
// Targets: 75% (of FTP), 220w, Z1..Z7 (Coggan zone midpoints: 0.50, 0.66,
// 0.83, 0.98, 1.13, 1.35, 1.60), ranges 95-105% / 200-250w (steady at the
// midpoint, range kept on the target), ramp 50-75% (or 150-250w, 50%-250w).
// Cadence: 90rpm or 85-95rpm.
//
// FreeGaz extensions:
// - `warmup` / `cooldown` in place of `ramp` set the ramp's role.
// - `freeride` (ERG off, flat road); add `terrain` for FlatRoad = false.
// - `max` = all-out MaxEffort (ERG off).
// - `avg` shows the running average during the step (Zwift show_avg).
// - `"quoted label"` before the duration, for labels that contain times
//   (\" and \\ escape a quote or backslash inside).
// - Cue lines "> offset [display] message". A cue after a step is relative
//   to that step and fires on every repetition; a cue right after a header,
//   before any step, is relative to the start of the section (used for
//   intervals-wide cues). Default display time is 10 s.
//
// Repeats of exactly two steady steps with the same `avg` become one
// intervals segment (on/off, so ZWO export writes IntervalsT). Other repeats
// expand into repeated segments. Errors carry 1-based line numbers; a bad
// token is reported and skipped, and a step without a duration or target is
// dropped. Nothing throws.

import { DEFAULT_TEXT_DURATION_S } from '../compile'
import { contentId } from '../ids'
import { normalizeText } from '../labels'
import type {
  CadenceTarget,
  FtpTestSpec,
  IntervalPart,
  IntervalsSegment,
  PowerTarget,
  Segment,
  SteadySegment,
  TextEvent,
  Workout,
  WorkoutSource,
} from '../model'
import {
  formatCadence,
  formatDuration,
  formatPowerTarget,
  formatRampRange,
  parseCadenceToken,
  parseDuration,
  parsePowerToken,
  type PowerToken,
} from './text-tokens'

export { formatDuration, parseDuration, ZONE_MIDPOINTS } from './text-tokens'
export { formatClock } from '../numbers'

export interface TextParseError {
  /** 1-based line number. */
  line: number
  message: string
}

export interface IntervalsTextOptions {
  id?: string
  /** Id factory; defaults to a content hash (`text:<fnv1a>`). */
  newId?: () => string
  name?: string
  author?: string
  description?: string
  tags?: string[]
  source?: WorkoutSource
  ftpTest?: FtpTestSpec
}

export interface IntervalsTextResult {
  workout: Workout
  errors: TextParseError[]
}

/** Largest "Nx" repeat count accepted. */
export const TEXT_MAX_REPEAT = 500

interface Cue {
  offsetS: number
  message: string
  durationS?: number
  line: number
}

interface StepItem {
  line: number
  label?: string
  seg: Segment
  cues: Cue[]
}

interface Section {
  line: number
  label?: string
  repeat?: number
  repeatLine?: number
  /** Cues before the first step: relative to the section start. */
  cues: Cue[]
  items: StepItem[]
  /** The last step line failed to parse, so cues below it are dropped with it. */
  lastFailed: boolean
}

export function parseIntervalsText(text: string, opts: IntervalsTextOptions = {}): IntervalsTextResult {
  const errors: TextParseError[] = []
  const segments: Segment[] = []
  let section: Section | null = null
  const open = (line: number): Section => (section ??= { line, cues: [], items: [], lastFailed: false })
  const flush = () => {
    if (section) buildSection(section, segments, errors)
    section = null
  }

  text.split(/\r\n|\r|\n/).forEach((raw, i) => {
    const line = i + 1
    const t = raw.trim()
    if (t === '') return flush()
    if (t.startsWith('-')) {
      const s = open(line)
      const item = parseStep(t.slice(1).trim(), line, errors)
      if (item) s.items.push(item)
      s.lastFailed = item === null
      return
    }
    if (t.startsWith('>')) {
      const cue = parseCue(t.slice(1).trim(), line, errors)
      const s = open(line)
      if (!cue || s.lastFailed) return
      const last = s.items.at(-1)
      if (last) last.cues.push(cue)
      else s.cues.push(cue)
      return
    }
    // Free text: a section header, optionally ending with a repeat count.
    if (section && section.items.length > 0) flush()
    const s = open(line)
    const m = /^(.*?)\s*(\d+)\s*x$/i.exec(t)
    const label = normalizeText(m ? m[1] : t)
    if (label) s.label = s.label ? `${s.label} ${label}` : label
    if (m) {
      const n = Number(m[2])
      if (s.repeat !== undefined) errors.push({ line, message: 'This section already has a repeat count.' })
      else if (!Number.isInteger(n) || n < 1 || n > TEXT_MAX_REPEAT) {
        errors.push({ line, message: `Repeat counts go from 1x to ${TEXT_MAX_REPEAT}x.` })
      } else {
        s.repeat = n
        s.repeatLine = line
      }
    }
  })
  flush()

  const workout: Workout = {
    id: opts.id ?? opts.newId?.() ?? contentId('text', text),
    name: normalizeText(opts.name) ?? 'Untitled workout',
    tags: opts.tags ? [...opts.tags] : [],
    sportType: 'bike',
    segments,
    source: opts.source ?? 'user',
  }
  if (opts.author) workout.author = opts.author
  if (opts.description) workout.description = opts.description
  if (opts.ftpTest) workout.ftpTest = { ...opts.ftpTest }
  // Section-level problems surface when a section closes; report in line order.
  errors.sort((a, b) => a.line - b.line)
  return { workout, errors }
}

// --- step and cue lines -------------------------------------------------------

const DISTANCE = /^\d+(?:\.\d+)?(?:km|mi|mtr|yd|y)$/i
type TargetMark = 'power' | 'freeride' | 'max'

function parseStep(body: string, line: number, errors: TextParseError[]): StepItem | null {
  const err = (message: string) => errors.push({ line, message })
  let rest = body
  let label: string | undefined
  if (rest.startsWith('"')) {
    const quoted = readQuoted(rest)
    if (quoted) {
      label = normalizeText(quoted.text)
      rest = rest.slice(quoted.end)
    }
  }
  const tokens = rest.split(/\s+/).filter((x) => x !== '')
  const di = tokens.findIndex((tok) => parseDuration(tok) !== null)
  if (di === -1) {
    const distance = tokens.find((tok) => DISTANCE.test(tok))
    err(
      distance
        ? `Distance steps like "${distance}" aren't supported; use a time such as 5m.`
        : 'Missing duration: start the step with a time such as 5m, 30s or 1h2m.',
    )
    return null
  }
  if (di > 0) {
    if (label === undefined) label = normalizeText(tokens.slice(0, di).join(' '))
    else err(`Unexpected "${tokens.slice(0, di).join(' ')}" between the label and the duration.`)
  }
  const durationS = parseDuration(tokens[di] ?? '') ?? 0
  if (!(durationS > 0)) {
    err('The duration must be longer than 0 seconds.')
    return null
  }

  const marks: TargetMark[] = []
  const powers: PowerToken[] = []
  let role: 'ramp' | 'warmup' | 'cooldown' | undefined
  let cadence: CadenceTarget | undefined
  let avg = false
  let flat: boolean | undefined
  let prevPercent = false
  for (let i = di + 1; i < tokens.length; i++) {
    const tok = tokens[i] ?? ''
    const low = tok.toLowerCase()
    const wasPercent = prevPercent
    prevPercent = false
    if (low === 'ramp' || low === 'warmup' || low === 'cooldown') {
      if (role !== undefined) err(`"${tok}": this step already has ${role}.`)
      else role = low
    } else if (low === 'freeride' || low === 'free-ride') {
      marks.push('freeride')
    } else if (low === 'free' && tokens[i + 1]?.toLowerCase() === 'ride') {
      marks.push('freeride')
      i++
    } else if (low === 'max' || low === 'maxeffort') {
      marks.push('max')
    } else if (low === 'avg' || low === 'showavg') {
      avg = true
    } else if (low === 'terrain' || low === 'flat') {
      flat = low === 'flat'
    } else if (low === 'ftp' && wasPercent) {
      // "75% FTP": the unit is already implied.
    } else if (low === 'hr' || low === 'lthr' || low === 'bpm' || low === 'pace') {
      err('Heart-rate and pace targets aren\'t supported; use power such as 75%, 220w or Z2.')
    } else {
      const cad = parseCadenceToken(tok)
      const pw = cad ? null : parsePowerToken(tok)
      if (cad) {
        if (cadence) err(`Only one cadence per step ("${tok}").`)
        else cadence = cad
      } else if (pw) {
        marks.push('power')
        powers.push(pw)
        prevPercent = tok.endsWith('%')
      } else if (/^z\d+$/i.test(tok)) {
        err(`Unknown zone "${tok}": use Z1 to Z7.`)
      } else if (parseDuration(tok) !== null) {
        err(`Only one duration per step ("${tok}").`)
      } else {
        err(`Unknown "${tok}".`)
      }
    }
  }

  const mark = marks[0]
  if (mark === undefined) {
    err(
      role
        ? `"${role}" needs a start and end power, like ${role} 50-75%.`
        : 'Missing target: add a power (75%, 220w, Z2), a ramp (ramp 50-75%), freeride or max.',
    )
    return null
  }
  if (marks.length > 1) err('A step takes one target; using the first.')
  if (role && mark !== 'power') err(`"${role}" only applies to a power range.`)
  if (flat !== undefined && mark !== 'freeride') err('"terrain" and "flat" only apply to freeride.')

  let seg: Segment
  if (mark === 'freeride') {
    seg = { kind: 'freeride', durationS, ...(flat === undefined ? {} : { flatRoad: flat }) }
  } else if (mark === 'max') {
    seg = { kind: 'maxeffort', durationS }
  } else {
    const p = powers[0] as PowerToken
    if (role) {
      if (p.kind !== 'range') {
        err(`"${role}" needs a start and end power, like ${role} 50-75%.`)
        return null
      }
      seg = { kind: 'ramp', role, durationS, from: p.a, to: p.b }
    } else if (p.kind === 'single') {
      seg = { kind: 'steady', durationS, power: p.target }
    } else if (p.a.unit !== p.b.unit) {
      err('A power range needs one unit, like 90-95% or 200-250w.')
      return null
    } else {
      seg = { kind: 'steady', durationS, power: rangeTarget(p.a, p.b) }
    }
  }
  if (cadence) seg.cadence = cadence
  if (avg) seg.showAverage = true
  return { line, ...(label ? { label } : {}), seg, cues: [] }
}

/** A leading "quoted label" with \" and \\ escapes; null when the quote never closes. */
function readQuoted(s: string): { text: string; end: number } | null {
  let text = ''
  for (let i = 1; i < s.length; i++) {
    const c = s[i]
    if (c === '"') return { text, end: i + 1 }
    if (c === '\\' && i + 1 < s.length) {
      i++
      text += s[i]
    } else {
      text += c
    }
  }
  return null
}

function rangeTarget(a: PowerTarget, b: PowerTarget): PowerTarget {
  const low = Math.min(a.value, b.value)
  const high = Math.max(a.value, b.value)
  if (low === high) return { unit: a.unit, value: low }
  return { unit: a.unit, value: (low + high) / 2, low, high }
}

function parseCue(body: string, line: number, errors: TextParseError[]): Cue | null {
  const m = /^(\S+)\s*(.*)$/.exec(body)
  const tok = m?.[1] ?? ''
  const offsetS = /^\d+(?:\.\d+)?$/.test(tok) ? Number(tok) : parseDuration(tok)
  if (offsetS === null) {
    errors.push({ line, message: `A cue starts with its time, like "> 2m Stay smooth" (got "${tok}").` })
    return null
  }
  let rest = m?.[2] ?? ''
  let durationS: number | undefined
  const d = /^\[([^\]]*)\]\s*(.*)$/.exec(rest)
  const shown = d ? parseDuration((d[1] ?? '').trim()) : null
  if (d && shown !== null) {
    if (shown > 0) durationS = shown
    else errors.push({ line, message: 'A cue must show for more than 0 seconds.' })
    rest = d[2] ?? ''
  }
  const message = normalizeText(rest)
  if (!message) {
    errors.push({ line, message: 'This cue has no message.' })
    return null
  }
  return { offsetS, message, ...(durationS !== undefined ? { durationS } : {}), line }
}

// --- sections → segments -------------------------------------------------------

function buildSection(s: Section, out: Segment[], errors: TextParseError[]): void {
  if (s.items.length === 0) {
    if (s.repeat !== undefined) {
      errors.push({ line: s.repeatLine ?? s.line, message: `"${s.repeat}x" repeats nothing: put its steps right below it, with no blank line.` })
    }
    for (const c of s.cues) errors.push({ line: c.line, message: 'This cue has no step to attach to.' })
    return
  }
  for (const item of s.items) {
    const d = segmentSeconds(item.seg)
    item.cues = item.cues.filter((c) => {
      if (c.offsetS < d) return true
      errors.push({ line: c.line, message: `This cue at ${formatDuration(c.offsetS)} is past the end of its ${formatDuration(d)} step.` })
      return false
    })
  }
  const repeat = s.repeat ?? 1
  const [a, b] = s.items
  if (s.repeat !== undefined && s.items.length === 2 && a && b && a.seg.kind === 'steady' && b.seg.kind === 'steady' && !a.seg.showAverage === !b.seg.showAverage) {
    out.push(intervalsFrom(s, a, a.seg, b, b.seg, repeat, errors))
    return
  }
  const first = out.length
  const starts: number[] = []
  let t = 0
  for (let r = 0; r < repeat; r++) {
    for (const item of s.items) {
      const seg: Segment = structuredClone(item.seg)
      const label = item.label ?? s.label
      if (label) seg.label = label
      if (item.cues.length > 0) seg.text = item.cues.map(toTextEvent)
      starts.push(t)
      t += segmentSeconds(seg)
      out.push(seg)
    }
  }
  for (const c of s.cues) {
    const j = starts.findIndex((st, k) => c.offsetS >= st && c.offsetS < st + segmentSeconds(out[first + k]))
    const seg = out[first + j]
    if (j === -1 || !seg) {
      errors.push({ line: c.line, message: `This cue at ${formatDuration(c.offsetS)} is past the end of its section (${formatDuration(t)}).` })
      continue
    }
    seg.text = [...(seg.text ?? []), toTextEvent({ ...c, offsetS: c.offsetS - (starts[j] ?? 0) })]
  }
}

function intervalsFrom(
  s: Section,
  a: StepItem,
  onSeg: SteadySegment,
  b: StepItem,
  offSeg: SteadySegment,
  repeat: number,
  errors: TextParseError[],
): IntervalsSegment {
  const part = (item: StepItem, seg: SteadySegment): IntervalPart => ({
    durationS: seg.durationS,
    power: seg.power,
    ...(seg.cadence ? { cadence: seg.cadence } : {}),
    ...(item.label ? { label: item.label } : {}),
  })
  const period = onSeg.durationS + offSeg.durationS
  const text: TextEvent[] = []
  for (const c of s.cues) {
    if (c.offsetS < repeat * period) text.push(toTextEvent(c))
    else errors.push({ line: c.line, message: `This cue at ${formatDuration(c.offsetS)} is past the end of its section (${formatDuration(repeat * period)}).` })
  }
  for (let r = 0; r < repeat; r++) {
    for (const c of a.cues) text.push(toTextEvent({ ...c, offsetS: r * period + c.offsetS }))
    for (const c of b.cues) text.push(toTextEvent({ ...c, offsetS: r * period + onSeg.durationS + c.offsetS }))
  }
  text.sort((x, y) => x.offsetS - y.offsetS)
  const seg: IntervalsSegment = { kind: 'intervals', repeat, on: part(a, onSeg), off: part(b, offSeg) }
  if (s.label) seg.label = s.label
  if (onSeg.showAverage) seg.showAverage = true
  if (text.length > 0) seg.text = text
  return seg
}

function toTextEvent(c: Cue): TextEvent {
  return { offsetS: c.offsetS, message: c.message, ...(c.durationS !== undefined ? { durationS: c.durationS } : {}) }
}

function segmentSeconds(seg: Segment | undefined): number {
  if (!seg) return 0
  return seg.kind === 'intervals' ? seg.repeat * (seg.on.durationS + seg.off.durationS) : seg.durationS
}

// --- export -------------------------------------------------------------------

/** Longest step pattern the exporter tries to fold back into an "Nx" block. */
const MAX_PATTERN = 8
/** This many labeled one-step sections in a row are written as labeled steps, not headers. */
const LABEL_CHAIN = 3

type Item =
  | { kind: 'block'; lines: string[] }
  | { kind: 'single'; seg: Segment; label: string }
  | { kind: 'plain'; seg: Segment }

/**
 * Workout → text that parseIntervalsText reads back to the same compiled
 * timeline. Steps sharing a label get a section header; a chain of three or
 * more one-step sections (a ramp test's "Ramp step N") uses labeled steps
 * instead; repeated step patterns fold back into "Nx" blocks; intervals
 * become two-step repeats. Only the steps are written: name, description and
 * tags live elsewhere. Limits: a range whose value isn't its midpoint keeps
 * only the value, and cadence with both rpm and a range keeps rpm. Invalid
 * values (negative power, a lone cadence low/high) can't be written;
 * validateWorkout flags them.
 */
export function toIntervalsText(w: Workout): string {
  const items = groupSegments(w.segments)
  const blocks: string[][] = []
  let free: string[] | null = null
  const addFree = (lines: string[]) => {
    if (!free) {
      free = []
      blocks.push(free)
    }
    free.push(...lines)
  }
  items.forEach((item, i) => {
    if (item.kind === 'plain') return addFree(stepLines(item.seg, undefined))
    if (item.kind === 'single' && (!isHeaderSafe(item.label) || singleChain(items, i) >= LABEL_CHAIN)) {
      return addFree(stepLines(item.seg, item.label))
    }
    free = null
    blocks.push(item.kind === 'block' ? item.lines : [item.label, ...stepLines(item.seg, undefined)])
  })
  return blocks.length === 0 ? '' : `${blocks.map((b) => b.join('\n')).join('\n\n')}\n`
}

function groupSegments(segs: Segment[]): Item[] {
  const items: Item[] = []
  let i = 0
  while (i < segs.length) {
    const seg = segs[i] as Segment
    if (seg.kind === 'intervals') {
      items.push({ kind: 'block', lines: intervalsLines(seg) })
      i++
      continue
    }
    const rep = findRepeat(segs, i)
    if (rep) {
      items.push({ kind: 'block', lines: repeatLines(segs.slice(i, i + rep.k), rep.reps) })
      i += rep.k * rep.reps
      continue
    }
    const label = normalizeText(seg.label)
    if (label === undefined) {
      items.push({ kind: 'plain', seg })
      i++
      continue
    }
    let j = i + 1
    while (j < segs.length && segs[j]?.kind !== 'intervals' && normalizeText(segs[j]?.label) === label && !findRepeat(segs, j)) j++
    if (j - i >= 2 && isHeaderSafe(label)) {
      items.push({ kind: 'block', lines: [label, ...segs.slice(i, j).flatMap((s) => stepLines(s, undefined))] })
      i = j
    } else {
      items.push({ kind: 'single', seg, label })
      i++
    }
  }
  return items
}

/** Length of the run of consecutive 'single' items that contains items[i]. */
function singleChain(items: Item[], i: number): number {
  let a = i
  let b = i
  while (items[a - 1]?.kind === 'single') a--
  while (items[b + 1]?.kind === 'single') b++
  return b - a + 1
}

function stepLines(seg: Segment, label: string | undefined): string[] {
  const parts = ['-']
  if (label !== undefined) parts.push(stepLabel(label))
  parts.push(formatDuration(seg.kind === 'intervals' ? 0 : seg.durationS))
  switch (seg.kind) {
    case 'steady':
      parts.push(formatPowerTarget(seg.power))
      break
    case 'ramp':
      parts.push(seg.role, formatRampRange(seg.from, seg.to))
      break
    case 'freeride':
      parts.push('freeride')
      if (seg.flatRoad === false) parts.push('terrain')
      break
    case 'maxeffort':
      parts.push('max')
      break
    case 'intervals':
      break
  }
  const cadence = formatCadence(seg.cadence)
  if (cadence) parts.push(cadence)
  if (seg.showAverage) parts.push('avg')
  return [parts.join(' '), ...cueLines(seg.text, segmentSeconds(seg), '  ')]
}

function intervalsLines(seg: IntervalsSegment): string[] {
  const label = normalizeText(seg.label)
  let onLabel = normalizeText(seg.on.label)
  let offLabel = normalizeText(seg.off.label)
  let header = `${seg.repeat}x`
  if (label !== undefined && !/^[->]/.test(label)) header = `${label} ${seg.repeat}x`
  else if (label !== undefined) {
    onLabel ??= label
    offLabel ??= label
  }
  const half = (p: IntervalPart): SteadySegment => {
    const cadence = usableCadence(p.cadence) ?? seg.cadence
    return {
      kind: 'steady',
      durationS: p.durationS,
      power: p.power,
      ...(cadence ? { cadence } : {}),
      ...(seg.showAverage ? { showAverage: true } : {}),
    }
  }
  return [
    header,
    ...cueLines(seg.text, segmentSeconds(seg), ''),
    ...stepLines(half(seg.on), onLabel),
    ...stepLines(half(seg.off), offLabel),
  ]
}

function repeatLines(pattern: Segment[], reps: number): string[] {
  const labels = pattern.map((s) => normalizeText(s.label))
  const common = labels.every((l) => l === labels[0]) ? labels[0] : undefined
  if (common !== undefined && !/^[->]/.test(common)) {
    return [`${common} ${reps}x`, ...pattern.flatMap((s) => stepLines(s, undefined))]
  }
  return [`${reps}x`, ...pattern.flatMap((s, k) => stepLines(s, labels[k]))]
}

function cueLines(events: TextEvent[] | undefined, durationS: number, indent: string): string[] {
  return (events ?? [])
    .map((e) => ({ offsetS: e.offsetS, durationS: e.durationS, message: normalizeText(e.message) }))
    .filter((e) => Number.isFinite(e.offsetS) && e.offsetS >= 0 && e.offsetS < durationS && e.message !== undefined)
    .sort((x, y) => x.offsetS - y.offsetS)
    .map((e) => {
      const msg = e.message ?? ''
      const shown = e.durationS !== undefined && e.durationS > 0 ? e.durationS : DEFAULT_TEXT_DURATION_S
      const display = shown !== DEFAULT_TEXT_DURATION_S || msg.startsWith('[') ? ` [${formatDuration(shown)}]` : ''
      return `${indent}> ${formatDuration(e.offsetS)}${display} ${msg}`
    })
}

/** A pattern of k non-interval segments starting at i that repeats at least twice. */
function findRepeat(segs: Segment[], i: number): { k: number; reps: number } | null {
  let best: { k: number; reps: number } | null = null
  for (let k = 2; k <= MAX_PATTERN && i + 2 * k <= segs.length; k++) {
    const pattern = segs.slice(i, i + k)
    if (pattern.some((s) => s.kind === 'intervals')) break
    const [a, b] = pattern
    // Two steady steps would read back as an intervals segment, not as steps.
    if (k === 2 && a?.kind === 'steady' && b?.kind === 'steady' && !a.showAverage === !b.showAverage) continue
    let reps = 1
    while (i + (reps + 1) * k <= segs.length && samePattern(segs, i, i + reps * k, k)) reps++
    if (reps >= 2 && (!best || reps * k > best.reps * best.k)) best = { k, reps }
  }
  return best
}

function samePattern(segs: Segment[], a: number, b: number, k: number): boolean {
  for (let m = 0; m < k; m++) if (!sameValue(segs[a + m], segs[b + m])) return false
  return true
}

/** Structural equality ignoring key order and undefined-valued keys. */
function sameValue(x: unknown, y: unknown): boolean {
  if (x === y) return true
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((v, i) => sameValue(v, y[i]))
  if (typeof x !== 'object' || typeof y !== 'object' || x === null || y === null || Array.isArray(x) || Array.isArray(y)) return false
  const xo = x as Record<string, unknown>
  const yo = y as Record<string, unknown>
  const keys = new Set([...Object.keys(xo), ...Object.keys(yo)])
  for (const key of keys) if (!sameValue(xo[key], yo[key])) return false
  return true
}

/** A plain header line: not a step or cue, and not ending in a repeat count. */
function isHeaderSafe(label: string): boolean {
  return !/^[->]/.test(label) && !/\d\s*x$/i.test(label)
}

/** How a label is written before the duration: bare words, or quoted when a word looks like a time. */
function stepLabel(label: string): string {
  if (!label.startsWith('"') && !label.split(' ').some((w) => parseDuration(w) !== null)) return label
  return `"${label.replace(/[\\"]/g, '\\$&')}"`
}

/** The cadence compile would use for an interval part (undefined when nothing in it is valid). */
function usableCadence(c: CadenceTarget | undefined): CadenceTarget | undefined {
  const ok = (n: number | undefined) => typeof n === 'number' && Number.isFinite(n) && n > 0
  return c && (ok(c.rpm) || ok(c.low) || ok(c.high)) ? c : undefined
}
