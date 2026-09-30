// Coaching personas: the trigger vocabulary, line templates, persona packs and
// the engine's input and output. Everything here is plain data, so packs can be
// written as TS modules or loaded from user JSON (see validate.ts).

export const SEGMENT_KINDS = ['warmup', 'steady', 'on', 'off', 'ramp', 'freeride', 'maxeffort', 'cooldown'] as const
export type SegmentKind = (typeof SEGMENT_KINDS)[number]

/** Kinds that count as hard efforts unless the caller says otherwise with `data.hard`. */
export const HARD_SEGMENT_KINDS: readonly SegmentKind[] = ['on', 'ramp', 'maxeffort']

export function isSegmentKind(v: unknown): v is SegmentKind {
  return typeof v === 'string' && (SEGMENT_KINDS as readonly string[]).includes(v)
}

export const COACH_TRIGGERS = [
  'ride_start',
  /** A segment begins. Send `segmentKind` (and `hard` to override the kind's default). */
  'segment_start',
  /** The last 10 s before a hard segment. `targetW`/`segmentKind`/`durationS` describe the upcoming segment; `remainingS` is the seconds until it starts. */
  'countdown_10s',
  /** Halfway through a hard segment of at least 60 s. */
  'halfway',
  /** The last minute of a hard segment of at least 3 min. */
  'last_minute',
  'segment_end_success',
  /** A hard segment ended with its average below 90 % of target. */
  'segment_end_failed',
  /** More than 5 % under the ERG target for 8 s, outside the 8 s after a target change. */
  'under_target',
  /** More than 10 % over target in the first 20 % of a long (3 min+) non-ERG interval. */
  'over_target_early',
  /** Cadence at least 10 rpm below the segment average. */
  'cadence_sag',
  /** Heart rate above the zone cap. */
  'hr_high',
  /** A heart-rate spike without matching power: probably a strap glitch, worth a light joke. */
  'hr_spike_no_power',
  'stopped_pedaling',
  'resumed',
  'skipped_interval',
  'extended_interval',
  'intensity_down',
  'intensity_up',
  /** W′bal below 25 %. */
  'wbal_low',
  'wbal_empty',
  /** A personal record. Send `prLabel` ("5-minute"). */
  'pr',
  /** Every minute of an FTP test. Send `minute` and `projectedFtp`. */
  'ftp_test_minute',
  /** Send `ftpNew` and, when known, `ftpOld`. */
  'ftp_test_result',
  'workout_complete',
  /** The ride ended early. */
  'ride_bailed',
  'fueling_reminder',
  'hydration_reminder',
  /** Abnormal heart rate or a sudden stop. Always speaks, then forces the supportive tone. */
  'distress',
  'idle_banter',
] as const
export type CoachTrigger = (typeof COACH_TRIGGERS)[number]

export function isCoachTrigger(v: unknown): v is CoachTrigger {
  return typeof v === 'string' && (COACH_TRIGGERS as readonly string[]).includes(v)
}

/**
 * Triggers every pack covers with at least MIN_LINES_COMMON lines. For
 * segment_start this counts lines for hard segments; easy kinds need
 * MIN_LINES_OTHER each, like every trigger not listed here.
 */
export const COMMON_TRIGGERS = [
  'ride_start',
  'segment_start',
  'countdown_10s',
  'halfway',
  'last_minute',
  'segment_end_success',
  'segment_end_failed',
  'under_target',
  'cadence_sag',
  'stopped_pedaling',
  'skipped_interval',
  'intensity_down',
  'wbal_low',
  'pr',
  'ftp_test_minute',
  'ftp_test_result',
  'workout_complete',
  'ride_bailed',
  'fueling_reminder',
  'idle_banter',
] as const satisfies readonly CoachTrigger[]

export const MIN_LINES_COMMON = 6
export const MIN_LINES_OTHER = 2

