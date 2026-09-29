// Canvas geometry for the builder, kept pure so the pointer math is tested:
// segments → drawable pieces in (seconds, fraction of FTP) space, the scale
// that maps them to pixels, hit testing for blocks and their drag handles,
// and the gap a dragged block would drop into. Canvas.tsx only draws.
import { resolvePower } from '@core/workout/compile'
import { segmentDurationS, type PowerField } from '@core/workout/edit'
import type { PowerTarget, Workout } from '@core/workout/model'
import { FREERIDE_ESTIMATE_FTP, MAXEFFORT_ESTIMATE_FTP } from '@core/workout/stats'

export const PAD = { top: 18, right: 14, bottom: 24, left: 46 } as const
/** The time axis never spans less than this, so a short workout doesn't fill the canvas. */
export const MIN_SPAN_S = 30 * 60
/** Free room after the last block, so it can be dragged longer. */
export const SPAN_HEADROOM = 1.1
/** The power axis always reaches 160 % FTP, so every palette block fits with room to drag. */
export const MIN_TOP_FRAC = 1.6
export const TOP_HEADROOM = 1.15
/** Free rides and max efforts have no target: draw them at the power the stats assume. */
export const FREE_FRAC = FREERIDE_ESTIMATE_FTP
export const MAX_FRAC = MAXEFFORT_ESTIMATE_FTP
/** How close (px) the pointer must be to an edge to grab it. */
export const GRAB_PX = 6

export type PieceKind = 'steady' | 'ramp' | 'on' | 'off' | 'freeride' | 'maxeffort'

/** One drawn shape: a block, a ramp, or one half of an interval rep. */
export interface Piece {
  segmentIndex: number
  kind: PieceKind
  /** Rep number (0-based) for interval halves. */
  rep?: number
  startS: number
  endS: number
  /** Height at the start and end, as a fraction of FTP (equal unless a ramp). */
  from: number
  to: number
}

export interface SegmentBox {
  index: number
  startS: number
  endS: number
  /** Tallest point, as a fraction of FTP. */
  top: number
  pieces: Piece[]
}

export interface Scale {
  /** Seconds across the plot width. */
  spanS: number
  /** Fraction of FTP at the top of the plot. */
  topFrac: number
}

export interface Frame {
  width: number
  height: number
  scale: Scale
}

/** What the pointer is over: a block's body, or one of its drag handles. */
export type Grab =
  | { kind: 'body' }
  /** Right edge of a steady block, ramp, free ride or max effort. */
  | { kind: 'duration' }
  /** Top edge: steady power, ramp start/end, interval on/off power. */
  | { kind: 'power'; field: PowerField }
  /** Right edge of one half of an interval rep. */
  | { kind: 'part'; part: 'on' | 'off'; rep: number }

export interface Hit {
  index: number
  grab: Grab
  piece: Piece | null
}

const positive = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0)

/** Target as a fraction of FTP (absolute watts through the rider's FTP). */
export function fracOf(p: PowerTarget, ftpW: number): number {
  const f = resolvePower(p, ftpW) / ftpW
  return Number.isFinite(f) ? Math.max(0, f) : 0
}

export function layoutSegments(w: Workout, ftpW: number): SegmentBox[] {
  const boxes: SegmentBox[] = []
  let t = 0
  w.segments.forEach((seg, index) => {
    const startS = t
    const pieces: Piece[] = []
    const add = (kind: PieceKind, durationS: number, from: number, to: number, rep?: number) => {
      const d = positive(durationS)
      if (d === 0) return
      pieces.push({ segmentIndex: index, kind, ...(rep === undefined ? {} : { rep }), startS: t, endS: t + d, from, to })
      t += d
    }
    switch (seg.kind) {
      case 'steady': {
        const f = fracOf(seg.power, ftpW)
        add('steady', seg.durationS, f, f)
        break
      }
      case 'ramp':
        add('ramp', seg.durationS, fracOf(seg.from, ftpW), fracOf(seg.to, ftpW))
        break
      case 'intervals': {
        const on = fracOf(seg.on.power, ftpW)
        const off = fracOf(seg.off.power, ftpW)
        const reps = Number.isFinite(seg.repeat) ? Math.max(0, Math.floor(seg.repeat)) : 0
        for (let r = 0; r < reps; r++) {
          add('on', seg.on.durationS, on, on, r)
          add('off', seg.off.durationS, off, off, r)
        }
        break
      }
      case 'freeride':
        add('freeride', seg.durationS, FREE_FRAC, FREE_FRAC)
        break
      case 'maxeffort':
        add('maxeffort', seg.durationS, MAX_FRAC, MAX_FRAC)
        break
    }
    t = startS + positive(segmentDurationS(seg))
    boxes.push({ index, startS, endS: t, top: pieces.reduce((m, p) => Math.max(m, p.from, p.to), 0), pieces })
  })
  return boxes
}

const totalOf = (boxes: SegmentBox[]) => boxes.at(-1)?.endS ?? 0
const topOf = (boxes: SegmentBox[]) => boxes.reduce((m, b) => Math.max(m, b.top), 0)

