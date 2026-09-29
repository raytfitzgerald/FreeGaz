// PowerMatch: when power pedals are connected, scale the ERG command so the
// pedals (not the trainer's own sensor) read the target. It estimates the
// ratio between the two sensors over the same window, which doesn't depend on
// the command, so there's no control loop to oscillate: measure, smooth, apply.

export interface PowerMatchInput {
  now: number
  /** ERG is holding a target (no soft start / spiral / pause guard). */
  ergSteady: boolean
  /** Mean power over the last WINDOW_MS from the pedals and from the trainer. */
  pedalW: number | null
  trainerW: number | null
}

export const WINDOW_MS = 5000
const UPDATE_MS = 3000
const MIN_W = 60
/** Sensors further apart than this are disagreeing, not miscalibrated. */
const MAX_RATIO_DEV = 0.2
const MAX_FACTOR_DEV = 0.15
const SMOOTHING = 0.4

export class PowerMatch {
  private ratio: number | null = null
  private steadySince: number | null = null
  private lastUpdate = -Infinity

  /** Multiply the trainer command by this (1 = no correction). */
  get factor(): number {
    if (this.ratio === null) return 1
    return clamp(1 / this.ratio, 1 - MAX_FACTOR_DEV, 1 + MAX_FACTOR_DEV)
  }

  get active(): boolean {
    return this.ratio !== null
  }

  update(i: PowerMatchInput): number {
    if (!i.ergSteady) {
      this.steadySince = null
      return this.factor
    }
    this.steadySince ??= i.now
    if (i.now - this.steadySince < WINDOW_MS || i.now - this.lastUpdate < UPDATE_MS) return this.factor
    if (i.pedalW === null || i.trainerW === null || i.trainerW < MIN_W || i.pedalW < MIN_W) return this.factor
    const r = i.pedalW / i.trainerW
    if (Math.abs(r - 1) > MAX_RATIO_DEV) return this.factor
    // The trainer's reading is of the current (already corrected) command, so r is a clean sensor ratio.
    this.ratio = this.ratio === null ? r : this.ratio + SMOOTHING * (r - this.ratio)
    this.lastUpdate = i.now
    return this.factor
  }

  reset(): void {
    this.ratio = null
    this.steadySince = null
    this.lastUpdate = -Infinity
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
