// Heart-rate variability from beat-to-beat (RR) intervals in milliseconds.

/** Shortest plausible RR interval, ms (200 bpm). */
export const RR_MIN_MS = 300
/** Longest plausible RR interval, ms (30 bpm). */
export const RR_MAX_MS = 2000
/** Maximum relative change from the reference beat before a beat is rejected (20 %). */
export const RR_MAX_CHANGE = 0.2
/** Minimum clean intervals for RMSSD and SDNN. */
export const HRV_MIN_INTERVALS = 10
/** Minimum clean beats for DFA α1. */
export const DFA_MIN_BEATS = 120
/** Box sizes (beats) of the short-term DFA exponent α1. */
export const DFA_ALPHA1_BOXES = { min: 4, max: 16 } as const

// The first beat is compared with the median of this many in-range beats.
const SEED_BEATS = 5
// This many consecutive rejected beats that agree with each other re-anchor the reference.
const REANCHOR_RUN = 3

export interface HrvOptions {
  /** Run cleanRr on the input first (default true). With false, only non-finite values are dropped. */
  clean?: boolean
}

/**
 * Artifact filter for RR intervals (ms). It drops intervals outside
 * 300–2000 ms and intervals that differ by more than 20 % from the previous
 * accepted beat. That catches ectopic beats and missed or extra detections.
 *
 * Two safeguards stop one bad beat from rejecting everything after it:
 * - The first beat is compared with the median of the first 5 in-range beats
 *   instead of being accepted blindly.
 * - After 3 consecutive rejected beats that agree with each other (each within
 *   20 % of the one before), the old reference is assumed to be stale, for
 *   example after a gap in the data. Those beats are accepted and become the
 *   new reference.
 *
 * Rejected beats are removed, not interpolated.
 */
export function cleanRr(rrMs: readonly number[]): number[] {
  const inRange = rrMs.filter((rr) => Number.isFinite(rr) && rr >= RR_MIN_MS && rr <= RR_MAX_MS)
  if (inRange.length === 0) return []
  let ref = median(inRange.slice(0, SEED_BEATS))
  const out: number[] = []
  let run: number[] = []
  for (const rr of inRange) {
    if (Math.abs(rr - ref) <= RR_MAX_CHANGE * ref) {
      out.push(rr)
      ref = rr
      run = []
      continue
    }
    const last = run[run.length - 1]
    if (last !== undefined && Math.abs(rr - last) <= RR_MAX_CHANGE * last) run.push(rr)
    else run = [rr]
    if (run.length >= REANCHOR_RUN) {
      out.push(...run)
      ref = rr
      run = []
    }
  }
  return out
}

/**
 * Root mean square of successive differences (ms), the main short-term vagal
 * HRV index. Needs ≥ 10 clean intervals, otherwise null.
 */
export function rmssd(rrMs: readonly number[], opts: HrvOptions = {}): number | null {
  const rr = prepare(rrMs, opts)
  if (rr.length < HRV_MIN_INTERVALS) return null
  let sq = 0
  for (let i = 1; i < rr.length; i++) {
    const d = rr[i]! - rr[i - 1]!
    sq += d * d
  }
  return Math.sqrt(sq / (rr.length - 1))
}

/**
 * Natural log of RMSSD, with RMSSD in ms. This is the usual form for day-to-day
 * readiness tracking, because it is closer to normally distributed. Null when RMSSD is null or 0.
 */
export function lnRmssd(rrMs: readonly number[], opts: HrvOptions = {}): number | null {
  const r = rmssd(rrMs, opts)
  return r !== null && r > 0 ? Math.log(r) : null
}

/** Sample standard deviation (n − 1) of the clean NN intervals, ms. Needs ≥ 10 clean intervals. */
export function sdnn(rrMs: readonly number[], opts: HrvOptions = {}): number | null {
  const rr = prepare(rrMs, opts)
  if (rr.length < HRV_MIN_INTERVALS) return null
  const m = mean(rr)
  let sq = 0
  for (const x of rr) sq += (x - m) ** 2
  return Math.sqrt(sq / (rr.length - 1))
}

/**
 * EXPERIMENTAL. Short-term detrended fluctuation analysis exponent α1
 * (dimensionless) of RR intervals. After Peng et al. (1995); used during
 * exercise by Rogers et al. (2021), where α1 ≈ 0.75 marks the aerobic
 * threshold.
 *
 * 1. Integrate the mean-subtracted series: y(k) = Σ_{i≤k} (RR_i − mean).
 * 2. For each box size n = 4..16 beats, split y into non-overlapping boxes of
 *    n, once from the start and once from the end, so that no data is wasted.
 *    Fit a least-squares line in each box. F(n) is the RMS of the residuals.
 * 3. α1 is the least-squares slope of ln F(n) against ln n.
 *
 * Reference values: white noise ≈ 0.5, 1/f noise ≈ 1, Brownian ≈ 1.5.
 * Needs ≥ 120 clean beats (about 2 minutes), otherwise null. The value is very
 * sensitive to artifacts, so only trust it on clean chest-strap data.
 */
export function dfaAlpha1(rrMs: readonly number[], opts: HrvOptions = {}): number | null {
  const rr = prepare(rrMs, opts)
  const n = rr.length
  if (n < DFA_MIN_BEATS) return null
  const m = mean(rr)
  const profile = new Float64Array(n)
  let acc = 0
  for (let i = 0; i < n; i++) {
    acc += rr[i]! - m
    profile[i] = acc
  }
  const logN: number[] = []
  const logF: number[] = []
  for (let box = DFA_ALPHA1_BOXES.min; box <= DFA_ALPHA1_BOXES.max; box++) {
    const boxes = Math.floor(n / box)
    let sq = 0
    for (let b = 0; b < boxes; b++) {
      sq += detrendedSquares(profile, b * box, box)
      sq += detrendedSquares(profile, n - (b + 1) * box, box)
    }
    const f = Math.sqrt(sq / (2 * boxes * box))
    if (f > 0) {
      logN.push(Math.log(box))
      logF.push(Math.log(f))
    }
  }
  return logN.length >= 2 ? slope(logN, logF) : null
}

function prepare(rrMs: readonly number[], opts: HrvOptions): number[] {
  return opts.clean === false ? rrMs.filter((rr) => Number.isFinite(rr)) : cleanRr(rrMs)
}

// Residual sum of squares of the least-squares line through (k, y[start + k]), k = 0..len-1.
function detrendedSquares(y: Float64Array, start: number, len: number): number {
  const kMean = (len - 1) / 2
  let yMean = 0
  for (let k = 0; k < len; k++) yMean += y[start + k]!
  yMean /= len
  let sxy = 0
  let syy = 0
  for (let k = 0; k < len; k++) {
    const dy = y[start + k]! - yMean
    sxy += (k - kMean) * dy
    syy += dy * dy
  }
  const sxx = (len * (len * len - 1)) / 12
  return Math.max(0, syy - (sxy * sxy) / sxx)
}

function slope(xs: readonly number[], ys: readonly number[]): number {
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i]! - mx
    sxy += dx * (ys[i]! - my)
    sxx += dx * dx
  }
  return sxy / sxx
}

function mean(xs: readonly number[]): number {
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}
