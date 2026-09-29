// Zwift .zwo import/export.
//
// Import matches tag and attribute names case-insensitively:
//   <workout_file> author, name, description, sportType (bike only; "run"
//   throws), tags/tag@name, workout. Blocks: Warmup, Cooldown, Ramp,
//   SteadyState, SolidState (alias), IntervalsT, FreeRide/Freeride, MaxEffort,
//   each with nested textevent/TextEvent (timeoffset, message or the common
//   typo mssage, duration) and show_avg. Unknown elements and attributes are
//   skipped with a warning; Zwift's pace="0" is ignored silently.
//
// Semantics:
// - Power values are fractions of FTP; durations and offsets are seconds.
// - Warmup/Ramp: PowerLow is the start and PowerHigh the end, never sorted.
// - Cooldown always descends: start = max(PowerLow, PowerHigh), end = min.
//   Zwift's own files write PowerLow > PowerHigh, but some tools write
//   PowerLow < PowerHigh and still mean "down".
// - PowerLow/PowerHigh on SteadyState (and PowerOnLow/High, PowerOffLow/High
//   on IntervalsT) are a range target: value = Power when given, else the
//   midpoint, with low/high kept on the target.
// - IntervalsT Cadence is the on cadence, CadenceResting the off cadence.
//
// FreeGaz extensions, which Zwift ignores, keep exports lossless: Label on
// every block, OnLabel/OffLabel on IntervalsT, and cadence ranges on
// IntervalsT (CadenceLow/CadenceHigh, CadenceRestingLow/CadenceRestingHigh).
//
// Export writes pretty XML with <sportType>bike</sportType>, durations and
// offsets rounded to whole seconds and fractions to 6 decimals; absolute-watt
// targets need opts.ftpW. A rising cool-down becomes <Ramp> (Zwift would read
// it as descending). For whole-second, FTP-relative workouts,
// parseZwo(toZwo(w)) compiles to the same timeline.

import { contentId } from '../ids'
import { normalizeText } from '../labels'
import type { CadenceTarget, IntervalPart, PowerTarget, Segment, TextEvent, Workout, WorkoutSource } from '../model'
import { formatNumber, parseNumber } from '../numbers'
import { WorkoutFormatError } from './errors'
import { buildXml, parseXml, type XmlElement, type XmlNode } from './xml'

export interface ZwoParseOptions {
  source?: WorkoutSource
  /** Id factory; defaults to a content hash (`zwo:<fnv1a>`). */
  newId?: () => string
}

export interface ZwoParseResult {
  workout: Workout
  /** Everything skipped or guessed, in human-readable form. */
  warnings: string[]
}

export interface ZwoExportOptions {
  /** Needed to convert absolute-watt targets into FTP fractions. */
  ftpW?: number
}

/** Largest IntervalsT Repeat accepted on import. */
export const ZWO_MAX_REPEAT = 1000

const BLOCKS = new Set(['warmup', 'cooldown', 'ramp', 'steadystate', 'solidstate', 'intervalst', 'freeride', 'maxeffort'])
/** Attributes Zwift writes that mean nothing for a bike workout. */
const SILENTLY_IGNORED = ['pace']

export function parseZwo(xml: string, opts?: ZwoParseOptions): Workout {
  return parseZwoWithWarnings(xml, opts).workout
}

