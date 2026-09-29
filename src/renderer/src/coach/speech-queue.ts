// The coach's voice: one line at a time. A more important line cuts off a
// less important one; the rest wait their turn, and a line that waited too
// long is dropped, because "ten seconds" said twelve seconds late is worse
// than silence.
import { PRIORITY, type CoachPriority } from '@core/persona'

export interface Utterance {
  text: string
  priority: CoachPriority
  /** When the line was produced, on the ride clock (ms). */
  at: number
  /** The pack that produced it, for its voice hint. */
  personaId: string
}

export interface Voice {
  /** Starts speaking; calls onEnd once when done or failed. False if nothing could be spoken. */
  speak(u: Utterance, onEnd: () => void): boolean
  cancel(): void
}

export interface Timers {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

/** How long a line may wait to be spoken, ms of ride time. Cues are about this very moment. */
export const STALE_AFTER_MS: Readonly<Record<CoachPriority, number>> = {
  [PRIORITY.safety]: 30_000,
  [PRIORITY.cue]: 4_000,
  [PRIORITY.coaching]: 8_000,
  [PRIORITY.banter]: 8_000,
}

/** At most this many lines wait; the least important go first. */
export const MAX_WAITING = 3

/** Some voices never fire their end event: a line is assumed over after roughly its length, plus slack. */
export function watchdogMs(text: string): number {
  return 4000 + text.length * 120
}

const browserTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

export class SpeechQueue {
  private speaking: { u: Utterance; token: number } | null = null
  private waiting: Utterance[] = []
  private token = 0
  private watchdog: unknown = null

  constructor(
    private readonly voice: Voice,
    private readonly now: () => number,
    private readonly timers: Timers = browserTimers,
  ) {}

  /** The line being spoken, if any. */
  get current(): Utterance | null {
    return this.speaking?.u ?? null
  }

  get pending(): readonly Utterance[] {
    return this.waiting
  }

  say(u: Utterance): void {
    const cur = this.speaking
    if (!cur) {
      this.start(u)
      return
    }
    if (u.priority > cur.u.priority) {
      this.stopCurrent()
      this.start(u)
      return
    }
    this.waiting.push(u)
    // most important first; among equals, oldest first
    this.waiting.sort((a, b) => b.priority - a.priority || a.at - b.at)
    if (this.waiting.length > MAX_WAITING) this.waiting.length = MAX_WAITING
  }

  /** Stop talking and forget everything waiting (mute, coach off). */
  clear(): void {
    this.waiting = []
    this.stopCurrent()
  }

  private start(u: Utterance): void {
    const token = ++this.token
    this.speaking = { u, token }
    if (!this.voice.speak(u, () => this.finished(token))) {
      this.finished(token)
      return
    }
    if (this.speaking?.token === token) this.watchdog = this.timers.set(() => this.finished(token), watchdogMs(u.text))
  }

  private finished(token: number): void {
    if (this.speaking?.token !== token) return
    this.speaking = null
    this.disarm()
    this.next()
  }

  private next(): void {
    const now = this.now()
    while (this.waiting.length > 0) {
      const u = this.waiting.shift()!
      if (now - u.at > STALE_AFTER_MS[u.priority]) continue
      this.start(u)
      return
    }
  }

  private stopCurrent(): void {
    if (!this.speaking) return
    // forget it first, so the end event cancel() provokes is ignored
    this.speaking = null
    this.disarm()
    this.voice.cancel()
  }

  private disarm(): void {
    if (this.watchdog !== null) this.timers.clear(this.watchdog)
    this.watchdog = null
  }
}
