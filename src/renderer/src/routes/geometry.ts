// Geometry for route drawings: elevation profiles over ride coordinates
// (laps unwrapped: x = lap × length + position) and the tile-free outline
// map. Pure, so it is tested without a DOM.
import { gradeIntegral, sampleAt } from '@core/routes/lookup'
import type { ProfilePoint, RouteBounds } from '@core/routes/model'
import { gradeClass } from './grade'

/** The position within its lap of ride coordinate `x`; a lap's end reads as its end, not the next start. */
export function inLap(x: number, lengthM: number): number {
  if (!(lengthM > 0) || !(x > 0)) return 0
  const d = x - Math.floor(x / lengthM) * lengthM
  return d === 0 ? lengthM : d
}

/** Mean grade over ride coordinates [a, b], %, splitting at lap boundaries. */
export function meanGrade(profile: readonly ProfilePoint[], lengthM: number, a: number, b: number): number {
  if (!(b > a) || !(lengthM > 0)) return sampleAt(profile, inLap(a, lengthM)).gradePct
  let area = 0
  let x = a
  for (let guard = 0; x < b - 1e-9 && guard < 10_000; guard++) {
    // Nudged up so a point on a lap line (after float rounding) starts the next lap and the loop always advances.
    const lap = Math.floor(x / lengthM + 1e-9)
    const to = Math.min(b, (lap + 1) * lengthM)
    area += gradeIntegral(profile, x - lap * lengthM, to - lap * lengthM)
    x = to
  }
  return area / (b - a)
}

/** n bins over [fromX, toX]: n + 1 edges with their elevation, and each bin's mean grade. */
export interface CourseSamples {
  x: Float64Array
  ele: Float64Array
  grade: Float64Array
}

export function courseSamples(profile: readonly ProfilePoint[], lengthM: number, fromX: number, toX: number, bins: number): CourseSamples {
  const n = Math.max(1, Math.floor(bins))
  const x = new Float64Array(n + 1)
  const ele = new Float64Array(n + 1)
  const grade = new Float64Array(n)
  for (let i = 0; i <= n; i++) {
    x[i] = fromX + ((toX - fromX) * i) / n
    ele[i] = sampleAt(profile, inLap(x[i]!, lengthM)).ele
  }
  for (let i = 0; i < n; i++) grade[i] = meanGrade(profile, lengthM, x[i]!, x[i + 1]!)
  return { x, ele, grade }
}

/** A run of consecutive bins [from, to) in one grade class. */
export interface GradeRun {
  from: number
  to: number
  cls: number
}

export function gradeRuns(grade: ArrayLike<number>): GradeRun[] {
  const runs: GradeRun[] = []
  for (let i = 0; i < grade.length; i++) {
    const cls = gradeClass(grade[i]!)
    const last = runs[runs.length - 1]
    if (last && last.cls === cls) last.to = i + 1
    else runs.push({ from: i, to: i + 1, cls })
  }
  return runs
}

export type Scale = (v: number) => number

/** The filled area under bins [run.from, run.to) down to `baseY`. */
export function areaPath(s: CourseSamples, run: GradeRun, sx: Scale, sy: Scale, baseY: number): string {
  let d = `M${f(sx(s.x[run.from]!))},${f(baseY)}`
  for (let i = run.from; i <= run.to; i++) d += `L${f(sx(s.x[i]!))},${f(sy(s.ele[i]!))}`
  return `${d}L${f(sx(s.x[run.to]!))},${f(baseY)}Z`
}

/** The elevation line through every edge. */
export function linePath(s: CourseSamples, sx: Scale, sy: Scale): string {
  let d = ''
  for (let i = 0; i < s.x.length; i++) d += `${i === 0 ? 'M' : 'L'}${f(sx(s.x[i]!))},${f(sy(s.ele[i]!))}`
  return d
}

/** Elevation axis range: the data padded by 10 %, and at least `minSpanM` tall so a flat road isn't drawn as mountains. */
export function elevationRange(ele: ArrayLike<number>, minSpanM = 30): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < ele.length; i++) {
    lo = Math.min(lo, ele[i]!)
    hi = Math.max(hi, ele[i]!)
  }
  if (!Number.isFinite(lo)) return [0, minSpanM]
  const pad = Math.max((hi - lo) * 0.1, (minSpanM - (hi - lo)) / 2, 0)
  return [lo - pad, hi + pad]
}

