// Pieces → SVG paths, shared by the canvas and the palette glyphs. Ramps are
// split at zone boundaries so every path is one solid zone colour.
import { POWER_ZONE_EDGES, zoneIndexForFraction } from '../../ui/zones'
import type { Piece } from './layout'

/** A zone index (0 = Z1), or the two ERG-off looks. */
export type ShapeFill = number | 'free' | 'max'

export interface Shape {
  d: string
  fill: ShapeFill
}

type Map1 = (v: number) => number

/**
 * Paths for one piece: `x` maps seconds, `y` maps fractions of FTP, `base` is
 * the zero line. `inset` trims each side so neighbours read as separate.
 */
export function pieceShapes(p: Piece, x: Map1, y: Map1, base: number, inset = 1, radius = 3): Shape[] {
  const x0 = x(p.startS) + inset
  const x1 = Math.max(x0 + 0.5, x(p.endS) - inset)
  if (p.kind === 'freeride' || p.kind === 'maxeffort') return [{ d: roundedTop(x0, x1, y(p.from), base, radius), fill: p.kind === 'freeride' ? 'free' : 'max' }]
  if (p.from === p.to) return [{ d: roundedTop(x0, x1, y(p.from), base, radius), fill: zoneIndexForFraction(p.from) }]
  const cuts = [0, 1]
  for (const e of POWER_ZONE_EDGES) {
    if (!Number.isFinite(e)) continue
    const t = (e - p.from) / (p.to - p.from)
    if (t > 0 && t < 1) cuts.push(t)
  }
  cuts.sort((a, b) => a - b)
  const out: Shape[] = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const t0 = cuts[i] as number
    const t1 = cuts[i + 1] as number
    const f0 = p.from + (p.to - p.from) * t0
    const f1 = p.from + (p.to - p.from) * t1
    const px0 = x0 + (x1 - x0) * t0
    const px1 = x0 + (x1 - x0) * t1
    out.push({ d: `M${px0},${base} L${px0},${y(f0)} L${px1},${y(f1)} L${px1},${base} Z`, fill: zoneIndexForFraction((f0 + f1) / 2) })
  }
  return out
}

function roundedTop(x0: number, x1: number, top: number, base: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, (x1 - x0) / 2, base - top))
  return `M${x0},${base} L${x0},${top + r} Q${x0},${top} ${x0 + r},${top} L${x1 - r},${top} Q${x1},${top} ${x1},${top + r} L${x1},${base} Z`
}
