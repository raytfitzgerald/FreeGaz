// Drives a smart fan (KICKR Headwind) from heart rate, speed or power, the
// way you'd want outdoors: more air as you work harder. Rises quickly, falls
// only after a while (so it doesn't flap between intervals), in 5 % steps.

export type FanMode = 'off' | 'fixed' | 'hr' | 'speed' | 'power'

export interface FanPrefsLike {
  mode: FanMode
  fixedPct: number
  /** HR mode: the fan starts at hrStart bpm and is at full speed by hrFull. */
  hrStart: number
  hrFull: number
  /** Speed mode: full speed at this virtual speed. */
  speedFullKmh: number
  /** Power mode: full speed at this fraction of FTP (3-s power). */
  powerFull: number
}

export interface FanInput {
  now: number
  hr: number | null
  speedKmh: number | null
  power3s: number | null
  ftpW: number
}

const STEP = 5
const MIN_SEND_MS = 3000
const HOLD_BEFORE_DROP_MS = 20_000

const scale = (v: number, lo: number, hi: number) => (hi <= lo ? (v >= hi ? 100 : 0) : Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * 100)
const step = (pct: number) => Math.round(pct / STEP) * STEP

/** The fan speed the prefs call for now (0–100 %), or null when the input it needs is missing. */
export function fanTarget(p: FanPrefsLike, i: FanInput): number | null {
  switch (p.mode) {
    case 'off':
      return 0
    case 'fixed':
      return step(Math.max(0, Math.min(100, p.fixedPct)))
    case 'hr':
      return i.hr === null ? null : step(scale(i.hr, p.hrStart, p.hrFull))
    case 'speed':
      return i.speedKmh === null ? null : step(scale(i.speedKmh, 5, p.speedFullKmh))
    case 'power':
      return i.power3s === null || !(i.ftpW > 0) ? null : step(scale(i.power3s / i.ftpW, 0.4, p.powerFull))
  }
}

export class FanController {
  private sent: number | null = null
  private sentAt = -Infinity
  private lowSince: number | null = null

  /** The speed to send now, or null to leave the fan alone. */
  update(p: FanPrefsLike, i: FanInput): number | null {
    const want = fanTarget(p, i)
    if (want === null || want === this.sent || i.now - this.sentAt < MIN_SEND_MS) {
      if (want === null || want === this.sent) this.lowSince = null
      return null
    }
    if (this.sent !== null && want < this.sent && p.mode !== 'off' && p.mode !== 'fixed') {
      this.lowSince ??= i.now
      if (i.now - this.lowSince < HOLD_BEFORE_DROP_MS) return null
    }
    this.lowSince = null
    this.sent = want
    this.sentAt = i.now
    return want
  }

  /** Forget what the fan has (after a reconnect). */
  reset(): void {
    this.sent = null
    this.sentAt = -Infinity
    this.lowSince = null
  }
}
