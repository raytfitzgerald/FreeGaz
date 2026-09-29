// ERG / MRC: the CompuTrainer-era text formats many trainer apps still read.
//
//   [COURSE HEADER]
//   VERSION = 2
//   UNITS = ENGLISH
//   DESCRIPTION = Sweet spot builder
//   FILE NAME = sweetspot.mrc
//   FTP = 250                ERG only, optional
//   MINUTES PERCENT          MRC; an ERG file says MINUTES WATTS
//   [END COURSE HEADER]
//   [COURSE DATA]
//   0.00	50                each row is a point (minutes, value); consecutive
//   5.00	50                points form a segment: same value = steady,
//   5.00	75                different values = ramp, same time = a jump
//   10.00	75
//   [END COURSE DATA]
//   [COURSE TEXT]
//   30	Settle in	10        seconds from the start, message, display seconds
//   [END COURSE TEXT]
//
// Import rounds point times to whole seconds, since two-decimal minutes can't
// say "20 s" exactly. Ramps get role 'ramp'. ERG watts stay absolute unless
// opts.ftpW is given, in which case they become FTP fractions. The header's
// own FTP is only reported (header.ftpW), never applied.
//
// Export is lossy by nature: intervals are flattened, cadence and labels
// dropped, and ERG-off steps become steady targets (free ride at
// ERG_FREERIDE_FTP, max effort at ERG_MAXEFFORT_FTP), noted in DESCRIPTION.
// Lines end with CRLF, as the Windows tools that defined the format expect.

import { compileWorkout, type TimelineStep } from '../compile'
import { contentId, slugify } from '../ids'
import { normalizeText } from '../labels'
import type { PowerTarget, Segment, Workout, WorkoutSource } from '../model'
import { formatNumber, parseNumber } from '../numbers'
import { WorkoutFormatError } from './errors'

export const ERG_FREERIDE_FTP = 0.5
export const ERG_MAXEFFORT_FTP = 1.2

export interface ErgMrcParseOptions {
  /** Convert ERG watts into FTP fractions using this FTP. */
  ftpW?: number
  source?: WorkoutSource
  /** Id factory; defaults to a content hash (`mrc:<fnv1a>` / `erg:<fnv1a>`). */
  newId?: () => string
}

export interface ErgMrcHeader {
  version?: string
  units?: string
  description?: string
  fileName?: string
  /** FTP= from an ERG header: the FTP the file's watts were written for. */
  ftpW?: number
  /** What the data column holds (MINUTES PERCENT / MINUTES WATTS). */
  data: 'percent' | 'watts'
}

export interface ErgMrcParseResult {
  workout: Workout
  warnings: string[]
  header: ErgMrcHeader
}

export function parseErgMrc(text: string, opts?: ErgMrcParseOptions): Workout {
  return parseErgMrcWithWarnings(text, opts).workout
}

type Section = 'none' | 'header' | 'data' | 'text' | 'other'

interface Point {
  minutes: number
  value: number
  line: number
}

interface Cue {
  atS: number
  message: string
  durationS?: number
  line: number
}

