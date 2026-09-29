// Training zones as fractions of a reference value (FTP, LTHR or max HR).
// Boundaries are contiguous: lo is inclusive, hi is exclusive, and the top
// zone is open-ended (hi = null).

import { isValidSample, type Sample } from './sample'

export interface Zone {
  /** 1-based position in its scheme. */
  readonly id: number
  readonly name: string
  /** Short label for charts, e.g. "Z4" or "Z5a". */
  readonly short: string
  /** Lower bound as a fraction of the reference (inclusive). */
  readonly lo: number
  /** Upper bound as a fraction of the reference (exclusive), or null if open-ended. */
  readonly hi: number | null
}

export interface ZoneScheme {
  readonly id: string
  readonly name: string
  readonly reference: 'ftp' | 'lthr' | 'maxHr'
  readonly zones: readonly Zone[]
}

/**
 * Coggan power zones, as fractions of FTP. The published ranges are
 * Z1 < 55 %, Z2 56–75, Z3 76–90, Z4 91–105, Z5 106–120, Z6 121–150 and Z7 > 150.
 * Each upper bound here is extended to the next integer percent, so there are no gaps.
 */
export const COGGAN_POWER: ZoneScheme = {
  id: 'coggan-power',
  name: 'Coggan power (% FTP)',
  reference: 'ftp',
  zones: [
    { id: 1, name: 'Active Recovery', short: 'Z1', lo: 0, hi: 0.56 },
    { id: 2, name: 'Endurance', short: 'Z2', lo: 0.56, hi: 0.76 },
    { id: 3, name: 'Tempo', short: 'Z3', lo: 0.76, hi: 0.91 },
    { id: 4, name: 'Threshold', short: 'Z4', lo: 0.91, hi: 1.06 },
    { id: 5, name: 'VO2max', short: 'Z5', lo: 1.06, hi: 1.21 },
    { id: 6, name: 'Anaerobic', short: 'Z6', lo: 1.21, hi: 1.51 },
    { id: 7, name: 'Neuromuscular', short: 'Z7', lo: 1.51, hi: null },
  ],
}

/**
 * Joe Friel's cycling heart-rate zones, as fractions of lactate-threshold HR.
 * The published ranges are Z1 < 81 %, Z2 81–89, Z3 90–93, Z4 94–99, Z5a 100–102,
 * Z5b 103–106 and Z5c > 106. They are made contiguous in the same way as COGGAN_POWER.
 */
export const FRIEL_HR_LTHR: ZoneScheme = {
  id: 'friel-hr-lthr',
  name: 'Friel heart rate (% LTHR)',
  reference: 'lthr',
  zones: [
    { id: 1, name: 'Recovery', short: 'Z1', lo: 0, hi: 0.81 },
    { id: 2, name: 'Aerobic', short: 'Z2', lo: 0.81, hi: 0.9 },
    { id: 3, name: 'Tempo', short: 'Z3', lo: 0.9, hi: 0.94 },
    { id: 4, name: 'SubThreshold', short: 'Z4', lo: 0.94, hi: 1.0 },
    { id: 5, name: 'SuperThreshold', short: 'Z5a', lo: 1.0, hi: 1.03 },
    { id: 6, name: 'Aerobic Capacity', short: 'Z5b', lo: 1.03, hi: 1.07 },
    { id: 7, name: 'Anaerobic Capacity', short: 'Z5c', lo: 1.07, hi: null },
  ],
}

/**
 * Five heart-rate zones as fractions of max HR (50–60 / 60–70 / 70–80 / 80–90 / 90–100 %).
 * Readings below 50 % fall in no zone. Z5 is open-ended so that a max HR set too low still counts.
 */
export const MAX_HR_5: ZoneScheme = {
  id: 'max-hr-5',
  name: 'Heart rate (% max HR)',
  reference: 'maxHr',
  zones: [
    { id: 1, name: 'Very Light', short: 'Z1', lo: 0.5, hi: 0.6 },
    { id: 2, name: 'Light', short: 'Z2', lo: 0.6, hi: 0.7 },
    { id: 3, name: 'Moderate', short: 'Z3', lo: 0.7, hi: 0.8 },
    { id: 4, name: 'Hard', short: 'Z4', lo: 0.8, hi: 0.9 },
    { id: 5, name: 'Maximum', short: 'Z5', lo: 0.9, hi: null },
  ],
}

// Index of the zone containing value/reference, or -1. Dividing (rather than
// comparing value with lo·reference) keeps exact boundaries exact: 140 W at
// FTP 250 gives exactly the double 0.56.
function zoneIndex(value: number, scheme: ZoneScheme, reference: number): number {
  if (!Number.isFinite(value) || !(reference > 0) || !Number.isFinite(reference)) return -1
  const f = value / reference
  return scheme.zones.findIndex((z) => f >= z.lo && (z.hi === null || f < z.hi))
}

/**
 * The zone that `value` falls in, or null if it lies outside every zone.
 * @param value reading in the reference's unit (W for FTP, bpm for HR)
 * @param reference FTP (W), LTHR (bpm) or max HR (bpm), as the scheme requires
 */
export function zoneFor(value: number, scheme: ZoneScheme, reference: number): Zone | null {
  return scheme.zones[zoneIndex(value, scheme, reference)] ?? null
}

/** Accumulates the time spent in each zone of a scheme. */
export class TimeInZones {
  readonly scheme: ZoneScheme
  readonly reference: number
  private readonly perZone: number[]
  private outside = 0

  /** @param reference FTP (W), LTHR (bpm) or max HR (bpm), as the scheme requires */
  constructor(scheme: ZoneScheme, reference: number) {
    if (!(reference > 0) || !Number.isFinite(reference)) {
      throw new RangeError(`zone reference must be a positive number, got ${reference}`)
    }
    this.scheme = scheme
    this.reference = reference
    this.perZone = scheme.zones.map(() => 0)
  }

  /**
   * Adds `dtS` seconds at reading `v`. Missing readings (null) are ignored.
   * Readings outside every zone are added to unzonedS.
   * @param v reading in the reference's unit, or null
   * @param dtS seconds this reading covers (default 1)
   */
  push(v: Sample, dtS = 1): void {
    if (!isValidSample(v) || !(dtS > 0)) return
    const i = zoneIndex(v, this.scheme, this.reference)
    if (i >= 0) this.perZone[i] = (this.perZone[i] ?? 0) + dtS
    else this.outside += dtS
  }

  /** Seconds in each zone, in the same order as scheme.zones (a copy). */
  seconds(): number[] {
    return [...this.perZone]
  }

  /** Seconds with a valid reading that fell outside every zone (for example < 50 % max HR). */
  get unzonedS(): number {
    return this.outside
  }

  /** Clears all accumulated time. */
  reset(): void {
    this.perZone.fill(0)
    this.outside = 0
  }
}

/** Sweet-spot band as fractions of FTP (84–97 %). */
export const SWEET_SPOT = { lo: 0.84, hi: 0.97 } as const

/**
 * True when an intensity (a fraction of FTP, 0.9 = 90 %) is in the sweet spot,
 * 84–97 % FTP inclusive.
 */
export function sweetSpot(fraction: number): boolean {
  return fraction >= SWEET_SPOT.lo && fraction <= SWEET_SPOT.hi
}
