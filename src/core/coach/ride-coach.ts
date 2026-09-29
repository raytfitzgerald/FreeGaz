// RideCoach: the whole offline coach for one ride. The detector finds the
// moments, the engine picks the lines, and the content gate has the last word
// on everything that comes out, canned or AI-written. Pure: the renderer wraps
// it with speech and display, the simulator tests drive it directly.
import { CoachEngine, clampSpice, type CoachEngineOptions } from '../persona/engine'
import type { CoachContext, CoachLine, CoachLineTemplate, PersonaPack } from '../persona/types'
import type { SessionEvent } from '../ride/session'
import { gateLine, personaBannedPatterns, sanitizeFacts } from './content'
import { TriggerDetector, type DetectorOptions, type DetectorTick, type FuelingPlan } from './detector'

export interface RideCoachOptions extends DetectorOptions {
  persona: PersonaPack
  spice: number
  profanity: boolean
  /** Uniform [0, 1); pass mulberry32(seed) for reproducible rides. */
  rng?: () => number
  /** Engine pacing overrides (cooldowns, memory). */
  engine?: Omit<Partial<CoachEngineOptions>, 'persona' | 'spice' | 'profanity' | 'rng'>
}

export class RideCoach {
  readonly detector: TriggerDetector
  readonly engine: CoachEngine
  private base: PersonaPack
  private extra: { personaId: string; lines: readonly CoachLineTemplate[] } | null = null
  private profanity: boolean

  constructor(opts: RideCoachOptions) {
    this.detector = new TriggerDetector(opts)
    this.base = opts.persona
    this.profanity = opts.profanity
    this.engine = new CoachEngine({
      ...opts.engine,
      persona: opts.persona,
      spice: clampSpice(opts.spice),
      profanity: opts.profanity,
      ...(opts.rng ? { rng: opts.rng } : {}),
    })
  }

  /** The chosen persona (without any AI lines). */
  get persona(): PersonaPack {
    return this.base
  }

  /** How many AI-written lines are in play this ride. */
  get extraLineCount(): number {
    return this.extra?.lines.length ?? 0
  }

  tick(t: DetectorTick): CoachLine[] {
    return this.say(this.detector.tick(t))
  }

  event(e: SessionEvent, now: number): CoachLine[] {
    return this.say(this.detector.event(e, now))
  }

  ftpResult(r: { ftpNew: number; ftpOld: number | null }, now: number): CoachLine[] {
    return this.say(this.detector.ftpResult(r, now))
  }

  /** Switch persona mid-ride. AI lines written for another persona are dropped. */
  setPersona(pack: PersonaPack): void {
    if (pack === this.base) return
    this.base = pack
    if (this.extra && this.extra.personaId !== pack.meta.id) this.extra = null
    this.applyPack()
  }

  setSpice(spice: number): void {
    this.engine.setSpice(clampSpice(spice))
  }

  setProfanity(on: boolean): void {
    this.profanity = on
    this.engine.setProfanity(on)
  }

  setFueling(f: FuelingPlan | null): void {
    this.detector.setFueling(f)
  }

  /**
   * Validated AI lines (see quipLinesFromPack) join the persona's canned lines
   * for the rest of the ride. Ignored when written for another persona.
   */
  setExtraLines(personaId: string, lines: readonly CoachLineTemplate[]): boolean {
    if (personaId !== this.base.meta.id) return false
    this.extra = lines.length > 0 ? { personaId, lines } : null
    this.applyPack()
    return true
  }

  /** Silence everything but safety lines. */
  mute(now: number): void {
    this.engine.mute(24 * 3_600_000, now)
  }

  unmute(): void {
    this.engine.unmute()
  }

  isMuted(now: number): boolean {
    return this.engine.isMuted(now)
  }

  isSupportive(now: number): boolean {
    return this.engine.isSupportive(now)
  }

  private applyPack(): void {
    const extra = this.extra
    this.engine.setPersona(extra ? { meta: this.base.meta, lines: [...this.base.lines, ...extra.lines] } : this.base)
  }

  private say(moments: readonly CoachContext[]): CoachLine[] {
    const out: CoachLine[] = []
    const personaId = this.base.meta.id
    const banned = this.profanity ? [] : personaBannedPatterns(personaId)
    for (const m of moments) {
      const line = this.engine.consider(banned.length > 0 ? { ...m, data: sanitizeFacts(m.data, banned) } : m)
      if (!line) continue
      const gated = gateLine(line, { personaId, profanity: this.profanity })
      if (!gated) continue
      this.detector.spoken(line.trigger)
      out.push(gated)
    }
    return out
  }
}