/** The resting scale: the whole workout plus headroom, never smaller than the minimum span. */
export function autoScale(boxes: SegmentBox[]): Scale {
  return { spanS: Math.max(MIN_SPAN_S, totalOf(boxes) * SPAN_HEADROOM), topFrac: Math.max(MIN_TOP_FRAC, topOf(boxes) * TOP_HEADROOM) }
}

/**
 * The scale while dragging: the one frozen at pointer-down (so the edge stays
 * under the pointer), grown only as far as needed to keep the preview in view.
 */
export function dragScale(frozen: Scale, boxes: SegmentBox[]): Scale {
  return { spanS: Math.max(frozen.spanS, totalOf(boxes)), topFrac: Math.max(frozen.topFrac, topOf(boxes) * 1.02) }
}

export const innerWidth = (f: Frame) => Math.max(1, f.width - PAD.left - PAD.right)
export const baseY = (f: Frame) => f.height - PAD.bottom
const innerHeight = (f: Frame) => Math.max(1, baseY(f) - PAD.top)

export const xAt = (f: Frame, s: number) => PAD.left + (s / f.scale.spanS) * innerWidth(f)
export const yAt = (f: Frame, frac: number) => baseY(f) - (frac / f.scale.topFrac) * innerHeight(f)
export const timeAtX = (f: Frame, px: number) => ((px - PAD.left) / innerWidth(f)) * f.scale.spanS
export const fracAtY = (f: Frame, py: number) => ((baseY(f) - py) / innerHeight(f)) * f.scale.topFrac

/** Height of a piece at time `s` (ramps interpolate). */
export function heightAt(p: Piece, s: number): number {
  const d = p.endS - p.startS
  if (d <= 0 || p.from === p.to) return p.from
  const k = Math.min(1, Math.max(0, (s - p.startS) / d))
  return p.from + (p.to - p.from) * k
}

/** The power field a piece's top edge controls at time `s`; null for free rides and max efforts. */
export function powerFieldAt(p: Piece, s: number): PowerField | null {
  switch (p.kind) {
    case 'steady':
      return 'power'
    case 'ramp':
      return s < (p.startS + p.endS) / 2 ? 'from' : 'to'
    case 'on':
    case 'off':
      return p.kind
    default:
      return null
  }
}

/**
 * The block (and handle) under the pointer. Right edges win over bodies, and
 * the column above a low block still selects it. Each side of an edge reaches
 * at most a third into the piece on that side, so narrow blocks keep a
 * grabbable body.
 */
export function hitTest(f: Frame, boxes: SegmentBox[], px: number, py: number): Hit | null {
  const base = baseY(f)
  if (py < 0 || py > base + GRAB_PX || px < PAD.left - GRAB_PX || px > f.width) return null
  const reach = (p: Piece | undefined) => (p ? Math.min(GRAB_PX, (xAt(f, p.endS) - xAt(f, p.startS)) / 3) : GRAB_PX)
  const pieces = boxes.flatMap((b) => b.pieces)
  let edge: Hit | null = null
  let best = Infinity
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k] as Piece
    const dx = px - xAt(f, p.endS)
    const tol = dx < 0 ? reach(p) : reach(pieces[k + 1])
    if (Math.abs(dx) > tol || Math.abs(dx) >= best || py < yAt(f, p.to) - GRAB_PX) continue
    best = Math.abs(dx)
    const grab: Grab = p.kind === 'on' || p.kind === 'off' ? { kind: 'part', part: p.kind, rep: p.rep ?? 0 } : { kind: 'duration' }
    edge = { index: p.segmentIndex, grab, piece: p }
  }
  if (edge) return edge
  const s = timeAtX(f, px)
  const box = boxes.find((b) => s >= b.startS && s < b.endS)
  if (!box) return null
  const piece = box.pieces.find((p) => s >= p.startS && s < p.endS) ?? null
  const field = piece ? powerFieldAt(piece, s) : null
  if (piece && field && Math.abs(py - yAt(f, heightAt(piece, s))) <= GRAB_PX) return { index: box.index, grab: { kind: 'power', field }, piece }
  return { index: box.index, grab: { kind: 'body' }, piece }
}

/** The gap (0..n) a dragged block drops into: before the first block whose middle is right of `s`. */
export function dropGap(boxes: SegmentBox[], s: number): number {
  let g = 0
  for (const b of boxes) if ((b.startS + b.endS) / 2 < s) g++
  return g
}

/** Time of a gap: the start of the block after it, or the end of the workout. */
export function gapTimeS(boxes: SegmentBox[], gap: number): number {
  return boxes[gap]?.startS ?? totalOf(boxes)
}

/** About six evenly spaced time ticks across `spanS`. */
export function timeTicks(spanS: number): number[] {
  if (!(spanS > 0)) return []
  const steps = [60, 120, 300, 600, 900, 1200, 1800, 3600, 7200]
  const step = steps.find((s) => spanS / s <= 8) ?? 7200
  const out: number[] = []
  for (let t = 0; t <= spanS; t += step) out.push(t)
  return out
}

/** Power gridlines (fractions of FTP) that fit under the top of the axis. */
export function powerTicks(topFrac: number): number[] {
  const out: number[] = []
  for (let f = 0.5; f < topFrac - 0.05; f += 0.5) out.push(Math.round(f * 100) / 100)
  return out
}
