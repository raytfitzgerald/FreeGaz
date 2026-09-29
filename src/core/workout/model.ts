// The workout model. It mirrors Zwift .zwo semantics closely so .zwo files
// round-trip losslessly, while allowing absolute-watt targets and FTP-test
// metadata that .zwo cannot express.

/** A power target: a fraction of FTP (0.88 = 88 %) or absolute watts. */
export type PowerTarget = { unit: 'ftp'; value: number } | { unit: 'watts'; value: number }

export interface CadenceTarget {
  /** Single target rpm, or a range when low/high are both set. */
  rpm?: number
  low?: number
  high?: number
}

/** On-screen / spoken cue, offset in seconds from the start of its segment. */
export interface TextEvent {
  offsetS: number
  message: string
  durationS?: number
}

interface SegmentBase {
  /** Optional label shown in the player ("Main set", "Blowout"...). */
  label?: string
  text?: TextEvent[]
  cadence?: CadenceTarget
  /** Zwift's show_avg: show the running average during this segment. */
  showAverage?: boolean
}

export interface SteadySegment extends SegmentBase {
  kind: 'steady'
  durationS: number
  power: PowerTarget
}

/** Linear ramp from → to. Warmup/cooldown are ramps with a role, as in .zwo. */
export interface RampSegment extends SegmentBase {
  kind: 'ramp'
  role: 'warmup' | 'cooldown' | 'ramp'
  durationS: number
  from: PowerTarget
  to: PowerTarget
}

export interface IntervalPart {
  durationS: number
  power: PowerTarget
  cadence?: CadenceTarget
}

export interface IntervalsSegment extends SegmentBase {
  kind: 'intervals'
  repeat: number
  on: IntervalPart
  off: IntervalPart
}

/** ERG off; rider chooses the effort (resistance / flat SIM). */
export interface FreeRideSegment extends SegmentBase {
  kind: 'freeride'
  durationS: number
  /** Zwift FlatRoad: keep the trainer on a flat 0 % grade. Default true. */
  flatRoad?: boolean
}

/** All-out effort, ERG off (Zwift MaxEffort). */
export interface MaxEffortSegment extends SegmentBase {
  kind: 'maxeffort'
  durationS: number
}

export type Segment = SteadySegment | RampSegment | IntervalsSegment | FreeRideSegment | MaxEffortSegment

export type FtpTestProtocol = '20min' | 'ramp' | '8min' | 'kolie-moore'

export interface FtpTestSpec {
  protocol: FtpTestProtocol
  /**
   * Label of the segment whose power determines FTP (e.g. "20-min test effort").
   * For 'ramp' it labels the ramp segments; the best 1-min window counts.
   */
  effortLabel: string
  /** FTP = factor × metric (0.95 for 20-min, 0.75 × best 1-min for ramp, 0.9 for 8-min). */
  factor: number
}

export type WorkoutSource = 'builtin' | 'user' | 'import' | 'ai'

export interface Workout {
  id: string
  name: string
  author?: string
  description?: string
  tags: string[]
  sportType: 'bike'
  segments: Segment[]
  source: WorkoutSource
  /** Set on FTP test workouts. */
  ftpTest?: FtpTestSpec
  /** Epoch ms. */
  createdAt?: number
  updatedAt?: number
}
