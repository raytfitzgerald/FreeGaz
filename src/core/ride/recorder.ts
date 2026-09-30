// RideRecorder: turns the SensorHub's irregular samples into exactly one
// record per second of MOVING time.
//
//  * Record k covers the monotonic span [slotStart_k, slotStart_k + 1000).
//  * Power/cadence/speed are exact time-weighted means over the slot
//    (sample-and-hold, TTL-limited), so a tick that arrives 3 s late simply
//    emits 3 correct records and kJ equals the true integral.
//  * HR, temperatures etc. are the value holding at the slot end.
//  * Missing is null (FIT invalid), never 0.
//  * pause/lap requests take effect at the next slot boundary, so moving
//    time is always a whole number of seconds and records stay contiguous.
import type { Metric } from '../sensors/types'
import type { SensorHub } from '../sensors/hub'
import type { Clock } from '../time/clock'

export interface RideRecord {
  /** Moving-time index: this record covers moving seconds [t, t+1). */
  t: number
  /** Wall epoch ms at the end of the slot, whole seconds, strictly increasing. */
  ts: number
  power: number | null
  cadence: number | null
  hr: number | null
  /** m/s */
  speed: number | null
  /** cumulative metres */
  distance: number
  altitude: number | null
  grade: number | null
  targetW: number | null
  lrBalance: number | null
  coreTemp: number | null
  skinTemp: number | null
  smo2: number | null
  /** Lap index (0-based). */
  lap: number
  /** RR intervals (ms) that arrived during the slot. */
  rr: number[]
}

/** Extra per-slot values the ride session provides (workout target, route state...). */
export interface SlotExtras {
  targetW?: number | null
  altitude?: number | null
  grade?: number | null
  /** Overrides trainer speed (virtual speed from physics on routes). */
  speed?: number | null
}

export class RideRecorder {
  private slotStart: number | null = null
  private moving = 0
  private paused = true
  private pauseRequested = false
  private lapRequested = false
  private lap = 0
  private lastTs = 0
  private distance = 0

  constructor(
    private readonly hub: SensorHub,
    private readonly clock: Clock,
    /** Called for each completed slot to supply target/route values. */
    private readonly extras: (slotEndMono: number) => SlotExtras = () => ({}),
  ) {}

  get movingSeconds(): number {
    return this.moving
  }
  get isPaused(): boolean {
    return this.paused
  }
  get lapIndex(): number {
    return this.lap
  }
  get distanceM(): number {
    return this.distance
  }

  /** Exact moving time in ms at `now`, including the partial current slot. */
  movingMsAt(now: number): number {
    if (this.paused || this.slotStart === null) return this.moving * 1000
    return this.moving * 1000 + Math.max(0, Math.min(999, now - this.slotStart))
  }

  /** Begin (or resume) recording at `now`. */
  start(now = this.clock.now()): void {
    // resumed before a requested pause took effect: cancel it, or the slot boundary would pause a riding session
    if (!this.paused) {
      this.pauseRequested = false
      return
    }
    this.paused = false
    this.pauseRequested = false
    this.slotStart = now
  }

  resume(now = this.clock.now()): void {
    this.start(now)
  }

  /** Pause takes effect at the end of the current slot. */
  requestPause(): void {
    if (!this.paused) this.pauseRequested = true
  }

  /** Immediate pause, discarding the partial slot (used when the app is suspended). */
  pauseNow(): void {
    this.paused = true
    this.pauseRequested = false
    this.slotStart = null
  }

  requestLap(): void {
    this.lapRequested = true
  }

  /** Emits every slot completed by `now` (0..n records). */
  collect(now = this.clock.now()): RideRecord[] {
    const out: RideRecord[] = []
    if (this.paused || this.slotStart === null) return out

    let slot: number = this.slotStart
    while (slot + 1000 <= now) {
      const a: number = slot
      const b: number = a + 1000
      out.push(this.buildRecord(a, b))
      this.moving++
      slot = b
      this.slotStart = b
      if (this.lapRequested) {
        this.lap++
        this.lapRequested = false
      }
      if (this.pauseRequested) {
        this.paused = true
        this.pauseRequested = false
        this.slotStart = null
        break
      }
    }
    return out
  }

  private buildRecord(a: number, b: number): RideRecord {
    const hub = this.hub
    // Per-slot, stateless source choice: best-priority source with data in this second.
    const mean = (m: Metric) => {
      const s = hub.pickSource(m, a, b)
      return s ? hub.meanOver(m, a, b, s) : null
    }
    const at = (m: Metric) => {
      const s = hub.pickSource(m, b - hub.ttlFor(m), b + 1)
      return s ? hub.valueAt(m, b, s) : null
    }
    const ex = this.extras(b)
    const speed = ex.speed !== undefined ? ex.speed : mean('speed')
    if (speed !== null && speed > 0) this.distance += speed

    const wall = Math.round(this.clock.wallMs(b) / 1000) * 1000
    const ts = Math.max(wall, this.lastTs + 1000)
    this.lastTs = ts

    return {
      t: this.moving,
      ts,
      power: roundOrNull(mean('power'), 0),
      cadence: roundOrNull(mean('cadence'), 0),
      hr: roundOrNull(at('hr'), 0),
      speed: roundOrNull(speed, 3),
      distance: Math.round(this.distance * 100) / 100,
      altitude: ex.altitude ?? null,
      grade: ex.grade ?? null,
      targetW: ex.targetW ?? null,
      lrBalance: roundOrNull(at('lrBalance'), 1),
      coreTemp: roundOrNull(at('coreTemp'), 2),
      skinTemp: roundOrNull(at('skinTemp'), 2),
      smo2: roundOrNull(at('smo2'), 1),
      lap: this.lap,
      rr: hub.rrBetween(a, b),
    }
  }
}

function roundOrNull(v: number | null, dp: number): number | null {
  if (v === null || !Number.isFinite(v)) return null
  const f = 10 ** dp
  return Math.round(v * f) / f
}