export function parseZwoWithWarnings(xml: string, opts: ZwoParseOptions = {}): ZwoParseResult {
  const warnings: string[] = []
  const roots = parseXml(xml)
  const root = roots[0]
  if (!root) throw new WorkoutFormatError('The file contains no XML elements.')
  if (root.name !== 'workout_file') {
    throw new WorkoutFormatError(`Not a Zwift workout: expected <workout_file>, found <${root.rawName}>.`)
  }
  if (roots.length > 1) warnings.push('Ignored elements after </workout_file>.')

  const meta: { name?: string; author?: string; description?: string; sport?: string } = {}
  const tags: string[] = []
  let body: XmlElement | undefined
  for (const el of root.children) {
    switch (el.name) {
      case 'name':
      case 'author':
      case 'description':
        if (meta[el.name] === undefined && el.text !== '') meta[el.name] = el.text
        break
      case 'sporttype':
        meta.sport = el.text
        break
      case 'tags':
        collectTags(el, tags, warnings)
        break
      case 'workout':
        if (body) warnings.push('Ignored a second <workout> element.')
        else body = el
        break
      default:
        warnings.push(`Ignored <${el.rawName}>.`)
    }
  }

  const sport = meta.sport?.trim().toLowerCase()
  if (sport && sport !== 'bike') {
    throw new WorkoutFormatError(
      sport === 'run'
        ? 'This is a running workout (sportType "run"). FreeGaz can only ride bike workouts.'
        : `Unsupported sportType "${meta.sport ?? ''}": FreeGaz can only ride bike workouts.`,
    )
  }
  if (!body) throw new WorkoutFormatError('The file has no <workout> element, so there is nothing to ride.')

  const segments: Segment[] = []
  body.children.forEach((el, i) => {
    const seg = parseBlock(el, i + 1, warnings)
    if (seg) segments.push(seg)
  })
  if (segments.length === 0) warnings.push('The workout has no rideable blocks.')

  const workout: Workout = {
    id: opts.newId?.() ?? contentId('zwo', xml),
    name: normalizeText(meta.name) ?? 'Untitled workout',
    tags,
    sportType: 'bike',
    segments,
    source: opts.source ?? 'import',
  }
  const author = normalizeText(meta.author)
  if (author) workout.author = author
  if (meta.description) workout.description = meta.description
  return { workout, warnings }
}

export function toZwo(w: Workout, opts: ZwoExportOptions = {}): string {
  const frac = (value: number, unit: PowerTarget['unit']): number => {
    if (unit === 'ftp') return value
    const ftp = opts.ftpW
    if (ftp === undefined || !Number.isFinite(ftp) || ftp <= 0) {
      throw new Error('toZwo needs opts.ftpW to convert absolute-watt targets into FTP fractions.')
    }
    return value / ftp
  }
  const children: XmlNode[] = [
    { name: 'author', text: w.author ?? '' },
    { name: 'name', text: w.name },
    { name: 'description', text: w.description ?? '' },
    { name: 'sportType', text: 'bike' },
  ]
  if (w.tags.length > 0) children.push({ name: 'tags', children: w.tags.map((t) => ({ name: 'tag', attrs: [['name', t]] })) })
  children.push({ name: 'workout', children: w.segments.map((s) => blockNode(s, frac)) })
  return buildXml({ name: 'workout_file', children })
}

// --- import -----------------------------------------------------------------

function collectTags(el: XmlElement, tags: string[], warnings: string[]): void {
  for (const t of el.children) {
    if (t.name !== 'tag') {
      warnings.push(`Ignored <${t.rawName}> inside <tags>.`)
      continue
    }
    const name = normalizeText(t.attrs.get('name')?.value ?? t.text)
    if (name && !tags.some((x) => x.toLowerCase() === name.toLowerCase())) tags.push(name)
  }
}

function parseBlock(el: XmlElement, n: number, warnings: string[]): Segment | null {
  const where = `<${el.rawName}> (block ${n})`
  if (!BLOCKS.has(el.name)) {
    warnings.push(`Skipped unknown block ${where}.`)
    return null
  }
  const a = new Attrs(el, where, warnings)
  const seg = el.name === 'intervalst' ? intervalsBlock(a, where, warnings) : simpleBlock(el.name, a, where, warnings)
  if (!seg) return null
  const label = normalizeText(a.str('label'))
  if (label) seg.label = label
  if (a.bool('show_avg')) seg.showAverage = true
  const text = textEvents(el, where, warnings)
  if (text.length > 0) seg.text = text
  a.finish()
  return seg
}