export function parseErgMrcWithWarnings(text: string, opts: ErgMrcParseOptions = {}): ErgMrcParseResult {
  const warnings: string[] = []
  const header: Omit<ErgMrcHeader, 'data'> = {}
  let data: ErgMrcHeader['data'] | undefined
  const points: Point[] = []
  const cues: Cue[] = []
  let section: Section = 'none'

  text
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\r|\n/)
    .forEach((raw, i) => {
      const line = i + 1
      const t = raw.trim()
      if (t === '' || t.startsWith(';') || t.startsWith('//')) return
      const bracket = /^\[\s*(.+?)\s*\]$/.exec(t)
      if (bracket) {
        section = sectionFor((bracket[1] ?? '').toUpperCase().replace(/\s+/g, ' '))
        if (section === 'other') warnings.push(`Line ${line}: ignored unknown section ${t}.`)
        return
      }
      const units = /^MINUTES\s+(\S+)/i.exec(t)
      if (units && section !== 'data' && section !== 'text') {
        const u = (units[1] ?? '').toUpperCase()
        if (u.startsWith('PERCENT') || u === 'FTP' || u === '%') data = 'percent'
        else if (u.startsWith('WATT')) data = 'watts'
        else warnings.push(`Line ${line}: unknown units "${units[1] ?? ''}".`)
        return
      }
      switch (section) {
        case 'header':
          readHeaderLine(t, line, header, warnings)
          break
        case 'data': {
          const [a, b] = t.split(/[\s,;]+/)
          const minutes = parseNumber(a)
          const value = parseNumber(b)
          const last = points.at(-1)
          if (minutes === undefined || value === undefined) warnings.push(`Line ${line}: unreadable data row "${t}"; skipped.`)
          else if (last && minutes < last.minutes) warnings.push(`Line ${line}: time goes backwards; point skipped.`)
          else points.push({ minutes, value, line })
          break
        }
        case 'text': {
          const cue = readCue(raw, t, line)
          if (cue) cues.push(cue)
          else warnings.push(`Line ${line}: unreadable text row "${t}"; skipped.`)
          break
        }
        case 'none':
          warnings.push(`Line ${line}: ignored text outside any section.`)
          break
        case 'other':
          break
      }
    })

  if (points.length < 2) throw new WorkoutFormatError('No [COURSE DATA]: an ERG/MRC file needs at least two data points.')
  if (data === undefined) {
    data = header.ftpW !== undefined || points.some((p) => p.value > 250) ? 'watts' : 'percent'
    warnings.push(`No "MINUTES PERCENT" or "MINUTES WATTS" line; assuming ${data}.`)
  }
  const unit = data
  const target = (v: number): PowerTarget => {
    if (unit === 'percent') return { unit: 'ftp', value: v / 100 }
    return opts.ftpW !== undefined && opts.ftpW > 0 ? { unit: 'ftp', value: v / opts.ftpW } : { unit: 'watts', value: v }
  }

  const segments: Segment[] = []
  const starts: number[] = []
  const first = points[0] as Point
  const originS = Math.round(first.minutes * 60)
  if (originS !== 0) warnings.push(`The data starts at ${formatNumber(first.minutes, 2)} min; treating that as the start.`)
  let prev = first
  let prevS = originS
  for (const p of points.slice(1)) {
    const s = Math.round(p.minutes * 60)
    if (s > prevS) {
      starts.push(prevS - originS)
      segments.push(
        prev.value === p.value
          ? { kind: 'steady', durationS: s - prevS, power: target(prev.value) }
          : { kind: 'ramp', role: 'ramp', durationS: s - prevS, from: target(prev.value), to: target(p.value) },
      )
    }
    prev = p
    prevS = s
  }

  for (const c of cues) {
    const t = c.atS - originS
    const j = starts.findIndex((st, k) => t >= st && t < st + segmentSeconds(segments[k]))
    const seg = segments[j]
    const start = starts[j]
    if (!seg || start === undefined) {
      warnings.push(`Line ${c.line}: text at ${c.atS} s is outside the workout; skipped.`)
      continue
    }
    seg.text = [...(seg.text ?? []), { offsetS: t - start, message: c.message, ...(c.durationS ? { durationS: c.durationS } : {}) }]
  }

  const workout: Workout = {
    id: opts.newId?.() ?? contentId(unit === 'watts' ? 'erg' : 'mrc', text),
    name: nameFromFile(header.fileName) ?? 'Imported workout',
    tags: [],
    sportType: 'bike',
    segments,
    source: opts.source ?? 'import',
  }
  if (header.description) workout.description = header.description
  return { workout, warnings, header: { ...header, data: unit } }
}

export interface MrcExportOptions {
  /** Needed to convert absolute-watt targets into percentages. */
  ftpW?: number
}

/** MRC (percent of FTP). */
export function toMrc(w: Workout, opts: MrcExportOptions = {}): string {
  return exportCourse(w, 'percent', opts.ftpW)
}

/** ERG (absolute watts at `ftpW`). */
export function toErg(w: Workout, ftpW: number): string {
  if (!Number.isFinite(ftpW) || ftpW <= 0) throw new RangeError('toErg needs a positive ftpW')
  return exportCourse(w, 'watts', ftpW)
}

// ---------------------------------------------------------------------------

function sectionFor(name: string): Section {
  switch (name) {
    case 'COURSE HEADER':
      return 'header'
    case 'COURSE DATA':
      return 'data'
    case 'COURSE TEXT':
      return 'text'
    case 'END COURSE HEADER':
    case 'END COURSE DATA':
    case 'END COURSE TEXT':
      return 'none'
    default:
      return 'other'
  }
}

function readHeaderLine(t: string, line: number, header: Omit<ErgMrcHeader, 'data'>, warnings: string[]): void {
  const kv = /^([^=]+?)\s*=\s*(.*)$/.exec(t)
  if (!kv) {
    warnings.push(`Line ${line}: ignored header line "${t}".`)
    return
  }
  const key = (kv[1] ?? '').toUpperCase().replace(/\s+/g, ' ')
  const value = (kv[2] ?? '').trim()
  switch (key) {
    case 'VERSION':
      header.version = value
      break
    case 'UNITS':
      header.units = value
      break
    case 'DESCRIPTION':
      if (value) header.description = value
      break
    case 'FILE NAME':
    case 'FILENAME':
      if (value) header.fileName = value
      break
    case 'FTP': {
      const ftp = parseNumber(value)
      if (ftp !== undefined && ftp > 0) header.ftpW = ftp
      else warnings.push(`Line ${line}: FTP "${value}" is not a positive number.`)
      break
    }
    default:
      warnings.push(`Line ${line}: ignored header field ${kv[1] ?? ''}.`)
  }
}

