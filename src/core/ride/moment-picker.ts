// Which moments of a ride become pictures: the hardest effort, and one coach
// line. The ride screen asks after every tick and every line whether to
// capture now; each new capture replaces the last one of its kind, so the
// ride ends with at most one of each.

/** No moments from the first minutes: warm-ups are nobody's highlight. */
export const HARD_FROM_S = 120
export const COACH_FROM_S = 60
/** The effort is judged on this rolling average. */
export const HARD_WINDOW_S = 30
/** A new hardest moment must beat the last captured one by this much… */
const HARD_BEAT = 1.03
/** …and come at least this long after it, so one surge isn't shot every second. */
const HARD_GAP_S = 20

export type MomentKind = 'hard' | 'coach'

export class MomentPicker {
  private window: { t: number; w: number }[] = []
  private bestW = 0
  private lastHardS = -Infinity
  private lines = 0

  /** Whether to capture the hardest effort now. `power3s` null (no sensor) counts as nothing. */
  onTick(elapsedS: number, power3s: number | null): boolean {
    this.window.push({ t: elapsedS, w: power3s ?? 0 })
    while (this.window.length > 0 && this.window[0]!.t <= elapsedS - HARD_WINDOW_S) this.window.shift()
    if (elapsedS < HARD_FROM_S || this.window.length < HARD_WINDOW_S * 0.8) return false
    const avg = this.window.reduce((a, s) => a + s.w, 0) / this.window.length
    if (avg <= 0 || avg < this.bestW * HARD_BEAT || elapsedS - this.lastHardS < HARD_GAP_S) return false
    this.bestW = avg
    this.lastHardS = elapsedS
    return true
  }

  /** The watts of the hardest moment captured so far (the rolling average). */
  get hardestW(): number | null {
    return this.bestW > 0 ? Math.round(this.bestW) : null
  }

  /**
   * Whether to capture this coach line. Reservoir sampling: the n-th eligible
   * line replaces the kept one with probability 1/n, so every line of the
   * ride is equally likely to be the one that's kept.
   */
  onCoachLine(elapsedS: number, random: number): boolean {
    if (elapsedS < COACH_FROM_S) return false
    this.lines++
    return random < 1 / this.lines
  }
}