function simpleBlock(name: string, a: Attrs, where: string, warnings: string[]): Segment | null {
  const durationS = a.num('duration')
  if (durationS === undefined || durationS <= 0) {
    warnings.push(`${where}: missing or invalid Duration; block skipped.`)
    return null
  }
  const cadence = a.cadence('cadence', 'cadencelow', 'cadencehigh')
  const extra = cadence ? { cadence } : {}
  switch (name) {
    case 'warmup':
    case 'ramp':
    case 'cooldown': {
      const low = a.num('powerlow')
      const high = a.num('powerhigh')
      const single = a.num('power')
      const start = low ?? single ?? high
      const end = high ?? single ?? low
      if (start === undefined || end === undefined) {
        warnings.push(`${where}: missing PowerLow/PowerHigh; block skipped.`)
        return null
      }
      const role = name === 'warmup' ? 'warmup' : name === 'cooldown' ? 'cooldown' : 'ramp'
      const [from, to] = role === 'cooldown' ? [Math.max(start, end), Math.min(start, end)] : [start, end]
      return { kind: 'ramp', role, durationS, from: ftp(from), to: ftp(to), ...extra }
    }
    case 'freeride': {
      const flatRoad = a.bool('flatroad')
      return { kind: 'freeride', durationS, ...(flatRoad === undefined ? {} : { flatRoad }), ...extra }
    }
    case 'maxeffort':
      return { kind: 'maxeffort', durationS, ...extra }
    default: {
      const power = a.target('power', 'powerlow', 'powerhigh')
      if (!power) {
        warnings.push(`${where}: missing Power; block skipped.`)
        return null
      }
      return { kind: 'steady', durationS, power, ...extra }
    }
  }
}

function intervalsBlock(a: Attrs, where: string, warnings: string[]): Segment | null {
  const repeatRaw = a.str('repeat')
  const repeat = parseNumber(repeatRaw)
  if (repeat === undefined) {
    if (repeatRaw) {
      warnings.push(`${where}: Repeat="${repeatRaw}" is not a number; block skipped.`)
      return null
    }
    warnings.push(`${where}: missing Repeat; assuming 1.`)
  } else if (!Number.isInteger(repeat) || repeat < 1 || repeat > ZWO_MAX_REPEAT) {
    warnings.push(`${where}: Repeat="${repeatRaw ?? ''}" must be a whole number from 1 to ${ZWO_MAX_REPEAT}; block skipped.`)
    return null
  }
  const onS = a.num('onduration')
  const offS = a.num('offduration')
  if (onS === undefined || offS === undefined || onS <= 0 || offS <= 0) {
    warnings.push(`${where}: missing or invalid OnDuration/OffDuration; block skipped.`)
    return null
  }
  const onPower = a.target('onpower', 'poweronlow', 'poweronhigh')
  const offPower = a.target('offpower', 'powerofflow', 'poweroffhigh')
  if (!onPower || !offPower) {
    warnings.push(`${where}: missing OnPower/OffPower; block skipped.`)
    return null
  }
  const part = (durationS: number, power: PowerTarget, cadence?: CadenceTarget, label?: string): IntervalPart => ({
    durationS,
    power,
    ...(cadence ? { cadence } : {}),
    ...(label ? { label } : {}),
  })
  return {
    kind: 'intervals',
    repeat: repeat ?? 1,
    on: part(onS, onPower, a.cadence('cadence', 'cadencelow', 'cadencehigh'), normalizeText(a.str('onlabel'))),
    off: part(
      offS,
      offPower,
      a.cadence('cadenceresting', 'cadencerestinglow', 'cadencerestinghigh'),
      normalizeText(a.str('offlabel')),
    ),
  }
}

