// The ride-along race: a cartoon coach on a bike next to the rider, pacing at
// the workout's target (or an easy endurance pace on a free ride). Push more
// watts than the coach and you pull away; ease off and the coach rides off
// ahead and shouts about it. Nothing here is physics, just a feel: speeds
// scale with the cube root of power, like on a real flat road.

/** The gap is held within this many metres either way, so both stay on screen. */
export const MAX_GAP_M = 60
/** On a free ride the coach sits at this fraction of FTP. */
export const FREE_RIDE_PACE = 0.65
/** Speed at 200 W when nothing better is known, km/h (a flat road on a road bike). */
const KMH_AT_200W = 32
/** How close counts as riding side by side, m. */
const TOGETHER_M = 4

export interface RideAlongState {
  /** Coach position relative to the rider, m: positive is ahead. */
  gapM: number
  /** Distance the road has scrolled, m (for the lane markings). */
  roadM: number
}

export const START: RideAlongState = { gapM: 0, roadM: 0 }

/** The coach's watts: the target when there is one, else an endurance pace from FTP. */
export function coachPaceW(targetW: number | null, ftpW: number): number {
  if (targetW !== null && targetW > 0) return targetW
  return Math.max(50, Math.round(ftpW * FREE_RIDE_PACE))
}

/** A flat-road speed for some watts, km/h. 0 W is standing still. */
export function speedForPower(watts: number): number {
  return watts > 0 ? KMH_AT_200W * Math.cbrt(watts / 200) : 0
}

/**
 * Moves the race on by dtS seconds. Missing power counts as coasting (not
 * zero effort for the chart, just no pedalling on screen). The rider's speed
 * comes from the trainer when it reports one.
 */
export function stepRideAlong(s: RideAlongState, dtS: number, rider: { watts: number | null; kmh: number | null }, coachW: number): RideAlongState {
  const dt = Math.min(Math.max(dtS, 0), 0.5)
  const riderKmh = rider.kmh !== null && rider.kmh > 0 ? rider.kmh : speedForPower(rider.watts ?? 0)
  const riderW = rider.watts ?? 0
  // the coach's speed from the rider's, by the power ratio, so a trainer that reads fast or slow doesn't matter
  const coachKmh = riderW > 0 && riderKmh > 0 ? riderKmh * Math.cbrt(coachW / riderW) : speedForPower(coachW)
  const gapM = clamp(s.gapM + ((coachKmh - riderKmh) / 3.6) * dt, -MAX_GAP_M, MAX_GAP_M)
  return { gapM, roadM: (s.roadM + (riderKmh / 3.6) * dt) % 10_000 }
}

export type RideAlongMood = 'together' | 'coach-ahead' | 'rider-ahead'

export function rideAlongMood(gapM: number): RideAlongMood {
  if (Math.abs(gapM) < TOGETHER_M) return 'together'
  return gapM > 0 ? 'coach-ahead' : 'rider-ahead'
}

/** "Coach 12 m ahead", "You're 8 m clear", "Side by side". */
export function gapLabel(gapM: number, coachName: string): string {
  const m = Math.round(Math.abs(gapM))
  switch (rideAlongMood(gapM)) {
    case 'together':
      return 'Side by side'
    case 'coach-ahead':
      return `${coachName} ${m >= MAX_GAP_M ? 'is waiting up the road' : `${m} m ahead`}`
    case 'rider-ahead':
      return m >= MAX_GAP_M ? `You dropped ${coachName}` : `You're ${m} m clear`
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
