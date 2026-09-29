// Rates from cumulative revolution counters (CSC and CPS wheel/crank data).
// Sensors report a running revolution count and the time of the latest
// revolution on their own clock, so the rate is Δrevs / Δtime between two
// distinct events. Both counters roll over; notifications repeat the same
// event while the rider coasts; and a long silence can hide a whole
// event-time rollover. The calculator handles all three.

/** Event times are uint16 on every profile. */
const EVENT_TIME_MODULUS = 0x10000

export interface RevolutionRateOptions {
  /** Event-time clock: 1024 Hz (CSC, CPS crank) or 2048 Hz (CPS wheel). */
  timeResolutionHz: 1024 | 2048
  /** Width of the revolution counter: 16 (crank) or 32 (wheel). */
  revBits: 16 | 32
  /** Host ms with no new revolution before the rate drops to 0. Default 2500. */
  staleMs?: number
  /** Rates above this many rev/min are glitches and ignored. Default 250 (cranks); raise it for wheels. */
  maxRatePerMin?: number
}

export class RevolutionRateCalculator {
  private readonly hz: number
  private readonly revModulus: number
  private readonly staleMs: number
  private readonly maxRate: number
  /**
   * Past this host-time gap the uint16 event time may have rolled over more
   * than once, so Δtime is ambiguous. It is 15/16 of one rollover period
   * (60 s at 1024 Hz, 30 s at 2048 Hz), leaving margin for BLE latency.
   */
  private readonly maxGapMs: number
  /** The last new revolution event: the reference that deltas are taken from. */
  private ref: { revs: number; time: number } | null = null
  private refAtMs = 0
  private lastUpdateMs = 0
  private rate: number | null = null

  constructor(opts: RevolutionRateOptions) {
    this.hz = opts.timeResolutionHz
    this.revModulus = 2 ** opts.revBits
    this.staleMs = opts.staleMs ?? 2500
    this.maxRate = opts.maxRatePerMin ?? 250
    this.maxGapMs = ((EVENT_TIME_MODULUS / this.hz) * 1000 * 15) / 16
  }

  /**
   * Feeds one notification's counter and event time, stamped with the host's
   * monotonic clock. Returns revolutions per minute, or null while no rate is
   * known yet: on the first sample, and again after a restart (see maxGapMs).
   *
   * - Same revolution count as the reference (a repeated notification, or
   *   coasting): the last rate is kept until `staleMs` has passed since the
   *   reference event arrived, then 0.
   * - A rate above `maxRatePerMin`, or revolutions with no time elapsed: the
   *   previous value is returned, and the sample becomes the new reference.
   *   Re-basing means a counter that jumps (a sensor reset, a corrupted
   *   sample) costs one or two rejected samples instead of wedging the
   *   calculator.
   */
  update(revs: number, eventTime: number, nowMs: number): number | null {
    if (!Number.isFinite(revs) || !Number.isFinite(eventTime) || !Number.isFinite(nowMs)) {
      throw new RangeError(`RevolutionRateCalculator: non-finite sample (${revs}, ${eventTime}, ${nowMs})`)
    }
    const ref = this.ref
    const sinceUpdate = nowMs - this.lastUpdateMs
    this.lastUpdateMs = nowMs
    if (ref === null || sinceUpdate > this.maxGapMs) return this.restart(revs, eventTime, nowMs)

    const dRevs = mod(revs - ref.revs, this.revModulus)
    if (dRevs === 0) {
      if (nowMs - this.refAtMs >= this.staleMs) this.rate = 0
      return this.rate
    }
    if (nowMs - this.refAtMs > this.maxGapMs) return this.restart(revs, eventTime, nowMs)

    const dTicks = mod(eventTime - ref.time, EVENT_TIME_MODULUS)
    this.ref = { revs, time: eventTime }
    this.refAtMs = nowMs
    const rpm = dTicks === 0 ? Infinity : (dRevs * 60 * this.hz) / dTicks
    if (rpm > this.maxRate) return this.rate
    this.rate = rpm
    return rpm
  }

  /** Forgets all history (e.g. after a reconnect); the next sample returns null. */
  reset(): void {
    this.ref = null
    this.rate = null
  }

  private restart(revs: number, eventTime: number, nowMs: number): null {
    this.ref = { revs, time: eventTime }
    this.refAtMs = nowMs
    this.rate = null
    return null
  }
}

function mod(a: number, m: number): number {
  return ((a % m) + m) % m
}

/** Wheel speed in m/s from a wheel rate (rev/min) and circumference (mm). */
export function wheelSpeedMps(revsPerMin: number, circumferenceMm: number): number {
  return (revsPerMin / 60) * (circumferenceMm / 1000)
}
