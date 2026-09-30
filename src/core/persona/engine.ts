// CoachEngine: decides whether the coach speaks right now and, if so, which
// line. Selection follows Valve's dynamic-dialog rules: of the lines whose
// criteria all hold, the most specific (most criteria) wins, ties go to
// weight × RNG, and lines spoken recently are skipped. Spice works like CARROT
// Weather's personality dial: a line has a minimum level, and lines near the
// chosen level are favoured.
//
// Pacing, from highest priority down:
//   safety   'distress' always speaks (mute and cooldowns included), then the
//            supportive Professional tone is forced for 5 minutes.
//   cue      interval cues and milestones: skip the global cooldown and the
//            hard-effort limit, but keep their own per-trigger cooldown.
//   coaching skips the global cooldown; keeps a 30 s gap after any line.
//   banter   waits out the global cooldown (45–90 s, default 60 s).
// During a hard effort at most one non-cue line is spoken per minute.
//
// A null result means "not now". Persistent conditions (under_target,
// reminders) should simply be sent again on later ticks.
import { languageAllowed, violatesGuardrails } from './guardrails'
import { PROFESSIONAL } from './packs/professional'
import { buildFacts, isHardKind, renderTemplate, toSpeech, type Facts } from './template'
import {
  PRIORITY,
  toProfanity,
  type CoachContext,
  type CoachLine,
  type CoachLineTemplate,
  type CoachPriority,
  type CoachTrigger,
  type Criterion,
  type PersonaPack,
  type Profanity,
  type ProfanitySetting,
  type Spice,
} from './types'

export const ENGINE_TIMING = {
  defaultCooldownMs: 60_000,
  minCooldownMs: 45_000,
  maxCooldownMs: 90_000,
  defaultPerTriggerCooldownMs: 180_000,
  /** A coaching line waits this long after any line. */
  coachingGapMs: 30_000,
  /** During a hard effort, non-cue lines are at least this far apart. */
  hardEffortGapMs: 60_000,
  /** How long the supportive tone stays forced after 'distress'. */
  distressSupportMs: 5 * 60_000,
  /** Distress triggers closer together than this are one episode: the window extends, nothing is repeated. */
  distressRepeatMs: 30_000,
  /** An FTP test counts as a hard effort this long after its last minute cue. */
  ftpTestHardWindowMs: 90_000,
  /**
   * A clock that jumps back further than this is a new timeline (a new ride), so
   * pacing resets. Smaller backward steps are late events and count as "now".
   */
  newTimelineMs: 60_000,
} as const

export const DEFAULT_MEMORY_SIZE = 40

/** On Unhinged, a profane line is this many times likelier than a clean one of equal fit. */
export const UNHINGED_PROFANITY_BOOST = 8

/** Cue triggers repeat far more often than coaching, so they get shorter cooldowns. */
export const DEFAULT_TRIGGER_COOLDOWNS_MS: Readonly<Partial<Record<CoachTrigger, number>>> = {
  countdown_10s: 30_000,
  /** Hard segment starts only; easy ones use perTriggerCooldownMs. */
  segment_start: 30_000,
  last_minute: 60_000,
  ftp_test_minute: 50_000,
}

/** Interval cues and one-off milestones. segment_start is a cue only for hard segments. */
const CUE_TRIGGERS: ReadonlySet<CoachTrigger> = new Set<CoachTrigger>([
  'countdown_10s',
  'last_minute',
  'ftp_test_minute',
  'ftp_test_result',
  'pr',
  'ride_start',
  'workout_complete',
  'ride_bailed',
])

/** Lines that push for more effort make no sense right after a distress event. */
const SUPPRESSED_WHILE_SUPPORTIVE: ReadonlySet<CoachTrigger> = new Set<CoachTrigger>(['under_target', 'cadence_sag'])

/** Triggers after which no segment is in progress. */
const ENDS_SEGMENT: ReadonlySet<CoachTrigger> = new Set<CoachTrigger>([
  'segment_end_success',
  'segment_end_failed',
  'skipped_interval',
  'ride_start',
  'workout_complete',
  'ride_bailed',
])

