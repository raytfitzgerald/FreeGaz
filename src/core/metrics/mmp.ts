// Mean-maximal power (the power-duration curve) from 1 Hz power samples.

import { isValidSample, type Sample } from './sample'

/** Durations (s) of the standard power-duration curve. */
export const STANDARD_DURATIONS: readonly number[] = [
  1, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720, 900, 1200, 1500, 1800, 2400, 2700,
  3600, 5400, 7200, 10800,
]

/** Best average power for one duration. */
export interface MmpPoint {
  /** Window length, s. */
  durationS: number
  /** Mean power over the best window, W. */
  watts: number
  /** Index of the window's first sample in the ride (s from the start at 1 Hz). */
  startIndex: number
  /** Optional provenance (e.g. ride id) once points from several rides are merged. */
  sourceId?: string
}

/**
 * Mean-maximal power: for each duration, the highest mean over any window of
 * exactly that many consecutive samples.
 *
 * - A window that contains a missing sample (null) is not eligible, so gaps are
 *   never bridged. 0 W is a real value and does count.
 * - Durations with no eligible window are left out, e.g. those longer than the ride.
 * - O(n) per duration using prefix sums. Ties keep the earliest window.
 *
 * Exact-length means are not strictly monotonic in duration. For [10, 0, 10],
 * MMP(2) = 5 but MMP(3) ≈ 6.7.
 *
 * @param samples 1 Hz power in W, null when missing
 * @param durations window lengths in s (positive integers; others are ignored)
 * @returns points sorted by durationS ascending
 */
export function meanMaxPower(samples: readonly Sample[], durations: readonly number[] = STANDARD_DURATIONS): MmpPoint[] {
  const n = samples.length
  const sum = new Float64Array(n + 1)
  const gaps = new Int32Array(n + 1)
  for (let i = 0; i < n; i++) {
    const v = samples[i]
    const ok = isValidSample(v)
    sum[i + 1] = sum[i]! + (ok ? v : 0)
    gaps[i + 1] = gaps[i]! + (ok ? 0 : 1)
  }
  const wanted = [...new Set(durations)].filter((d) => Number.isInteger(d) && d >= 1 && d <= n).sort((a, b) => a - b)
  const out: MmpPoint[] = []
  for (const d of wanted) {
    let bestSum = -Infinity
    let bestStart = -1
    for (let i = 0; i + d <= n; i++) {
      if (gaps[i + d] !== gaps[i]) continue
      const s = sum[i + d]! - sum[i]!
      if (s > bestSum) {
        bestSum = s
        bestStart = i
      }
    }
    if (bestStart >= 0) out.push({ durationS: d, watts: bestSum / d, startIndex: bestStart })
  }
  return out
}

/**
 * Element-wise best of two power-duration curves, e.g. to merge a ride into an
 * all-time curve. For each duration the entry with more watts wins, and ties
 * keep `a`'s entry. The winning object is returned as is, so provenance fields
 * (sourceId, startIndex, dates...) come with it.
 * @returns points sorted by durationS ascending
 */
export function mergeMmp<T extends { durationS: number; watts: number }>(a: readonly T[], b: readonly T[]): T[] {
  const best = new Map<number, T>()
  for (const p of [...a, ...b]) {
    const cur = best.get(p.durationS)
    if (cur === undefined || p.watts > cur.watts) best.set(p.durationS, p)
  }
  return [...best.values()].sort((x, y) => x.durationS - y.durationS)
}
