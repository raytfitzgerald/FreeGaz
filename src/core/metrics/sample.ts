// Conventions shared by the metrics modules. Ride records are one sample per
// second of moving time, and a missing sensor reading is null, never 0.

/**
 * One 1 Hz sample. `null` means the sensor was missing for that second. That is
 * different from 0, which is a real reading (coasting). Non-finite numbers are
 * treated as missing too, so a stray NaN cannot poison a running sum.
 */
export type Sample = number | null

/** True when `v` is a usable reading: a finite number (not null, undefined or NaN). */
export function isValidSample(v: Sample | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Mean of the valid samples (same unit as the input), or null if there are none.
 * `keep` can exclude further readings (for example cadence zeros).
 */
export function meanOf(samples: readonly Sample[], keep?: (v: number) => boolean): number | null {
  let sum = 0
  let n = 0
  for (const v of samples) {
    if (!isValidSample(v) || (keep && !keep(v))) continue
    sum += v
    n++
  }
  return n > 0 ? sum / n : null
}

/** Largest valid sample (same unit as the input), or null if there are none. */
export function maxOf(samples: readonly Sample[]): number | null {
  let best: number | null = null
  for (const v of samples) {
    if (isValidSample(v) && (best === null || v > best)) best = v
  }
  return best
}