/** Said if, somehow, no distress line is available. */
export const DISTRESS_FALLBACK: CoachLineTemplate = {
  id: 'professional.distress.fallback',
  text: 'Ease right off and take a breather. Stop if anything feels wrong.',
  triggers: ['distress'],
  spice: 1,
}

export function priorityOf(trigger: CoachTrigger, facts: Facts): CoachPriority {
  if (trigger === 'distress') return PRIORITY.safety
  if (trigger === 'segment_start') return facts.hard === true ? PRIORITY.cue : PRIORITY.coaching
  if (CUE_TRIGGERS.has(trigger)) return PRIORITY.cue
  if (trigger === 'idle_banter') return PRIORITY.banter
  return PRIORITY.coaching
}

/** A missing fact fails every criterion, '!=' included. Ordering ops need numbers on both sides. */
export function criterionHolds(c: Criterion, facts: Facts): boolean {
  const v = facts[c.key]
  if (v === undefined) return false
  if (c.op === '==') return v === c.value
  if (c.op === '!=') return v !== c.value
  if (typeof v !== 'number' || typeof c.value !== 'number') return false
  if (c.op === '>') return v > c.value
  if (c.op === '>=') return v >= c.value
  if (c.op === '<') return v < c.value
  return v <= c.value
}

export function clampSpice(spice: number): Spice {
  if (!Number.isFinite(spice)) return 1
  return Math.min(5, Math.max(1, Math.round(spice))) as Spice
}

/** Favour lines written for the chosen level: full weight at it, 1/2 one level below, 1/3 two below... */
export function spiceAffinity(lineSpice: Spice, spice: Spice): number {
  return 1 / (1 + Math.max(0, spice - lineSpice))
}

interface PackIndex {
  pack: PersonaPack
  byTrigger: ReadonlyMap<CoachTrigger, readonly CoachLineTemplate[]>
  /** The Professional pack ignores spice. */
  ignoresSpice: boolean
}

function indexPack(pack: PersonaPack): PackIndex {
  const byTrigger = new Map<CoachTrigger, CoachLineTemplate[]>()
  for (const line of pack.lines) {
    for (const t of line.triggers) {
      const list = byTrigger.get(t)
      if (list) list.push(line)
      else byTrigger.set(t, [line])
    }
  }
  return { pack, byTrigger, ignoresSpice: pack.meta.id === PROFESSIONAL.meta.id }
}

const PROFESSIONAL_INDEX = indexPack(PROFESSIONAL)

interface Candidate {
  line: CoachLineTemplate
  text: string
  packId: string
  specificity: number
}

interface SegmentState {
  hard: boolean
  /** Expected end on the caller's clock, when the length is known. */
  endsAt: number | undefined
}

export interface CoachEngineOptions {
  persona: PersonaPack
  spice: Spice
  /** Clean, Mild or Unhinged (a boolean means Clean or Unhinged). */
  profanity: ProfanitySetting
  /** Uniform [0, 1). Default Math.random; pass mulberry32(seed) for reproducible output. */
  rng?: () => number
  /** Global cooldown after any line before banter may follow. Clamped to 45–90 s; default 60 s. */
  cooldownMs?: number
  /** Minimum gap between two lines for the same trigger. Default 180 s. */
  perTriggerCooldownMs?: number
  /** Per-trigger overrides, merged over DEFAULT_TRIGGER_COOLDOWNS_MS (segment_start: hard starts only). */
  triggerCooldownMs?: Partial<Record<CoachTrigger, number>>
  /** How many recent lines are not repeated. Default 40. */
  memorySize?: number
  /** Say the persona's own supportive distress lines instead of Professional's. Default false. */
  distressInCharacter?: boolean
}

export class CoachEngine {
  private personaIndex: PackIndex
  private spice: Spice
  private profanity: Profanity
  private readonly rng: () => number
  private readonly cooldownMs: number
  private readonly perTriggerCooldownMs: number
  private readonly triggerCooldowns: Partial<Record<CoachTrigger, number>>
  private readonly memorySize: number
  private readonly distressInCharacter: boolean