function textEvents(el: XmlElement, where: string, warnings: string[]): TextEvent[] {
  const out: TextEvent[] = []
  for (const c of el.children) {
    const cw = `${where} <${c.rawName}>`
    if (c.name !== 'textevent') {
      warnings.push(`${where}: ignored <${c.rawName}>.`)
      continue
    }
    const a = new Attrs(c, cw, warnings)
    const offsetS = a.num('timeoffset')
    const message = normalizeText(a.str('message')) ?? normalizeText(a.str('mssage')) ?? normalizeText(c.text)
    const durationS = a.num('duration')
    a.finish()
    if (!message) {
      warnings.push(`${cw}: no message; skipped.`)
      continue
    }
    if (offsetS !== undefined && offsetS < 0) {
      warnings.push(`${cw}: negative timeoffset; skipped.`)
      continue
    }
    if (offsetS === undefined) warnings.push(`${cw}: missing timeoffset; showing it at the start of the block.`)
    const ev: TextEvent = { offsetS: offsetS ?? 0, message }
    if (durationS !== undefined && durationS > 0) ev.durationS = durationS
    out.push(ev)
  }
  return out
}

/** Reads attributes by lower-cased name and reports the ones nobody asked for. */
class Attrs {
  private readonly used = new Set<string>(SILENTLY_IGNORED)

  constructor(
    private readonly el: XmlElement,
    private readonly where: string,
    private readonly warnings: string[],
  ) {}

  str(key: string): string | undefined {
    this.used.add(key)
    return this.el.attrs.get(key)?.value
  }

  num(key: string): number | undefined {
    const raw = this.str(key)
    if (raw === undefined || raw === '') return undefined
    const n = parseNumber(raw)
    if (n === undefined) this.warn(key, raw, 'is not a number')
    return n
  }

  bool(key: string): boolean | undefined {
    const raw = this.str(key)
    if (raw === undefined || raw === '') return undefined
    const v = raw.toLowerCase()
    if (v === '1' || v === 'true') return true
    if (v === '0' || v === 'false') return false
    this.warn(key, raw, 'is not 0 or 1')
    return undefined
  }

  /** A steady target from `single` or a `low`/`high` range (midpoint unless `single` is given). */
  target(single: string, lowKey: string, highKey: string): PowerTarget | undefined {
    const p = this.num(single)
    const l = this.num(lowKey)
    const h = this.num(highKey)
    if (l !== undefined && h !== undefined && l !== h) {
      const low = Math.min(l, h)
      const high = Math.max(l, h)
      return { unit: 'ftp', value: p ?? (low + high) / 2, low, high }
    }
    const v = p ?? l ?? h
    return v === undefined ? undefined : ftp(v)
  }

  cadence(single: string, lowKey: string, highKey: string): CadenceTarget | undefined {
    const out: CadenceTarget = {}
    for (const [key, field] of [
      [single, 'rpm'],
      [lowKey, 'low'],
      [highKey, 'high'],
    ] as const) {
      const v = this.num(key)
      if (v === undefined) continue
      if (v > 0) out[field] = v
      else this.warn(key, String(v), 'is not a cadence')
    }
    return out.rpm === undefined && out.low === undefined && out.high === undefined ? undefined : out
  }

  finish(): void {
    for (const [key, attr] of this.el.attrs) {
      if (!this.used.has(key)) this.warnings.push(`${this.where}: ignored unknown attribute ${attr.name}.`)
    }
  }

  private warn(key: string, raw: string, why: string): void {
    this.warnings.push(`${this.where}: ${this.el.attrs.get(key)?.name ?? key}="${raw}" ${why}; ignored.`)
  }
}

function ftp(value: number): PowerTarget {
  return { unit: 'ftp', value }
}

// --- export -----------------------------------------------------------------

type Frac = (value: number, unit: PowerTarget['unit']) => number

