// Typical data for every trigger. The pack tests use these to prove each line
// is actually reachable, and the persona picker can use them to preview a
// persona ("hear a sample") without a ride in progress.
import { SEGMENT_KINDS, type CoachContext, type CoachData, type CoachTrigger, type RideKind, type SegmentKind } from './types'

export const SAMPLE_DATA: Readonly<Record<CoachTrigger, CoachData>> = {
  ride_start: { workoutName: 'Sweet Spot 3x12' },
  segment_start: { segmentKind: 'on', targetW: 300, remainingS: 300, durationS: 300, segmentLabel: 'VO2 #2', rep: 2, reps: 5 },
  countdown_10s: { segmentKind: 'on', targetW: 300, remainingS: 10, durationS: 300, rep: 2, reps: 5 },
  halfway: { segmentKind: 'on', power: 296, targetW: 300, remainingS: 150, durationS: 300 },
  last_minute: { segmentKind: 'on', power: 298, targetW: 300, remainingS: 60, durationS: 300 },
  segment_end_success: { segmentKind: 'on', avgW: 302, targetW: 300, pct: 101, rep: 2, reps: 5 },
  segment_end_failed: { segmentKind: 'on', avgW: 255, targetW: 300, pct: 85, rep: 2, reps: 5 },
  under_target: { segmentKind: 'on', power: 270, targetW: 300, erg: true, remainingS: 120 },
  over_target_early: { segmentKind: 'on', power: 345, targetW: 300, erg: false, remainingS: 250 },
  cadence_sag: { segmentKind: 'on', cadence: 78, cadenceAvg: 92, power: 290, targetW: 300 },
  hr_high: { hr: 182, hrCap: 172, power: 250 },
  hr_spike_no_power: { hr: 205, power: 40 },
  stopped_pedaling: { elapsedMin: 23 },
  resumed: { pausedS: 45, elapsedMin: 24 },
  skipped_interval: { segmentLabel: 'VO2 #3' },
  extended_interval: { extraS: 60, segmentLabel: 'VO2 #3' },
  intensity_down: { intensityPct: 95 },
  intensity_up: { intensityPct: 105 },
  wbal_low: { wbalPct: 18, power: 310, targetW: 300 },
  wbal_empty: { wbalPct: 0, power: 300, targetW: 300 },
  pr: { prLabel: '5-minute', power: 341 },
  ftp_test_minute: { minute: 7, projectedFtp: 287, ftpOld: 275, remainingS: 780 },
  ftp_test_result: { ftpOld: 275, ftpNew: 287 },
  workout_complete: { elapsedMin: 62, np: 248, tss: 78, kj: 820 },
  ride_bailed: { elapsedMin: 21, remainingS: 1500 },
  fueling_reminder: { elapsedMin: 45 },
  hydration_reminder: { elapsedMin: 30 },
  distress: {},
  idle_banter: { elapsedMin: 17, power: 210, cadence: 88 },
}

/** segment_start data for each kind. Warmup, cooldown, free rides and max efforts have no fixed target. */
export const SEGMENT_SAMPLES: Readonly<Record<SegmentKind, CoachData>> = {
  warmup: { segmentKind: 'warmup', remainingS: 600, durationS: 600 },
  steady: { segmentKind: 'steady', targetW: 220, remainingS: 900, durationS: 900 },
  on: { segmentKind: 'on', targetW: 300, remainingS: 300, durationS: 300, segmentLabel: 'VO2 #2', rep: 2, reps: 5 },
  off: { segmentKind: 'off', targetW: 150, remainingS: 180, durationS: 180, rep: 2, reps: 5 },
  ramp: { segmentKind: 'ramp', targetW: 200, remainingS: 900, durationS: 900 },
  freeride: { segmentKind: 'freeride', remainingS: 600, durationS: 600 },
  maxeffort: { segmentKind: 'maxeffort', remainingS: 30, durationS: 30 },
  cooldown: { segmentKind: 'cooldown', remainingS: 600, durationS: 600 },
}

/** A plausible context for a trigger at `now`, with optional data overrides. */
export function sampleContext(
  trigger: CoachTrigger,
  now = 0,
  data: CoachData = {},
  rideKind: RideKind = trigger === 'ftp_test_minute' || trigger === 'ftp_test_result' ? 'ftp-test' : 'workout',
): CoachContext {
  return { now, trigger, data: { ...SAMPLE_DATA[trigger], ...data }, rideKind, intensityFactor: 0.88 }
}

const moment = (trigger: CoachTrigger, data: CoachData, rideKind: RideKind = 'workout'): CoachContext => ({
  now: 0,
  trigger,
  data,
  rideKind,
  intensityFactor: 0.88,
})

/**
 * The interesting variants of a trigger: every segment kind, last reps, on and
 * off target, early and late FTP-test minutes, FTP gains and drops... Together
 * they satisfy every criterion the built-in packs use.
 */
export function sampleVariants(trigger: CoachTrigger): CoachContext[] {
  switch (trigger) {
    case 'ride_start':
      return (['workout', 'free', 'route', 'ftp-test'] as const).map((k) => sampleContext('ride_start', 0, {}, k))
    case 'segment_start':
      return [
        ...SEGMENT_KINDS.map((k) => moment('segment_start', SEGMENT_SAMPLES[k])),
        moment('segment_start', { ...SEGMENT_SAMPLES.on, rep: 5, reps: 5 }),
        moment('segment_start', { segmentKind: 'on', targetW: 300, remainingS: 300 }),
      ]
    case 'countdown_10s':
      return [sampleContext('countdown_10s'), moment('countdown_10s', { segmentKind: 'maxeffort', remainingS: 10, durationS: 30 })]
    case 'halfway':
    case 'last_minute':
      return [290, 300, 270].map((power) => sampleContext(trigger, 0, { power }))
    case 'segment_end_success':
    case 'segment_end_failed':
      return [sampleContext(trigger), sampleContext(trigger, 0, { rep: 5, reps: 5 })]
    case 'under_target':
      return [sampleContext('under_target'), sampleContext('under_target', 0, { power: 240 })]
    case 'ftp_test_minute':
      return [2, 7, 18].flatMap((minute) => [
        sampleContext('ftp_test_minute', 0, { minute }),
        sampleContext('ftp_test_minute', 0, { minute, ftpOld: undefined }),
      ])
    case 'ftp_test_result':
      return [
        sampleContext('ftp_test_result'),
        sampleContext('ftp_test_result', 0, { ftpOld: 287, ftpNew: 275 }),
        sampleContext('ftp_test_result', 0, { ftpOld: 280, ftpNew: 280 }),
        sampleContext('ftp_test_result', 0, { ftpOld: undefined }),
      ]
    default:
      return [sampleContext(trigger)]
  }
}