  private lastNow: number | undefined
  private lastSpokenAt = -Infinity
  private lastNonCueAt = -Infinity
  private readonly lastByKey = new Map<string, number>()
  private seq = 0
  private readonly usedAt = new Map<string, number>()
  private mutedUntil = -Infinity
  private pendingMuteMs: number | undefined
  private supportiveUntil = -Infinity
  private lastDistressAt = -Infinity
  private segment: SegmentState | null = null
  private ftpTestUntil = -Infinity

  constructor(opts: CoachEngineOptions) {
    this.personaIndex = opts.persona === PROFESSIONAL ? PROFESSIONAL_INDEX : indexPack(opts.persona)
    this.spice = clampSpice(opts.spice)
    this.profanity = toProfanity(opts.profanity)
    this.rng = opts.rng ?? Math.random
    const cooldown = opts.cooldownMs ?? ENGINE_TIMING.defaultCooldownMs
    this.cooldownMs = Math.min(ENGINE_TIMING.maxCooldownMs, Math.max(ENGINE_TIMING.minCooldownMs, cooldown))
    this.perTriggerCooldownMs = Math.max(0, opts.perTriggerCooldownMs ?? ENGINE_TIMING.defaultPerTriggerCooldownMs)
    this.triggerCooldowns = { ...DEFAULT_TRIGGER_COOLDOWNS_MS, ...opts.triggerCooldownMs }
    this.memorySize = Math.max(0, Math.floor(opts.memorySize ?? DEFAULT_MEMORY_SIZE))
    this.distressInCharacter = opts.distressInCharacter ?? false
  }

  /** Decide whether to speak for this moment. A returned line counts as spoken. */
  consider(moment: CoachContext): CoachLine | null {
    let ctx = moment
    if (this.lastNow !== undefined && ctx.now < this.lastNow) {
      // Out-of-order timestamps must never reopen a cooldown; only a big jump means a new ride.
      if (this.lastNow - ctx.now > ENGINE_TIMING.newTimelineMs) this.resetTimers()
      else ctx = { ...ctx, now: this.lastNow }
    }
    const now = ctx.now
    this.lastNow = now
    if (this.pendingMuteMs !== undefined) {
      this.mutedUntil = now + this.pendingMuteMs
      this.pendingMuteMs = undefined
    }
    const facts = buildFacts(ctx)
    this.track(ctx, facts)
    if (ctx.trigger === 'distress') return this.onDistress(ctx, facts)

    const priority = priorityOf(ctx.trigger, facts)
    const key = cooldownKey(ctx.trigger, facts)
    if (!this.maySpeak(ctx, priority, key)) return null

    let chosen: Candidate | null
    if (this.isSupportive(now)) {
      chosen = this.choose(PROFESSIONAL_INDEX, ctx.trigger, facts)
    } else {
      chosen = this.choose(this.personaIndex, ctx.trigger, facts)
      // Professional is the fallback for anything but banter, so cues survive thin custom packs.
      if (!chosen && priority > PRIORITY.banter && this.personaIndex !== PROFESSIONAL_INDEX) {
        chosen = this.choose(PROFESSIONAL_INDEX, ctx.trigger, facts)
      }
    }
    return chosen ? this.emit(chosen, ctx.trigger, priority, now, key) : null
  }

  setSpice(spice: Spice): void {
    this.spice = clampSpice(spice)
  }

  setProfanity(level: ProfanitySetting): void {
    this.profanity = toProfanity(level)
  }

  setPersona(pack: PersonaPack): void {
    this.personaIndex = pack === PROFESSIONAL ? PROFESSIONAL_INDEX : indexPack(pack)
  }

  get persona(): PersonaPack {
    return this.personaIndex.pack
  }

  /**
   * Silence everything but 'distress' for `ms`, starting at `now` (default: the
   * time of the last consider() call, or the next one if there was none).
   * mute(0) unmutes.
   */
  mute(ms: number, now?: number): void {
    if (!(ms > 0)) {
      this.unmute()
      return
    }
    const base = now ?? this.lastNow
    if (base === undefined) this.pendingMuteMs = ms
    else this.mutedUntil = base + ms
  }

  unmute(): void {
    this.mutedUntil = -Infinity
    this.pendingMuteMs = undefined
  }

  isMuted(now: number): boolean {
    return now < this.mutedUntil || this.pendingMuteMs !== undefined
  }