/**
 * The definitions behind the triggers, for whoever detects them in the ride
 * loop. The engine never measures anything itself: it only reacts to triggers.
 */
export const TRIGGER_THRESHOLDS = {
  countdownS: 10,
  halfwayMinS: 60,
  lastMinuteMinS: 180,
  /** segment_end_failed below this average, % of target. */
  failedBelowPct: 90,
  underTargetPct: 5,
  underTargetHoldS: 8,
  /** under_target is not raised this long after a target change. */
  targetChangeGraceS: 8,
  overTargetEarlyPct: 10,
  /** over_target_early only fires in this leading fraction of the interval... */
  overTargetEarlyFraction: 0.2,
  /** ...and only for intervals at least this long. */
  overTargetEarlyMinS: 180,
  cadenceSagRpm: 10,
  wbalLowPct: 25,
} as const

export type RideKind = 'free' | 'workout' | 'route' | 'ftp-test'

/**
 * The rider's language setting. Clean: no swearing. Mild: damn, hell, bloody
 * and friends, with every topic rule still on. Unhinged: no language limits,
 * and the coach reaches for its sweariest lines first.
 */
export const PROFANITY_LEVELS = ['clean', 'mild', 'unhinged'] as const
export type Profanity = (typeof PROFANITY_LEVELS)[number]
/** Callers from before the three levels passed a boolean: true meant no limits. */
export type ProfanitySetting = Profanity | boolean

export function toProfanity(v: ProfanitySetting): Profanity {
  return v === true ? 'unhinged' : v === false ? 'clean' : v
}

/** 1 = gentle, 5 = savage. */
export type Spice = 1 | 2 | 3 | 4 | 5

export const CRITERION_OPS = ['>', '>=', '<', '<=', '==', '!='] as const
export type CriterionOp = (typeof CRITERION_OPS)[number]

/** A condition on one fact. A missing fact fails every criterion, including '!='. */
export interface Criterion {
  key: string
  op: CriterionOp
  value: number | string | boolean
}

/**
 * One canned line. `text` may contain `{placeholders}` naming data keys; a line
 * whose placeholders are not all present in the context is not eligible.
 * The line with the most criteria that all hold wins (Valve's dynamic-dialog
 * rule), ties are broken by weight × RNG, and recently used lines are skipped.
 */
export interface CoachLineTemplate {
  id: string
  text: string
  triggers: readonly CoachTrigger[]
  /** The lowest spice level at which this line may be used. */
  spice: Spice
  /** Contains profanity; used only when profanity is enabled. */
  profanity?: boolean
  criteria?: readonly Criterion[]
  /** Relative weight among equally specific lines. Default 1. */
  weight?: number
}

/** Hints for the TTS layer. rate and pitch follow Web Speech (1 = normal). */
export interface VoiceHint {
  rate: number
  pitch: number
  /** macOS voice names in order of preference, e.g. 'Daniel', 'Alex', 'Samantha'. */
  preferVoices: readonly string[]
}

export interface PersonaMeta {
  id: string
  name: string
  tagline: string
  voiceHint?: VoiceHint
}

export interface PersonaPack {
  meta: PersonaMeta
  lines: readonly CoachLineTemplate[]
}

/** null and undefined both mean "missing" (missing is not zero). */
export type CoachDataValue = number | string | boolean | null | undefined
export type CoachData = Record<string, CoachDataValue>

export interface CoachContext {
  /** Milliseconds on any monotonic clock, used consistently by the caller. */
  now: number
  trigger: CoachTrigger
  /** Facts about the moment. See DATA_KEYS for the standard keys. */
  data: CoachData
  rideKind: RideKind
  intensityFactor?: number
}