/** A 1-2-5 step giving at most `maxTicks` ticks across `span`. */
export function niceStep(span: number, maxTicks: number): number {
  if (!(span > 0) || !(maxTicks >= 1)) return 1
  const raw = span / maxTicks
  const pow = 10 ** Math.floor(Math.log10(raw))
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow
  return 10 * pow
}

/** Tick values: multiples of a nice step inside [from, to]. */
export function ticks(from: number, to: number, maxTicks: number): number[] {
  const step = niceStep(to - from, maxTicks)
  const out: number[] = []
  for (let v = Math.ceil(from / step - 1e-9) * step; v <= to + 1e-9; v += step) {
    const t = Math.round(v / step) * step
    out.push(t === 0 ? 0 : t) // never -0
  }
  return out
}

// ---- outline map ----------------------------------------------------------------

export interface Projection {
  x(lat: number, lon: number): number
  y(lat: number, lon: number): number
  /** Ground metres per drawing unit. */
  metresPerUnit: number
}

const M_PER_DEG = (Math.PI / 180) * 6371008.8

/**
 * A local equirectangular projection (north up, east right) that fits
 * `bounds` into width × height with `pad` all round and keeps the route's
 * true shape. Plenty for a route-sized area.
 */
export function fitProjection(bounds: Pick<RouteBounds, 'minLat' | 'maxLat' | 'minLon' | 'maxLon'>, width: number, height: number, pad: number): Projection {
  const lat0 = (bounds.minLat + bounds.maxLat) / 2
  const lon0 = (bounds.minLon + bounds.maxLon) / 2
  const kx = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180)
  const ky = M_PER_DEG
  const w = (bounds.maxLon - bounds.minLon) * kx
  const h = (bounds.maxLat - bounds.minLat) * ky
  const availW = Math.max(1, width - 2 * pad)
  const availH = Math.max(1, height - 2 * pad)
  const scale = w > 0 || h > 0 ? Math.min(w > 0 ? availW / w : Infinity, h > 0 ? availH / h : Infinity) : 1
  const cx = width / 2
  const cy = height / 2
  return {
    x: (_lat, lon) => cx + (lon - lon0) * kx * scale,
    y: (lat) => cy - (lat - lat0) * ky * scale,
    metresPerUnit: 1 / scale,
  }
}

export interface OutlineRun {
  cls: number
  /** SVG polyline points: "x,y x,y ...". */
  points: string
}

/** The route as polylines coloured by grade class, from the profile (at most ~`maxPoints` vertices). */
export function outlineRuns(profile: readonly ProfilePoint[], proj: Projection, maxPoints = 1500): OutlineRun[] {
  const n = profile.length
  if (n < 2) return []
  const stride = Math.max(1, Math.ceil(n / maxPoints))
  const idx: number[] = []
  for (let i = 0; i < n - 1; i += stride) idx.push(i)
  idx.push(n - 1)
  const runs: OutlineRun[] = []
  const at = (i: number) => {
    const p = profile[i]!
    return `${f(proj.x(p.lat, p.lon))},${f(proj.y(p.lat, p.lon))}`
  }
  for (let k = 0; k < idx.length - 1; k++) {
    const a = profile[idx[k]!]!
    const b = profile[idx[k + 1]!]!
    const span = b.distM - a.distM
    const cls = gradeClass(span > 0 ? gradeIntegral(profile, a.distM, b.distM) / span : a.gradePct)
    const last = runs[runs.length - 1]
    if (last && last.cls === cls) last.points += ` ${at(idx[k + 1]!)}`
    else runs.push({ cls, points: `${at(idx[k]!)} ${at(idx[k + 1]!)}` })
  }
  return runs
}

const SCALE_STEPS_M = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000, 200_000]

/** The longest round distance that fits in `maxUnits` of the drawing. */
export function scaleBar(metresPerUnit: number, maxUnits: number): { metres: number; units: number; label: string } {
  let best = SCALE_STEPS_M[0]!
  for (const m of SCALE_STEPS_M) if (m / metresPerUnit <= maxUnits) best = m
  return { metres: best, units: best / metresPerUnit, label: best >= 1000 ? `${best / 1000} km` : `${best} m` }
}

const f = (v: number) => (Math.round(v * 10) / 10).toString()