/** "seconds<TAB>message<TAB>display seconds"; falls back to spaces when there are no tabs. */
function readCue(raw: string, t: string, line: number): Cue | null {
  const cols = raw.split('\t').map((c) => c.trim())
  let atS: number | undefined
  let message: string | undefined
  let durationS: number | undefined
  if (cols.length >= 2) {
    atS = parseNumber(cols[0])
    const last = cols.length >= 3 ? parseNumber(cols[cols.length - 1]) : undefined
    durationS = last
    message = normalizeText((last === undefined ? cols.slice(1) : cols.slice(1, -1)).join(' '))
  } else {
    const m = /^(\d+(?:\.\d+)?)\s+(.*?)(?:\s+(\d+(?:\.\d+)?))?$/.exec(t)
    atS = parseNumber(m?.[1])
    message = normalizeText(m?.[2])
    durationS = parseNumber(m?.[3])
  }
  if (atS === undefined || atS < 0 || !message) return null
  return { atS: Math.round(atS), message, ...(durationS !== undefined && durationS > 0 ? { durationS } : {}), line }
}

function segmentSeconds(seg: Segment | undefined): number {
  if (!seg) return 0
  return seg.kind === 'intervals' ? seg.repeat * (seg.on.durationS + seg.off.durationS) : seg.durationS
}

function nameFromFile(fileName: string | undefined): string | undefined {
  if (!fileName) return undefined
  const base = fileName.split(/[/\\]/).pop() ?? fileName
  return normalizeText(base.replace(/\.(erg|mrc)$/i, ''))
}

function exportCourse(w: Workout, data: 'percent' | 'watts', ftpW: number | undefined): string {
  const tl = compileWorkout(w)
  const needFtp = (): number => {
    if (ftpW === undefined || !Number.isFinite(ftpW) || ftpW <= 0) {
      throw new Error('toMrc needs opts.ftpW to convert absolute-watt targets into percentages.')
    }
    return ftpW
  }
  const value = (p: PowerTarget): number => {
    if (data === 'percent') return p.unit === 'ftp' ? p.value * 100 : (p.value / needFtp()) * 100
    return p.unit === 'watts' ? p.value : p.value * needFtp()
  }
  const ergOff = (fraction: number): number => (data === 'percent' ? fraction * 100 : fraction * needFtp())
  const lossy = new Set<string>()
  const endpoints = (s: TimelineStep): [number, number] => {
    if (s.kind === 'freeride') {
      lossy.add(`free rides as steady ${formatNumber(ERG_FREERIDE_FTP * 100, 0)} % FTP`)
      return [ergOff(ERG_FREERIDE_FTP), ergOff(ERG_FREERIDE_FTP)]
    }
    if (s.kind === 'maxeffort') {
      lossy.add(`max efforts as steady ${formatNumber(ERG_MAXEFFORT_FTP * 100, 0)} % FTP`)
      return [ergOff(ERG_MAXEFFORT_FTP), ergOff(ERG_MAXEFFORT_FTP)]
    }
    if (!s.from || !s.to) return [0, 0]
    const a = value(s.from)
    return [a, s.kind === 'ramp' ? value(s.to) : a]
  }
  const fmtValue = (v: number): string => formatNumber(v, data === 'percent' ? 2 : 0)
  const minutes = (s: number): string => (s / 60).toFixed(2)

  const rows: string[] = []
  for (const s of tl.steps) {
    const [a, b] = endpoints(s)
    rows.push(`${minutes(s.startS)}\t${fmtValue(a)}`, `${minutes(s.endS)}\t${fmtValue(b)}`)
  }
  const note = lossy.size > 0 ? `Exported ${[...lossy].join(' and ')}.` : undefined
  const description = [normalizeText(w.description), note].filter((x) => x !== undefined).join(' ')
  const ext = data === 'percent' ? 'mrc' : 'erg'
  const lines = [
    '[COURSE HEADER]',
    'VERSION = 2',
    'UNITS = ENGLISH',
    `DESCRIPTION = ${description || normalizeText(w.name) || ''}`,
    `FILE NAME = ${slugify(w.name) || 'workout'}.${ext}`,
    ...(data === 'watts' ? [`FTP = ${formatNumber(needFtp(), 0)}`] : []),
    data === 'percent' ? 'MINUTES PERCENT' : 'MINUTES WATTS',
    '[END COURSE HEADER]',
    '[COURSE DATA]',
    ...rows,
    '[END COURSE DATA]',
  ]
  if (tl.texts.length > 0) {
    lines.push('[COURSE TEXT]')
    for (const x of tl.texts) lines.push(`${Math.round(x.atS)}\t${x.message.replace(/\t/g, ' ')}\t${Math.round(x.durationS)}`)
    lines.push('[END COURSE TEXT]')
  }
  return `${lines.join('\r\n')}\r\n`
}
