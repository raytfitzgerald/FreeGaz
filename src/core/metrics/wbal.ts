// W' balance: the anaerobic work capacity left above critical power (CP).
//
// Differential model: Skiba, Fulford, Clarke, Vanhatalo & Jones (2015),
//   "Intramuscular determinants of the ability to recover work capacity above
//   critical power", Eur J Appl Physiol 115:703–713. Popularised by Froncioni
//   and Clarke as the "differential" W'bal.
// Integral model: Skiba, Chidnok, Vanhatalo & Jones (2012), "Modeling the
//   expenditure and reconstitution of work capacity above critical power",
//   Med Sci Sports Exerc 44:1526–1532.

import { isValidSample, type Sample } from './sample'

export interface WPrimeOptions {
  /** Critical power, W. */
  cp: number
  /** W' (work capacity above CP), J. */
  wPrimeJ: number
}

function checkModel(cp: number, wPrimeJ: number): void {
  if (!(cp > 0) || !Number.isFinite(cp)) throw new RangeError(`cp must be a positive number of watts, got ${cp}`)
  if (!(wPrimeJ > 0) || !Number.isFinite(wPrimeJ)) throw new RangeError(`wPrimeJ must be a positive number of joules, got ${wPrimeJ}`)
}

/**
 * Streaming W' balance, using the Skiba 2015 differential model.
 *
 * - Above CP, W'bal falls linearly: W'bal −= (P − CP)·dt.
 * - At or below CP, W'bal recovers towards W' at the rate
 *   dW'bal/dt = (CP − P)·(W' − W'bal)/W'. Each step is integrated in closed
 *   form at constant power, W'bal ← W' − (W' − W'bal)·e^(−(CP − P)·dt/W'),
 *   which is the equation as published in 2015. The explicit Euler update
 *   (Froncioni's discretisation) recovers a fraction x = (CP − P)·dt/W' of the
 *   deficit per step instead of 1 − e^(−x). That is about x/2 faster in
 *   relative terms, under 1 % for 1 s steps. Unlike Euler, the closed form
 *   cannot overshoot W' when dt is large.
 * - A missing sample (null) leaves W'bal unchanged, as if the power were CP.
 *
 * W'bal can go negative. That means the rider outperformed the model, which is
 * a hint that CP or W' is set too low.
 */
export class WPrimeBalance {
  readonly cp: number
  readonly wPrimeJ: number
  private bal: number
  private min: number

  constructor(opts: WPrimeOptions) {
    checkModel(opts.cp, opts.wPrimeJ)
    this.cp = opts.cp
    this.wPrimeJ = opts.wPrimeJ
    this.bal = opts.wPrimeJ
    this.min = opts.wPrimeJ
  }

  /**
   * Advances the model by `dtS` seconds at `watts` and returns W'bal in J.
   * @param watts power in W, or null if missing (no change)
   * @param dtS step length in seconds (default 1)
   */
  push(watts: Sample, dtS = 1): number {
    if (!isValidSample(watts) || !(dtS > 0)) return this.bal
    const p = Math.max(0, watts)
    if (p > this.cp) {
      this.bal -= (p - this.cp) * dtS
    } else {
      this.bal = this.wPrimeJ - (this.wPrimeJ - this.bal) * Math.exp((-(this.cp - p) * dtS) / this.wPrimeJ)
    }
    if (this.bal < this.min) this.min = this.bal
    return this.bal
  }

  /** Current W' balance, J. */
  get valueJ(): number {
    return this.bal
  }

  /** Lowest W' balance seen since construction or reset(), J. */
  get minJ(): number {
    return this.min
  }

  /** Restores a full W'. */
  reset(): void {
    this.bal = this.wPrimeJ
    this.min = this.wPrimeJ
  }
}

/**
 * Skiba 2012 recovery time constant τ (s) = 546·e^(−0.01·D_CP) + 316.
 * @param dcpW D_CP: CP minus the mean power during recovery, in W
 */
export function skibaTau(dcpW: number): number {
  return 546 * Math.exp(-0.01 * dcpW) + 316
}

/**
 * W' balance (J) for each 1 Hz sample, using the Skiba 2012 integral model:
 *
 *   W'bal(t) = W' − Σ_{u ≤ t} max(0, P(u) − CP) · e^(−(t − u)/τ)
 *
 * with τ = skibaTau(D_CP), where D_CP = CP − the mean of the valid samples
 * below CP, taken over the whole ride. If no sample is below CP, D_CP is 0
 * (τ = 862 s). The sum is evaluated recursively, which is O(n). A missing
 * sample leaves W'bal unchanged. The sum neither decays nor grows, to match
 * the differential model's handling of missing data.
 */
export function wPrimeBalanceIntegral(samples: readonly Sample[], cp: number, wPrimeJ: number): number[] {
  checkModel(cp, wPrimeJ)
  let belowSum = 0
  let belowN = 0
  for (const v of samples) {
    if (isValidSample(v) && v < cp) {
      belowSum += Math.max(0, v)
      belowN++
    }
  }
  const dcp = belowN > 0 ? cp - belowSum / belowN : 0
  const decay = Math.exp(-1 / skibaTau(dcp))
  const out: number[] = []
  let expended = 0
  for (const v of samples) {
    if (isValidSample(v)) expended = expended * decay + Math.max(0, v - cp)
    out.push(wPrimeJ - expended)
  }
  return out
}

/**
 * Seconds until W' is exhausted if `watts` is held: W'bal / (P − CP).
 * Returns null at or below CP, where W' is not being used. Returns 0 when W'bal ≤ 0.
 * @param watts power in W
 * @param cp critical power in W
 * @param wBalJ current W' balance in J
 */
export function timeToExhaustionS(watts: number, cp: number, wBalJ: number): number | null {
  if (!(watts > cp)) return null
  return Math.max(0, wBalJ) / (watts - cp)
}
