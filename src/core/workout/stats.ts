// Planned-workout statistics, estimated from the timeline sampled at 1 Hz
// (each one-second bin is sampled at its midpoint, so steady steps and linear
// ramps on whole-second boundaries integrate exactly). ERG-off steps have no
// target, so estimates assume FREERIDE_ESTIMATE_FTP for free rides and
// MAXEFFORT_ESTIMATE_FTP for max efforts.

import { compileWorkout, resolvePower, type Timeline, type TimelineStep } from './compile'
import type { Workout } from './model'

export const FREERIDE_ESTIMATE_FTP = 0.6
export const MAXEFFORT_ESTIMATE_FTP = 1.5

/** Upper bounds (fraction of FTP) of Coggan zones 1–6; zone 7 is open-ended. */
export const COGGAN_ZONE_LIMITS: readonly number[] = [0.56, 0.76, 0.91, 1.06, 1.21, 1.51]

export interface WorkoutStats {
  durationS: number
  /** Normalized power: 30-s rolling mean, 4th-power average. Null under 30 s. */
  np: number | null
  /** Intensity factor, NP / FTP. */
  if: number | null
  /** Training stress score, hours × IF² × 100. */
  tss: number | null
  kj: number
  avgW: number
  /** Seconds in Coggan zones 1–7 (index 0 = Z1). */
  zoneSeconds: number[]
}

/** 0-based Coggan zone for a fraction of FTP: [0, 0.56) → 0 … [1.51, ∞) → 6. */
export function cogganZone(fraction: number): number {
  let z = 0
  for (const limit of COGGAN_ZONE_LIMITS) {
    if (fraction < limit) break
    z++
  }
  return z
}

/** Planned (or, for ERG-off steps, assumed) watts at `tS` within `step`. */
export function estimatedWatts(step: TimelineStep, tS: number, ftpW: number): number {
  switch (step.kind) {
    case 'freeride':
      return FREERIDE_ESTIMATE_FTP * ftpW
    case 'maxeffort':
      return MAXEFFORT_ESTIMATE_FTP * ftpW
    case 'ramp': {
      if (!step.from || !step.to) return 0
      const a = resolvePower(step.from, ftpW)
      const b = resolvePower(step.to, ftpW)
      const f = step.durationS > 0 ? Math.min(1, Math.max(0, (tS - step.startS) / step.durationS)) : 0
      return a + (b - a) * f
    }
    default:
      return step.from ? resolvePower(step.from, ftpW) : 0
  }
}

export function workoutStats(input: Workout | Timeline, ftpW: number): WorkoutStats {
  if (!Number.isFinite(ftpW) || ftpW <= 0) throw new RangeError('ftpW must be a positive number of watts')
  const tl = 'steps' in input ? input : compileWorkout(input)
  const durationS = tl.durationS
  const samples: number[] = []
  const zoneSeconds = [0, 0, 0, 0, 0, 0, 0]
  let joules = 0
  let si = 0
  const bins = Math.ceil(durationS - 1e-9)
  for (let k = 0; k < bins; k++) {
    const weight = Math.min(k + 1, durationS) - k
    const mid = k + weight / 2
    while (si < tl.steps.length - 1 && mid >= (tl.steps[si]?.endS ?? Infinity)) si++
    const step = tl.steps[si]
    if (!step) break
    const watts = estimatedWatts(step, mid, ftpW)
    samples.push(watts)
    joules += watts * weight
    const z = cogganZone(watts / ftpW)
    zoneSeconds[z] = (zoneSeconds[z] ?? 0) + weight
  }
  const np = normalizedPower(samples)
  const intensity = np === null ? null : np / ftpW
  return {
    durationS,
    np,
    if: intensity,
    tss: intensity === null ? null : (durationS / 3600) * intensity * intensity * 100,
    kj: joules / 1000,
    avgW: durationS > 0 ? joules / durationS : 0,
    zoneSeconds,
  }
}

/** Coggan NP of a 1 Hz series: 4th-power mean of the trailing 30-s averages. */
export function normalizedPower(samples: readonly number[]): number | null {
  const window = 30
  if (samples.length < window) return null
  let sum = 0
  for (let i = 0; i < window; i++) sum += samples[i] ?? 0
  let acc = (sum / window) ** 4
  let n = 1
  for (let i = window; i < samples.length; i++) {
    sum += (samples[i] ?? 0) - (samples[i - window] ?? 0)
    acc += (sum / window) ** 4
    n++
  }
  return (acc / n) ** 0.25
}