  /** True while the supportive Professional tone is forced after a distress event. */
  isSupportive(now: number): boolean {
    return now < this.supportiveUntil
  }

  /** Forget everything: call between rides. */
  reset(): void {
    this.resetTimers()
    this.usedAt.clear()
    this.seq = 0
    this.lastNow = undefined
  }

  private resetTimers(): void {
    this.lastSpokenAt = -Infinity
    this.lastNonCueAt = -Infinity
    this.lastByKey.clear()
    this.mutedUntil = -Infinity
    this.pendingMuteMs = undefined
    this.supportiveUntil = -Infinity
    this.lastDistressAt = -Infinity
    this.segment = null
    this.ftpTestUntil = -Infinity
  }

  private track(ctx: CoachContext, facts: Facts): void {
    const t = ctx.trigger
    const num = (k: string): number | undefined => {
      const v = facts[k]
      return typeof v === 'number' ? v : undefined
    }
    if (t === 'segment_start') {
      const lengthS = num('remainingS') ?? num('durationS')
      this.segment = { hard: facts.hard === true, endsAt: lengthS !== undefined ? ctx.now + lengthS * 1000 : undefined }
    } else if (ENDS_SEGMENT.has(t)) {
      this.segment = null
    } else if (this.segment?.endsAt !== undefined) {
      const shiftS = t === 'extended_interval' ? num('extraS') : t === 'resumed' ? num('pausedS') : undefined
      if (shiftS !== undefined && shiftS > 0) this.segment.endsAt += shiftS * 1000
    }
    if (t === 'ftp_test_minute') this.ftpTestUntil = ctx.now + ENGINE_TIMING.ftpTestHardWindowMs
    else if (t === 'ftp_test_result' || t === 'workout_complete' || t === 'ride_bailed') this.ftpTestUntil = -Infinity
  }

  /** Is the rider in a hard effort right now (for the one-line-a-minute limit)? */
  private hardEffortNow(ctx: CoachContext): boolean {
    const t = ctx.trigger
    if (ENDS_SEGMENT.has(t)) return false
    if (t === 'ftp_test_minute') return true
    // countdown_10s describes the upcoming segment, not the current one
    if (t !== 'countdown_10s') {
      if (typeof ctx.data.hard === 'boolean') return ctx.data.hard
      if (typeof ctx.data.segmentKind === 'string') return isHardKind(ctx.data.segmentKind)
    }
    const seg = this.segment
    if (seg && (seg.endsAt === undefined || ctx.now < seg.endsAt)) return seg.hard
    return ctx.now < this.ftpTestUntil
  }

  private cooldownFor(trigger: CoachTrigger, priority: CoachPriority): number {
    const override = this.triggerCooldowns[trigger]
    if (override !== undefined && (trigger !== 'segment_start' || priority === PRIORITY.cue)) return override
    if (priority === PRIORITY.banter) return 0 // the global cooldown paces banter
    return this.perTriggerCooldownMs
  }

  private maySpeak(ctx: CoachContext, priority: CoachPriority, key: string): boolean {
    const now = ctx.now
    if (now < this.mutedUntil) return false
    if (this.isSupportive(now) && SUPPRESSED_WHILE_SUPPORTIVE.has(ctx.trigger)) return false
    const last = this.lastByKey.get(key)
    if (last !== undefined && now - last < this.cooldownFor(ctx.trigger, priority)) return false
    if (priority >= PRIORITY.cue) return true
    const gap = priority === PRIORITY.banter ? this.cooldownMs : ENGINE_TIMING.coachingGapMs
    if (now - this.lastSpokenAt < gap) return false
    if (this.hardEffortNow(ctx) && now - this.lastNonCueAt < ENGINE_TIMING.hardEffortGapMs) return false
    return true
  }

