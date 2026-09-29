// SensorHub: the single place every driver pushes measurements into and the
// ride engine reads from. It decides which source wins for each metric
// (priority list + freshness TTL + failover hysteresis) and computes exact
// time-weighted means over arbitrary intervals, which is what makes the 1 Hz
// recorder correct even when ticks arrive late.
import type { Metric, RrBatch, SensorSample } from './types'

/** How long a value stays valid without a fresh sample (ms). Past this it is "missing" (null), never 0. */
export const DEFAULT_TTL_MS: Partial<Record<Metric, number>> = {
  power: 3000,
  cadence: 3000,
  speed: 3000,
  hr: 5000,
  lrBalance: 3000,
  coreTemp: 60000,
  skinTemp: 60000,
  heatStrain: 60000,
  smo2: 5000,
  thb: 5000,
  resistanceLevel: 5000,
  battery: 3_600_000,
}
const FALLBACK_TTL_MS = 5000
/** A higher-priority source must stream this long before it takes over again. */
const FAILOVER_HYSTERESIS_MS = 5000
/** Samples older than this are pruned. */
const HISTORY_MS = 5 * 60_000

interface Point {
  t: number
  v: number
}

class Series {
  readonly points: Point[] = []
  push(t: number, v: number): void {
    const last = this.points[this.points.length - 1]
    if (last && t < last.t) return // ignore out-of-order samples
    this.points.push({ t, v })
  }
  latest(): Point | undefined {
    return this.points[this.points.length - 1]
  }
  prune(before: number): void {
    // keep one point before `before` so interval means stay exact
    let i = 0
    while (i + 1 < this.points.length && this.points[i + 1]!.t < before) i++
    if (i > 0) this.points.splice(0, i)
  }
}

export interface LatestValue {
  value: number
  tMono: number
  sourceId: string
}

export interface SourceSwitch {
  metric: Metric
  from: string | null
  to: string | null
  tMono: number
}

export class SensorHub {
  private readonly series = new Map<string, Series>() // key `${metric}|${source}`
  private readonly priority = new Map<Metric, string[]>()
  private readonly active = new Map<Metric, string | null>()
  private readonly ttl: Partial<Record<Metric, number>>
  private rr: { t: number; rrMs: number[]; sourceId: string }[] = []
  private readonly switchListeners = new Set<(s: SourceSwitch) => void>()
  /** When each series' current unbroken (no gap > TTL) run of samples began. */
  private readonly streakStart = new Map<string, number>()

  constructor(opts: { ttlMs?: Partial<Record<Metric, number>> } = {}) {
    this.ttl = { ...DEFAULT_TTL_MS, ...opts.ttlMs }
  }

  /** Preferred order of sources for a metric, best first. Unlisted sources rank last. */
  setPriority(metric: Metric, sourceIds: string[]): void {
    this.priority.set(metric, sourceIds)
  }

  ingest(sample: SensorSample): void {
    if (!Number.isFinite(sample.value)) return
    const key = `${sample.metric}|${sample.sourceId}`
    let s = this.series.get(key)
    if (!s) {
      s = new Series()
      this.series.set(key, s)
    }
    const last = s.latest()
    if (!last || sample.tMono - last.t > this.ttlFor(sample.metric)) this.streakStart.set(key, sample.tMono)
    s.push(sample.tMono, sample.value)
  }

  ingestRr(batch: RrBatch): void {
    if (batch.rrMs.length === 0) return
    this.rr.push({ t: batch.tMono, rrMs: batch.rrMs, sourceId: batch.sourceId })
  }

  onSourceSwitch(listener: (s: SourceSwitch) => void): () => void {
    this.switchListeners.add(listener)
    return () => this.switchListeners.delete(listener)
  }

  ttlFor(metric: Metric): number {
    return this.ttl[metric] ?? FALLBACK_TTL_MS
  }

  /** Sources that have ever reported this metric. */
  sourcesFor(metric: Metric): string[] {
    const out: string[] = []
    for (const key of this.series.keys()) {
      const [m, src] = key.split('|') as [Metric, string]
      if (m === metric) out.push(src)
    }
    return this.rank(metric, out)
  }

  /**
   * The winning source for a metric at `now`.
   *  - If the current source goes stale, fail over immediately to the best
   *    fresh source (a backup reading beats a gap in the data).
   *  - A higher-priority source only takes over once it has been streaming
   *    continuously for FAILOVER_HYSTERESIS_MS, so a flaky primary that
   *    reconnects for a second doesn't make the value flap between sources.
   */
  activeSource(metric: Metric, now: number): string | null {
    const ttl = this.ttlFor(metric)
    const isFresh = (src: string) => {
      const p = this.series.get(`${metric}|${src}`)?.latest()
      return p !== undefined && now - p.t <= ttl
    }
    const ranked = this.sourcesFor(metric)
    const current = this.active.get(metric) ?? null
    let next: string | null

    if (current && isFresh(current)) {
      next = current
      const better = ranked.slice(0, ranked.indexOf(current))
      for (const src of better) {
        const since = this.streakStart.get(`${metric}|${src}`)
        if (isFresh(src) && since !== undefined && now - since >= FAILOVER_HYSTERESIS_MS) {
          next = src
          break
        }
      }
    } else {
      next = ranked.find(isFresh) ?? null
    }

    if (next !== current) {
      this.active.set(metric, next)
      for (const l of this.switchListeners) l({ metric, from: current, to: next, tMono: now })
    }
    return next
  }