function blockNode(seg: Segment, frac: Frac): XmlNode {
  const attrs: [string, string][] = []
  let name: string
  switch (seg.kind) {
    case 'steady':
      name = 'SteadyState'
      attrs.push(['Duration', secs(seg.durationS)], ...powerAttrs(seg.power, 'Power', 'PowerLow', 'PowerHigh', frac))
      break
    case 'ramp': {
      const from = frac(seg.from.value, seg.from.unit)
      const to = frac(seg.to.value, seg.to.unit)
      name = seg.role === 'warmup' ? 'Warmup' : seg.role === 'cooldown' && from >= to ? 'Cooldown' : 'Ramp'
      attrs.push(['Duration', secs(seg.durationS)], ['PowerLow', fraction(from)], ['PowerHigh', fraction(to)])
      break
    }
    case 'intervals':
      name = 'IntervalsT'
      attrs.push(
        ['Repeat', String(seg.repeat)],
        ['OnDuration', secs(seg.on.durationS)],
        ['OffDuration', secs(seg.off.durationS)],
        ...powerAttrs(seg.on.power, 'OnPower', 'PowerOnLow', 'PowerOnHigh', frac),
        ...powerAttrs(seg.off.power, 'OffPower', 'PowerOffLow', 'PowerOffHigh', frac),
        ...cadenceAttrs(usable(seg.on.cadence) ?? seg.cadence, 'Cadence', 'CadenceLow', 'CadenceHigh'),
        ...cadenceAttrs(usable(seg.off.cadence) ?? seg.cadence, 'CadenceResting', 'CadenceRestingLow', 'CadenceRestingHigh'),
      )
      break
    case 'freeride':
      name = 'FreeRide'
      attrs.push(['Duration', secs(seg.durationS)], ['FlatRoad', seg.flatRoad === false ? '0' : '1'])
      break
    case 'maxeffort':
      name = 'MaxEffort'
      attrs.push(['Duration', secs(seg.durationS)])
      break
  }
  if (seg.kind !== 'intervals') attrs.push(...cadenceAttrs(seg.cadence, 'Cadence', 'CadenceLow', 'CadenceHigh'))
  if (seg.showAverage) attrs.push(['show_avg', '1'])
  const label = normalizeText(seg.label)
  if (label) attrs.push(['Label', label])
  if (seg.kind === 'intervals') {
    const on = normalizeText(seg.on.label)
    const off = normalizeText(seg.off.label)
    if (on) attrs.push(['OnLabel', on])
    if (off) attrs.push(['OffLabel', off])
  }
  return { name, attrs, children: textNodes(seg.text) }
}

function powerAttrs(p: PowerTarget, single: string, lowKey: string, highKey: string, frac: Frac): [string, string][] {
  const { low, high } = p
  if (low === undefined || high === undefined || !Number.isFinite(low) || !Number.isFinite(high) || low >= high) {
    return [[single, fraction(frac(p.value, p.unit))]]
  }
  const out: [string, string][] = []
  const mid = (low + high) / 2
  if (Math.abs(p.value - mid) > 1e-9 * Math.max(1, Math.abs(mid))) out.push([single, fraction(frac(p.value, p.unit))])
  out.push([lowKey, fraction(frac(low, p.unit))], [highKey, fraction(frac(high, p.unit))])
  return out
}

function cadenceAttrs(c: CadenceTarget | undefined, single: string, lowKey: string, highKey: string): [string, string][] {
  const out: [string, string][] = []
  if (!c) return out
  if (isPositive(c.rpm)) out.push([single, formatNumber(c.rpm, 2)])
  if (isPositive(c.low)) out.push([lowKey, formatNumber(c.low, 2)])
  if (isPositive(c.high)) out.push([highKey, formatNumber(c.high, 2)])
  return out
}

/** The cadence compile would use: undefined when nothing in it is valid. */
function usable(c: CadenceTarget | undefined): CadenceTarget | undefined {
  return c && (isPositive(c.rpm) || isPositive(c.low) || isPositive(c.high)) ? c : undefined
}

function textNodes(events: TextEvent[] | undefined): XmlNode[] {
  const out: XmlNode[] = []
  for (const e of events ?? []) {
    const message = normalizeText(e.message)
    if (!message || !Number.isFinite(e.offsetS)) continue
    const attrs: [string, string][] = [
      ['timeoffset', String(Math.round(e.offsetS))],
      ['message', message],
    ]
    if (isPositive(e.durationS)) attrs.push(['duration', String(Math.max(1, Math.round(e.durationS)))])
    out.push({ name: 'textevent', attrs })
  }
  return out
}

function secs(s: number): string {
  return String(Math.round(s))
}

function fraction(f: number): string {
  return formatNumber(f, 6)
}

function isPositive(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}