  private onDistress(ctx: CoachContext, facts: Facts): CoachLine | null {
    const now = ctx.now
    this.supportiveUntil = now + ENGINE_TIMING.distressSupportMs
    if (now - this.lastDistressAt < ENGINE_TIMING.distressRepeatMs) return null
    this.lastDistressAt = now
    const sources =
      this.distressInCharacter && this.personaIndex !== PROFESSIONAL_INDEX
        ? [this.personaIndex, PROFESSIONAL_INDEX]
        : [PROFESSIONAL_INDEX]
    for (const index of sources) {
      const chosen = this.choose(index, 'distress', facts, true)
      if (chosen) return this.emit(chosen, 'distress', PRIORITY.safety, now, 'distress')
    }
    const fallback = { line: DISTRESS_FALLBACK, text: DISTRESS_FALLBACK.text, packId: PROFESSIONAL.meta.id, specificity: 0 }
    return this.emit(fallback, 'distress', PRIORITY.safety, now, 'distress')
  }

  /** The best eligible line of a pack for this moment, or null if there is none. */
  private choose(index: PackIndex, trigger: CoachTrigger, facts: Facts, anySpice = false): Candidate | null {
    const spice: Spice = anySpice || index.ignoresSpice ? 5 : this.spice
    const packId = index.pack.meta.id
    const candidates: Candidate[] = []
    for (const line of index.byTrigger.get(trigger) ?? []) {
      if (line.spice > spice) continue
      if (line.profanity === true && this.profanity === 'clean') continue
      if (line.criteria && !line.criteria.every((c) => criterionHolds(c, facts))) continue
      const text = renderTemplate(line.text, facts)
      if (text === null) continue
      // Clean and Mild: canned lines still skip banned topics, and the words
      // must fit the setting. AI lines skip the topic list either way.
      // Unhinged filters nothing.
      if (this.profanity !== 'unhinged') {
        if (!line.id.startsWith('ai.') && violatesGuardrails(text) !== null) continue
        if (!languageAllowed(text, this.profanity)) continue
      }
      candidates.push({ line, text, packId, specificity: line.criteria?.length ?? 0 })
    }
    if (candidates.length === 0) return null

    const fresh = candidates.filter((c) => !this.isRecent(c))
    if (fresh.length > 0) {
      let top = 0
      for (const c of fresh) top = Math.max(top, c.specificity)
      const pool = fresh.filter((c) => c.specificity === top)
      const boost = (c: Candidate) => (this.profanity === 'unhinged' && c.line.profanity === true ? UNHINGED_PROFANITY_BOOST : 1)
      return weightedPick(pool, (c) => (c.line.weight ?? 1) * spiceAffinity(c.line.spice, spice) * boost(c), this.rng)
    }
    // Everything eligible was said recently: repeat the one said longest ago.
    let oldest = candidates[0]!
    for (const c of candidates) if (this.lastUse(c) < this.lastUse(oldest)) oldest = c
    return oldest
  }

  private lastUse(c: Candidate): number {
    return this.usedAt.get(memoryKey(c.packId, c.line.id)) ?? 0
  }

  private isRecent(c: Candidate): boolean {
    const used = this.usedAt.get(memoryKey(c.packId, c.line.id))
    return used !== undefined && this.seq - used < this.memorySize
  }

  private emit(c: Candidate, trigger: CoachTrigger, priority: CoachPriority, now: number, key: string): CoachLine {
    this.lastSpokenAt = now
    if (priority <= PRIORITY.coaching) this.lastNonCueAt = now
    this.lastByKey.set(key, now)
    this.seq += 1
    this.usedAt.set(memoryKey(c.packId, c.line.id), this.seq)
    return { text: c.text, speech: toSpeech(c.text), personaId: c.packId, trigger, priority, lineId: c.line.id }
  }
}

function memoryKey(packId: string, lineId: string): string {
  return `${packId}/${lineId}`
}

/** segment_start is paced per segment kind, so a recovery cue never blocks the next interval's. */
function cooldownKey(trigger: CoachTrigger, facts: Facts): string {
  if (trigger !== 'segment_start') return trigger
  const kind = typeof facts.segmentKind === 'string' ? facts.segmentKind : facts.hard === true ? 'hard' : 'easy'
  return `segment_start:${kind}`
}

export function weightedPick<T>(items: readonly T[], weight: (item: T) => number, rng: () => number): T {
  let total = 0
  for (const item of items) total += Math.max(0, weight(item))
  let r = rng() * total
  for (const item of items) {
    r -= Math.max(0, weight(item))
    if (r < 0) return item
  }
  return items[items.length - 1]!
}
