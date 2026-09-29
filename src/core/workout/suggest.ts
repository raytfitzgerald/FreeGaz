// "What should I ride next?" from form (TSB), how the last ride felt (RPE)
// and recent load. Deliberately simple rules a coach would sign off on.

export interface SuggestInput {
  hasFtp: boolean
  daysSinceTest: number | null
  /** Training stress balance today (form). */
  tsb: number | null
  /** RPE (1–10) of the most recent ride, if rated. */
  lastRpe: number | null
  /** Rides in the last 7 days with IF ≥ 0.85 or TSS ≥ 80. */
  hardRidesLast7: number
  /** Hours since the last ride ended. */
  hoursSinceLastRide: number | null
}

export interface Suggestion {
  workoutId: string
  reason: string
}

export const RETEST_AFTER_DAYS = 42

export function suggestNextWorkout(i: SuggestInput): Suggestion {
  if (!i.hasFtp) return { workoutId: 'builtin:ramp-test', reason: 'Find your FTP first: every workout is sized to it, and the ramp test takes about 20 minutes.' }
  const tsb = i.tsb ?? 0
  if ((i.lastRpe ?? 0) >= 9 && (i.hoursSinceLastRide ?? 99) < 36) return { workoutId: 'builtin:recovery-spin-30', reason: 'Your last ride felt close to all-out. Spin easy today and let it land.' }
  if (tsb < -25) return { workoutId: 'builtin:recovery-spin-30', reason: `You're carrying a lot of fatigue (form ${Math.round(tsb)}). Easy spinning today, hard work later.` }
  if (i.daysSinceTest !== null && i.daysSinceTest > RETEST_AFTER_DAYS && tsb >= -10) {
    return { workoutId: 'builtin:ftp-test-20min', reason: `Your last FTP test was ${Math.round(i.daysSinceTest / 7)} weeks ago and you're fresh enough to test.` }
  }
  if (tsb < -10 || i.hardRidesLast7 >= 3) return { workoutId: 'builtin:endurance-60', reason: 'A solid week already. An easy aerobic hour builds fitness without digging the hole deeper.' }
  if (tsb > 5) return { workoutId: 'builtin:vo2max-5x4', reason: `You're fresh (form +${Math.round(tsb)}): a good day to go hard.` }
  return { workoutId: 'builtin:sweet-spot-3x12', reason: 'Balanced load: sweet spot gives the most fitness for the fatigue.' }
}
