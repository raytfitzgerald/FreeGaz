// Power metrics over 1 Hz power samples (W). The definitions follow Allen &
// Coggan, "Training and Racing with a Power Meter", as implemented by
// TrainingPeaks and WKO. Missing seconds (null) are skipped everywhere. 0 W is
// a real zero (coasting) and does count.

import { RollingMean } from './rolling'
import { isValidSample, maxOf, meanOf, type Sample } from './sample'

/** Length of the Normalized Power rolling-average window, in seconds. */
export const NP_WINDOW_S = 30

/**
 * Streaming Normalized Power (Coggan).
 *
 * Starting at the 30 s mark, take the 30 s rolling mean of power, raise each
 * value to the 4th power, average those, then take the 4th root. As in
 * TrainingPeaks and WKO, the first rolling value is the mean of seconds 1–30,
 * so NP is null until 30 samples have been pushed. GoldenCheetah instead
 * zero-pads the window from the first second, which reads a little lower on
 * short rides.
 *
 * Missing seconds: a null still takes up its slot in the time-based 30 s
 * window, but it is left out of the rolling mean and its count. A second with
 * no reading also adds no term to the 4th-power average. A dropout therefore
 * never pulls NP towards zero.
 */
export class NormalizedPowerAccumulator {
  private readonly rolling = new RollingMean(NP_WINDOW_S)
  private sum4 = 0
  private n4 = 0
  private valid = 0

  /** Adds one second of power (W, or null if missing). */
  push(watts: Sample): void {
    const mean = this.rolling.push(watts)
    if (!isValidSample(watts)) return
    this.valid++
    if (mean !== null && this.rolling.pushes >= NP_WINDOW_S) {
      this.sum4 += mean ** 4
      this.n4++
    }
  }

  /** Normalized Power so far (W), or null before the 30 s mark or with no data. */
  value(): number | null {
    return this.n4 > 0 ? (this.sum4 / this.n4) ** 0.25 : null
  }

  /** Seconds with a valid power reading pushed so far (s). */
  get validSeconds(): number {
    return this.valid
  }

  /** Clears all state. */
  reset(): void {
    this.rolling.reset()
    this.sum4 = 0
    this.n4 = 0
    this.valid = 0
  }
}

/** Normalized Power (W) of 1 Hz samples. It always equals NormalizedPowerAccumulator over the same samples. */
export function normalizedPower(samples: readonly Sample[]): number | null {
  const acc = new NormalizedPowerAccumulator()
  for (const w of samples) acc.push(w)
  return acc.value()
}

/** Mean power (W) over the valid samples. Zeros count and nulls are skipped. Null if there is no data. */
export function averagePower(samples: readonly Sample[]): number | null {
  return meanOf(samples)
}

/** Peak power (W) over the valid samples, or null if there is no data. */
export function maxPower(samples: readonly Sample[]): number | null {
  return maxOf(samples)
}

/**
 * Mechanical work (kJ): the sum of valid W × `dtS` / 1000. Null if there is no data.
 * @param dtS sample interval in seconds (1 for ride records)
 */
export function kilojoules(samples: readonly Sample[], dtS = 1): number | null {
  let joules = 0
  let any = false
  for (const w of samples) {
    if (!isValidSample(w)) continue
    joules += w * dtS
    any = true
  }
  return any ? joules / 1000 : null
}

/** Intensity Factor (dimensionless) = NP (W) / FTP (W). Null without NP or with a non-positive FTP. */
export function intensityFactor(np: number | null, ftp: number): number | null {
  if (np === null || !(ftp > 0)) return null
  return np / ftp
}

/**
 * Training Stress Score = (s × NP × IF) / (FTP × 3600) × 100. One hour at FTP is 100.
 * @param durationS duration in seconds that NP covers
 * @param np Normalized Power in W
 * @param ftp FTP in W
 */
export function trainingStressScore(durationS: number, np: number | null, ftp: number): number | null {
  const intensity = intensityFactor(np, ftp)
  if (np === null || intensity === null || !(durationS >= 0)) return null
  return ((durationS * np * intensity) / (ftp * 3600)) * 100
}

/** Variability Index (dimensionless) = NP (W) / average power (W). Null if either is missing or average ≤ 0. */
export function variabilityIndex(np: number | null, avg: number | null): number | null {
  if (np === null || avg === null || !(avg > 0)) return null
  return np / avg
}

/** Power-to-weight ratio (W/kg). Null without power or with a non-positive weight. */
export function wattsPerKg(w: number | null, kg: number): number | null {
  if (w === null || !(kg > 0)) return null
  return w / kg
}