  /** Latest fresh value of a metric from the winning source, or null if missing. */
  latest(metric: Metric, now: number): LatestValue | null {
    const src = this.activeSource(metric, now)
    if (!src) return null
    const p = this.series.get(`${metric}|${src}`)?.latest()
    if (!p) return null
    return { value: p.v, tMono: p.t, sourceId: src }
  }

  value(metric: Metric, now: number): number | null {
    return this.latest(metric, now)?.value ?? null
  }

  /**
   * The value that was holding at instant `t` (last sample at or before t,
   * within TTL), from the source active at `t`. Unlike `value()`, this is
   * correct when a late tick catches up on past seconds.
   */
  valueAt(metric: Metric, t: number, sourceId?: string): number | null {
    const src = sourceId ?? this.activeSource(metric, t)
    if (!src) return null
    const pts = this.series.get(`${metric}|${src}`)?.points
    if (!pts || pts.length === 0) return null
    let lo = 0
    let hi = pts.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (pts[mid]!.t <= t) {
        found = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    if (found < 0) return null
    const p = pts[found]!
    return t - p.t <= this.ttlFor(metric) ? p.v : null
  }

  /**
   * Time-weighted mean over [from, to) using sample-and-hold, where each
   * sample is valid until the next sample or its TTL, whichever comes first.
   * Spans with no valid sample are excluded; returns null if nothing was valid.
   * Uses the source that is active at `to`.
   */
  meanOver(metric: Metric, from: number, to: number, sourceId?: string): number | null {
    if (to <= from) return null
    const src = sourceId ?? this.activeSource(metric, to)
    if (!src) return null
    const s = this.series.get(`${metric}|${src}`)
    if (!s) return null
    const ttl = this.ttlFor(metric)
    const pts = s.points
    let weighted = 0
    let covered = 0
    // First candidate: the last point at or before `from - ttl` can't contribute; start just after it.
    let lo = 0
    let hi = pts.length - 1
    const floor = from - ttl
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (pts[mid]!.t <= floor) lo = mid
      else hi = mid - 1
    }
    for (let i = lo; i < pts.length; i++) {
      const p = pts[i]!
      const nextT = pts[i + 1]?.t ?? Infinity
      const validEnd = Math.min(nextT, p.t + ttl)
      const a = Math.max(p.t, from)
      const b = Math.min(validEnd, to)
      if (b > a) {
        weighted += p.v * (b - a)
        covered += b - a
      }
      if (p.t >= to) break
    }
    return covered > 0 ? weighted / covered : null
  }

  /**
   * Stateless choice for recording: the highest-priority source with any
   * valid data in [from, to). Unlike activeSource() it has no hysteresis and
   * never mutates state, so it is safe for catch-up queries on past slots.
   */
  pickSource(metric: Metric, from: number, to: number): string | null {
    for (const src of this.sourcesFor(metric)) {
      if (this.meanOver(metric, from, to, src) !== null) return src
    }
    return null
  }

  /** RR intervals received in [from, to). */
  rrBetween(from: number, to: number): number[] {
    const out: number[] = []
    for (const b of this.rr) if (b.t >= from && b.t < to) out.push(...b.rrMs)
    return out
  }

  /** Drops history older than HISTORY_MS before `now`. Call periodically. */
  prune(now: number): void {
    const before = now - HISTORY_MS
    for (const s of this.series.values()) s.prune(before)
    this.rr = this.rr.filter((b) => b.t >= before)
  }

  /** Forget a source entirely (device removed). */
  removeSource(sourceId: string): void {
    for (const key of [...this.series.keys()]) {
      if (key.endsWith(`|${sourceId}`)) {
        this.series.delete(key)
        this.streakStart.delete(key)
      }
    }
    for (const [m, src] of this.active) if (src === sourceId) this.active.set(m, null)
  }

  private rank(metric: Metric, sources: string[]): string[] {
    const pri = this.priority.get(metric) ?? []
    const idx = (s: string) => {
      const i = pri.indexOf(s)
      return i === -1 ? pri.length : i
    }
    return [...sources].sort((a, b) => idx(a) - idx(b) || a.localeCompare(b))
  }
}
