// Constant-time rolling mean over the last N pushes that skips missing samples.

import { isValidSample, type Sample } from './sample'

/**
 * Rolling mean of the valid samples among the last `windowSize` pushes.
 *
 * The window is counted in pushes (seconds at 1 Hz), not in valid samples. A
 * null takes up its slot but is left out of both the sum and the count, so a
 * dropout never drags the mean towards zero.
 *
 * Each push is O(1). The running sum is recomputed from the buffer once per
 * window, which is amortised O(1) and stops floating-point drift on long rides.
 */
export class RollingMean {
  readonly windowSize: number
  private readonly values: Float64Array
  private readonly present: Uint8Array
  private head = 0
  private sum = 0
  private n = 0
  private pushed = 0

  /** @param windowSize window length in pushes (seconds at 1 Hz), a positive integer. */
  constructor(windowSize: number) {
    if (!Number.isInteger(windowSize) || windowSize < 1) {
      throw new RangeError(`windowSize must be a positive integer, got ${windowSize}`)
    }
    this.windowSize = windowSize
    this.values = new Float64Array(windowSize)
    this.present = new Uint8Array(windowSize)
  }

  /** Pushes since construction or the last reset(), including nulls. */
  get pushes(): number {
    return this.pushed
  }

  /** Number of valid samples currently in the window. */
  get count(): number {
    return this.n
  }

  /**
   * Adds one sample and returns the mean of the valid samples in the last
   * `windowSize` pushes, in the input's unit. Returns null when the window holds
   * no valid sample.
   */
  push(v: Sample): number | null {
    const i = this.head
    if (this.present[i] === 1) {
      this.sum -= this.values[i]!
      this.n--
    }
    if (isValidSample(v)) {
      this.values[i] = v
      this.present[i] = 1
      this.sum += v
      this.n++
    } else {
      this.values[i] = 0
      this.present[i] = 0
    }
    this.pushed++
    this.head = i + 1 === this.windowSize ? 0 : i + 1
    if (this.head === 0) this.resum()
    else if (this.n === 0) this.sum = 0
    return this.value()
  }

  /** Current mean (input unit), or null when the window holds no valid sample. */
  value(): number | null {
    return this.n > 0 ? this.sum / this.n : null
  }

  /** Empties the window. */
  reset(): void {
    this.values.fill(0)
    this.present.fill(0)
    this.head = 0
    this.sum = 0
    this.n = 0
    this.pushed = 0
  }

  // Missing slots hold 0, so summing the whole buffer gives the valid sum.
  private resum(): void {
    let s = 0
    for (const v of this.values) s += v
    this.sum = s
  }
}