/** The standard data keys, with their meaning. Placeholders and criteria must use these. */
export const DATA_KEYS = {
  power: 'Current power, W (use a 3 s average).',
  targetW: 'Target power, W. For countdown_10s, the upcoming target.',
  avgW: 'Average power of the segment that just ended, W.',
  pct: 'Percent of target. Derived from power and targetW; for segment_end_* send the segment average.',
  hr: 'Heart rate, bpm.',
  hrCap: 'Heart-rate cap of the current zone, bpm.',
  cadence: 'Cadence, rpm.',
  cadenceAvg: 'Average cadence of the current segment, rpm.',
  segmentKind: `One of: ${SEGMENT_KINDS.join(', ')}. For countdown_10s, the upcoming segment.`,
  hard: 'Whether the segment is a hard effort. Derived from segmentKind when omitted.',
  segmentLabel: 'Segment label from the workout, e.g. "VO2 #3".',
  rep: 'Repetition number within an interval set, 1-based.',
  reps: 'Number of repetitions in the set.',
  remainingS: 'Seconds left in the segment. For segment_start, its full length; for countdown_10s, the seconds until it starts (its length is durationS).',
  durationS: 'Length of the segment, s.',
  elapsedS: 'Moving time so far, s.',
  elapsedMin: 'Moving time so far, min. Derived from elapsedS.',
  pausedS: 'How long the rider was stopped (resumed), s.',
  extraS: 'Seconds added to the interval (extended_interval).',
  intensityPct: 'Workout intensity after the change, % (intensity_up/intensity_down).',
  wbalPct: 'W′bal remaining, % of W′.',
  prLabel: 'PR duration as an adjective: "5-minute", "30-second".',
  minute: 'FTP test minute, 1-based.',
  projectedFtp: 'FTP projected from the test so far, W.',
  ftpOld: 'FTP before the test, W.',
  ftpNew: 'FTP from the test, W.',
  np: 'Normalized power so far, W.',
  tss: 'Training stress score so far.',
  kj: 'Work so far, kJ.',
  workoutName: 'Workout name.',
  erg: 'Whether ERG mode is on.',
  // Derived by the engine when their inputs are present.
  deficitW: 'Derived: targetW − power (only rendered when positive).',
  surplusW: 'Derived: power − targetW (only rendered when positive).',
  pctUnder: 'Derived: 100 − pct (only rendered when positive).',
  pctOver: 'Derived: pct − 100 (only rendered when positive).',
  cadenceDrop: 'Derived: cadenceAvg − cadence (only rendered when positive).',
  torqueNm: 'Derived: crank torque from power and cadence, N·m.',
  ftpGain: 'Derived: ftpNew − ftpOld (only rendered when positive).',
  ftpDrop: 'Derived: ftpOld − ftpNew (only rendered when positive).',
  projectedGain: 'Derived: projectedFtp − ftpOld (only rendered when positive).',
  repsLeft: 'Derived: reps − rep (only rendered when positive).',
  rideKind: 'Derived from the context: free, workout, route or ftp-test.',
  intensityFactor: 'From the context: intensity factor so far (0.85).',
} as const satisfies Record<string, string>

export type DataKey = keyof typeof DATA_KEYS

export function isDataKey(k: string): k is DataKey {
  return Object.prototype.hasOwnProperty.call(DATA_KEYS, k)
}

/**
 * Priority tiers, highest first: safety > interval cues and milestones >
 * coaching > banter. Cues bypass the global cooldown and the hard-effort rate
 * limit; coaching bypasses the global cooldown only.
 */
export const PRIORITY = { banter: 0, coaching: 1, cue: 2, safety: 3 } as const
export type CoachPriority = (typeof PRIORITY)[keyof typeof PRIORITY]

/** What the engine asks the app to say. */
export interface CoachLine {
  /** Display text: watts as integers, durations as m:ss from 60 s. */
  text: string
  /** The same line for TTS: "2:05" becomes "2 minutes 5 seconds", "W′bal" becomes "W prime balance". */
  speech: string
  /** The pack that produced the line: 'professional' while the supportive tone is forced. */
  personaId: string
  trigger: CoachTrigger
  priority: CoachPriority
  lineId: string
}
