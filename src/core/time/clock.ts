// Clocks. Everything time-dependent in the ride engine takes a Clock so tests
// can run a 60-minute workout in milliseconds (FakeClock) and E2E runs can
// time-warp simulated rides (WarpClock).

export type Cancel = () => void

export interface Clock {
  /** Monotonic milliseconds on this clock's timeline (warped for WarpClock). */
  now(): number
  /** Wall-clock epoch ms for a monotonic instant (defaults to now()). */
  wallMs(mono?: number): number
  /** Repeating timer in clock milliseconds. */
  every(ms: number, fn: () => void): Cancel
  /** One-shot timer in clock milliseconds. */
  after(ms: number, fn: () => void): Cancel
  /** Time-warp factor (1 = real time). */
  readonly warp: number
}

/** Past this much disagreement with Date.now(), the wall anchor is reset. */
export const WALL_RESYNC_MS = 2000

/**
 * Real time. Monotonic via performance.now(), anchored to Date.now(). On
 * macOS the monotonic clock stops while the Mac sleeps, so an app left open
 * overnight would date every later ride too early by the time asleep: the
 * anchor is reset whenever the two disagree by more than WALL_RESYNC_MS.
 */
export class SystemClock implements Clock {
  readonly warp = 1
  private wallAnchor = Date.now()
  private monoAnchor = performance.now()

  now(): number {
    return performance.now()
  }
  wallMs(mono = this.now()): number {
    const wallNow = Date.now()
    const monoNow = performance.now()
    if (Math.abs(this.wallAnchor + (monoNow - this.monoAnchor) - wallNow) > WALL_RESYNC_MS) {
      this.wallAnchor = wallNow
      this.monoAnchor = monoNow
    }
    return this.wallAnchor + (mono - this.monoAnchor)
  }
  every(ms: number, fn: () => void): Cancel {
    const h = setInterval(fn, ms)
    return () => clearInterval(h)
  }
  after(ms: number, fn: () => void): Cancel {
    const h = setTimeout(fn, ms)
    return () => clearTimeout(h)
  }
}

/**
 * Accelerated time for simulated rides: clock time advances `warp` times
 * faster than real time, and timers fire proportionally sooner. Wall time is
 * warped too, so recorded timestamps stay self-consistent.
 */
export class WarpClock implements Clock {
  private readonly wallAnchor = Date.now()
  private readonly realAnchor = performance.now()

  constructor(readonly warp: number) {
    if (!(warp >= 1)) throw new Error('warp must be >= 1')
  }
  now(): number {
    return (performance.now() - this.realAnchor) * this.warp
  }
  wallMs(mono = this.now()): number {
    return this.wallAnchor + mono
  }
  every(ms: number, fn: () => void): Cancel {
    const h = setInterval(fn, Math.max(1, ms / this.warp))
    return () => clearInterval(h)
  }
  after(ms: number, fn: () => void): Cancel {
    const h = setTimeout(fn, Math.max(0, ms / this.warp))
    return () => clearTimeout(h)
  }
}

interface FakeTimer {
  id: number
  due: number
  interval: number | null
  fn: () => void
}

/** Deterministic manual clock for tests. Nothing happens until advance() is called. */
export class FakeClock implements Clock {
  readonly warp = 1
  private t = 0
  private seq = 0
  private timers: FakeTimer[] = []

  constructor(private readonly wallStart = Date.UTC(2026, 0, 1, 7, 0, 0)) {}

  now(): number {
    return this.t
  }
  wallMs(mono = this.t): number {
    return this.wallStart + mono
  }
  every(ms: number, fn: () => void): Cancel {
    const timer: FakeTimer = { id: ++this.seq, due: this.t + ms, interval: Math.max(1, ms), fn }
    this.timers.push(timer)
    return () => this.cancel(timer.id)
  }
  after(ms: number, fn: () => void): Cancel {
    const timer: FakeTimer = { id: ++this.seq, due: this.t + Math.max(0, ms), interval: null, fn }
    this.timers.push(timer)
    return () => this.cancel(timer.id)
  }

  /** Advances time by `ms`, firing every due timer in chronological order. */
  advance(ms: number): void {
    const end = this.t + ms
    for (;;) {
      const next = this.nextDue(end)
      if (!next) break
      this.t = next.due
      if (next.interval === null) this.cancel(next.id)
      else next.due += next.interval
      next.fn()
    }
    this.t = end
  }

  /** Jumps time without firing timers (simulates sleep / clock jumps). */
  jump(ms: number): void {
    this.t += ms
  }

  pendingTimers(): number {
    return this.timers.length
  }

  private nextDue(limit: number): FakeTimer | undefined {
    let best: FakeTimer | undefined
    for (const tm of this.timers) {
      if (tm.due <= limit && (!best || tm.due < best.due || (tm.due === best.due && tm.id < best.id))) best = tm
    }
    return best
  }
  private cancel(id: number): void {
    this.timers = this.timers.filter((tm) => tm.id !== id)
  }
}
