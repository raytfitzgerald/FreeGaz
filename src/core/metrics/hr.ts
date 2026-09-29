// Heart-rate/power metrics: efficiency factor and aerobic decoupling (Pw:HR).

import { isValidSample, type Sample } from './sample'

/** Minimum paired power+HR data for a decoupling value, s (20 min). */
export const DECOUPLING_MIN_PAIRED_S = 1200

export interface DecouplingOptions {
  /** Minimum paired seconds before a value is reported (default 1200 s). */
  minPairedS?: number
}

/**
 * Efficiency Factor = NP (W) / average HR (bpm), in W/bpm, as TrainingPeaks
 * defines it for cycling. Null if either input is missing or HR ≤ 0.
 */
export function efficiencyFactor(np: number | null, avgHr: number | null): number | null {
  if (np === null || avgHr === null || !(avgHr > 0)) return null
  return np / avgHr
}

/**
 * Streaming aerobic decoupling (Pw:HR), for a live readout during a ride.
 *
 * Only paired seconds count: both power and HR must be present, and HR must be
 * > 0 (straps send 0 bpm when they lose contact). The paired seconds are split
 * by time into halves (the first ⌊n/2⌋ and the rest). Then
 * EF_i = mean power_i / mean HR_i and decoupling % = (EF1 − EF2) / EF1 × 100.
 * Positive values mean HR drifted up relative to power.
 *
 * Mean power follows GoldenCheetah. TrainingPeaks' Pw:HR uses NP per half
 * instead. For the steady efforts the metric is meant for, the two are almost
 * identical. O(1) per push and per value().
 */
export class HrDriftAccumulator {
  private readonly minPaired: number
  // Prefix sums over paired seconds: [0] = 0, [k] = sum of the first k values.
  private readonly powerSums: number[] = [0]
  private readonly hrSums: number[] = [0]

  constructor(opts: DecouplingOptions = {}) {
    this.minPaired = Math.max(2, opts.minPairedS ?? DECOUPLING_MIN_PAIRED_S)
  }

  /** Adds one second: power in W and HR in bpm, each null if missing. */
  push(watts: Sample, hr: Sample): void {
    if (!isValidSample(watts) || !isValidSample(hr) || hr <= 0) return
    const k = this.powerSums.length - 1
    this.powerSums.push(this.powerSums[k]! + watts)
    this.hrSums.push(this.hrSums[k]! + hr)
  }

  /** Seconds that had both power and HR, s. */
  get pairedSeconds(): number {
    return this.powerSums.length - 1
  }

  /** Decoupling so far (%), or null below the minimum paired time or when the first-half EF is 0. */
  value(): number | null {
    const n = this.pairedSeconds
    if (n < this.minPaired) return null
    const h = Math.floor(n / 2)
    const p1 = this.powerSums[h]!
    const hr1 = this.hrSums[h]!
    const p2 = this.powerSums[n]! - p1
    const hr2 = this.hrSums[n]! - hr1
    // The sample counts cancel: mean P / mean HR = sum P / sum HR.
    const ef1 = p1 / hr1
    const ef2 = p2 / hr2
    if (!(ef1 > 0) || !Number.isFinite(ef2)) return null
    return ((ef1 - ef2) / ef1) * 100
  }

  /** Clears all state. */
  reset(): void {
    this.powerSums.length = 1
    this.hrSums.length = 1
  }
}

/**
 * Aerobic decoupling (Pw:HR, %) of a ride from aligned 1 Hz power (W) and HR
 * (bpm) arrays. See HrDriftAccumulator for the method. Returns null with less
 * than 20 min (1200 s) of paired data.
 */
export function aerobicDecoupling(power: readonly Sample[], hr: readonly Sample[], opts: DecouplingOptions = {}): number | null {
  const acc = new HrDriftAccumulator(opts)
  const n = Math.max(power.length, hr.length)
  for (let i = 0; i < n; i++) acc.push(power[i] ?? null, hr[i] ?? null)
  return acc.value()
}
