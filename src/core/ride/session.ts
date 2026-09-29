// RideSession: one ride, from start to finish. Hooks into the engine tick,
// records 1 Hz records, journals them for crash safety, keeps live metrics,
// runs the plan (workout/route/test) and handles pauses and laps.
import type { AthleteSnapshot, RideKind } from './types'
import { scaledErgTarget, type TrainerController } from '../control/trainer-controller'
import { COGGAN_POWER, HrDriftAccumulator, NormalizedPowerAccumulator, RollingMean, TimeInZones, WPrimeBalance, intensityFactor, trainingStressScore } from '../metrics'
import type { SensorHub } from '../sensors/hub'
import type { Clock } from '../time/clock'
import type { LiveRide, RideCommand } from '../../shared/live'
import { encodeEvent, encodeMeta, encodeRecord, type JournalEvent } from './journal'
import { IDLE_TICK, type PlanTick, type RescueOffer, type RidePlan, freeRidePlan } from './plan'
import { RideRecorder, type RideRecord } from './recorder'

export type SessionState = 'ready' | 'riding' | 'paused' | 'finished'
export type PauseReason = 'user' | 'auto' | 'system' | 'sensor-lost'

export interface JournalSink {
  begin(rideId: string, metaLine: string): Promise<void>
  /** Idempotent per seq; resolves with the durable seq. */
  append(rideId: string, seq: number, lines: string[]): Promise<number>
  close(rideId: string): Promise<void>
}

export interface SessionOptions {
  rideId: string
  name: string
  kind: RideKind
  simulated: boolean
  athlete: AthleteSnapshot
  autoPause: boolean
  plan?: RidePlan
  /** Best powers before this ride, for live PR detection. */
  bests?: Partial<Record<number, number>>
}

export interface SessionDeps {
  clock: Clock
  hub: SensorHub
  controller: TrainerController
  journal: JournalSink
  /** Tells the engine/controller that we're paused (ERG release). */
  setPaused: (paused: boolean) => void
}

export type SessionEvent =
  | { type: 'state'; state: SessionState; reason?: PauseReason }
  | { type: 'segment'; index: number; label: string | null; kind: string | null }
  | { type: 'cue'; text: string }
  | { type: 'pr'; durationS: number; watts: number; previous: number | null }
  | { type: 'plan-finished' }
  | { type: 'rescue'; offer: RescueOffer }
  | { type: 'journal-error'; message: string }

const AUTO_PAUSE_ZERO_MS = 3000
const SENSOR_LOST_MS = 30_000
const PR_DURATIONS = [5, 60, 300, 1200]

export class RideSession {
  readonly rideId: string
  readonly options: SessionOptions
  private readonly recorder: RideRecorder
  private readonly plan: RidePlan
  private state: SessionState = 'ready'
  private pausedBy: PauseReason | null = null
  private startedAtMono = 0
  private startedAtWall = 0
  private zeroSince: number | null = null
  private silentSince: number | null = null
  private lastTick: PlanTick = IDLE_TICK
  private lastSegment: number | null = null
  private planFinished = false
  private readonly listeners = new Set<(e: SessionEvent) => void>()
  readonly records: RideRecord[] = []
  readonly events: JournalEvent[] = []

  // journal batching
  private seq = 0
  private pendingLines: string[] = []
  private unacked: { seq: number; lines: string[] }[] = []
  private flushing = false
  private journalStarted: Promise<void> | null = null

  // live metrics
  private readonly np = new NormalizedPowerAccumulator()
  private readonly wbal: WPrimeBalance
  private readonly zones: TimeInZones
  private readonly drift = new HrDriftAccumulator()
  private readonly prWindows = PR_DURATIONS.map((d) => ({ d, mean: new RollingMean(d) }))
  private bests: Partial<Record<number, number>>
  private kjSum = 0
  private ride = { maxPower: null as number | null, hrSum: 0, hrN: 0, maxHr: null as number | null, cadSum: 0, cadN: 0 }
  private lapAcc = { index: -1, powerSum: 0, powerN: 0, hrSum: 0, hrN: 0, cadSum: 0, cadN: 0, seconds: 0 }
  private coachLine: string | null = null
  private coachLineAt = 0

  constructor(
    private readonly deps: SessionDeps,
    options: SessionOptions,
  ) {
    this.options = options
    this.rideId = options.rideId
    this.plan = options.plan ?? freeRidePlan(options.name)
    this.bests = { ...options.bests }
    const cp = options.athlete.cpW ?? options.athlete.ftpW
    this.wbal = new WPrimeBalance({ cp, wPrimeJ: options.athlete.wPrimeJ ?? 20_000 })
    this.zones = new TimeInZones(COGGAN_POWER, options.athlete.ftpW)
    this.recorder = new RideRecorder(deps.hub, deps.clock, () => ({
      targetW: this.targetW(),
      grade: this.lastTick.grade ?? null,
      altitude: this.lastTick.altitude ?? null,
      ...(this.lastTick.speed !== undefined ? { speed: this.lastTick.speed } : {}),
    }))
  }

  get currentState(): SessionState {
    return this.state
  }
  get planTick(): PlanTick {
    return this.lastTick
  }
  get movingSeconds(): number {
    return this.recorder.movingSeconds
  }
  get kind(): RideKind {
    return this.plan.kind
  }

  on(listener: (e: SessionEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.state !== 'ready') return
    const now = this.deps.clock.now()
    this.startedAtMono = now
    this.startedAtWall = this.deps.clock.wallMs(now)
    this.recorder.start(now)
    this.state = 'riding'
    this.deps.setPaused(false)
    const meta = encodeMeta({
      rideId: this.rideId,
      startedAt: this.startedAtWall,
      name: this.plan.name,
      kind: this.plan.kind,
      simulated: this.options.simulated,
      ftpW: this.options.athlete.ftpW,
      weightKg: this.options.athlete.weightKg,
      workoutId: this.plan.workoutId,
      workoutJson: this.plan.workoutJson,
    })
    this.journalStarted = this.deps.journal.begin(this.rideId, meta).catch((e: unknown) => {
      this.emit({ type: 'journal-error', message: String(e) })
    })
    this.applyPlan(now, 0)
    this.emit({ type: 'state', state: 'riding' })
  }

  pause(reason: PauseReason = 'user'): void {
    if (this.state !== 'riding') return
    this.recorder.requestPause()
    this.state = 'paused'
    this.pausedBy = reason
    this.deps.setPaused(true)
    this.logEvent('pause', { reason })
    this.emit({ type: 'state', state: 'paused', reason })
  }

  resume(): void {
    if (this.state !== 'paused') return
    const now = this.deps.clock.now()
    // A pause requested mid-slot finishes that slot first.
    this.collect(now)
    this.recorder.resume(now)
    this.state = 'riding'
    this.pausedBy = null
    this.zeroSince = null
    this.silentSince = null
    this.deps.setPaused(false)
    this.logEvent('resume')
    this.emit({ type: 'state', state: 'riding' })
  }

  togglePause(): void {
    if (this.state === 'riding') this.pause('user')
    else if (this.state === 'paused') this.resume()
  }

  lap(): void {
    this.recorder.requestLap()
    this.logEvent('lap')
  }

  /** Workout / trainer commands from keyboard, mini-HUD or phone. */
  command(cmd: RideCommand): void {
    switch (cmd.type) {
      case 'togglePause':
        return this.togglePause()
      case 'pause':
        return this.pause('user')
      case 'resume':
        return this.resume()
      case 'lap':
        return this.lap()
      case 'intensity':
        this.deps.controller.adjustIntensity(cmd.deltaPct)
        this.logEvent('note', { intensityPct: this.deps.controller.currentSettings.intensityPct })
        return
      case 'rescue':
        if (cmd.choice === 'easier') {
          this.deps.controller.adjustIntensity(-5)
          this.logEvent('note', { rescue: 'easier', intensityPct: this.deps.controller.currentSettings.intensityPct })
        }
        if (this.plan.command?.(cmd, this.movingPrecise(this.deps.clock.now()))) this.logEvent('note', { rescue: cmd.choice })
        return
      default:
        if (this.plan.command?.(cmd, this.movingPrecise(this.deps.clock.now()))) this.logEvent('note', { command: cmd.type })
    }
  }

  setCoachLine(text: string): void {
    this.coachLine = text
    this.coachLineAt = this.deps.clock.now()
  }

  /** Called from the engine tick (~4 Hz). */
  tick(now: number): void {
    if (this.state === 'ready' || this.state === 'finished') return
    const hub = this.deps.hub
    const power = hub.value('power', now)
    const cadence = hub.value('cadence', now)

    if (this.options.autoPause) this.autoPause(now, power, cadence)
    if (this.state === 'riding') this.applyPlan(now, 0.25)
    this.collect(now)
  }

  /** Stops the ride. Records up to now are kept; the journal is flushed and closed. */
  async finish(): Promise<{ records: RideRecord[]; events: JournalEvent[] }> {
    if (this.state === 'finished') return { records: this.records, events: this.events }
    const now = this.deps.clock.now()
    this.collect(now)
    this.recorder.pauseNow()
    this.state = 'finished'
    this.deps.setPaused(false)
    this.deps.controller.setDesired({ mode: 'idle' })
    const endTs = this.records.at(-1)?.ts ?? this.startedAtWall
    const end: JournalEvent = { type: 'end', t: this.recorder.movingSeconds, ts: endTs }
    this.events.push(end)
    this.pendingLines.push(encodeEvent(end))
    await this.flushJournal()
    await this.deps.journal.close(this.rideId).catch(() => undefined)
    this.emit({ type: 'state', state: 'finished' })
    return { records: this.records, events: this.events }
  }

  snapshot(): LiveRide {
    const now = this.deps.clock.now()
    const ftp = this.options.athlete.ftpW
    const np = this.np.value()
    const t = this.lastTick
    return {
      state: this.state === 'ready' ? 'idle' : this.state,
      name: this.plan.name,
      elapsedS: this.state === 'ready' ? 0 : Math.round((now - this.startedAtMono) / 1000),
      movingS: this.recorder.movingSeconds,
      segmentLabel: t.segmentLabel,
      segmentRemainingS: t.segmentRemainingS === null ? null : Math.max(0, Math.round(t.segmentRemainingS)),
      nextLabel: t.nextLabel,
      workoutRemainingS: t.remainingS === null ? null : Math.max(0, Math.round(t.remainingS)),
      targetW: this.targetW(),
      np: np === null ? null : Math.round(np),
      tss: roundOrNull(trainingStressScore(this.np.validSeconds, np, ftp), 1),
      kj: Math.round(this.kjSum / 1000),
      wbalPct: Math.round((this.wbal.valueJ / (this.options.athlete.wPrimeJ ?? 20_000)) * 100),
      distanceM: Math.round(this.recorder.distanceM),
      coachLine: this.coachLine && now - this.coachLineAt < 12_000 ? this.coachLine : null,
    }
  }

  /** Live metrics for the HUD beyond the LiveRide basics. */
  liveMetrics() {
    const ftp = this.options.athlete.ftpW
    const np = this.np.value()
    return {
      np,
      if: intensityFactor(np, ftp),
      tss: trainingStressScore(this.np.validSeconds, np, ftp),
      kj: this.kjSum / 1000,
      wbalJ: this.wbal.valueJ,
      zonesS: this.zones.seconds(),
      decouplingPct: this.drift.value(),
      avgPower: this.np.validSeconds > 0 ? Math.round(this.kjSum / this.np.validSeconds) : null,
      maxPower: this.ride.maxPower,
      avgHr: this.ride.hrN > 0 ? Math.round(this.ride.hrSum / this.ride.hrN) : null,
      maxHr: this.ride.maxHr,
      avgCadence: this.ride.cadN > 0 ? Math.round(this.ride.cadSum / this.ride.cadN) : null,
      lap: {
        index: Math.max(0, this.lapAcc.index),
        seconds: this.lapAcc.seconds,
        avgPower: this.lapAcc.powerN > 0 ? Math.round(this.lapAcc.powerSum / this.lapAcc.powerN) : null,
        avgHr: this.lapAcc.hrN > 0 ? Math.round(this.lapAcc.hrSum / this.lapAcc.hrN) : null,
        avgCadence: this.lapAcc.cadN > 0 ? Math.round(this.lapAcc.cadSum / this.lapAcc.cadN) : null,
      },
    }
  }

  // ---- internals ----------------------------------------------------------

  /**
   * The target the rider is asked to hold, intensity applied: the plan's
   * target, or in a free ride the manual ERG watts. Null when there is none.
   */
  private targetW(): number | null {
    if (this.lastTick.targetW !== null) return this.lastTick.targetW
    const d = this.deps.controller.snapshot.desired
    return d.mode === 'erg' ? scaledErgTarget(d.watts, this.deps.controller.currentSettings) : null
  }

  private movingPrecise(now: number): number {
    return this.recorder.movingMsAt(now) / 1000
  }

  private applyPlan(now: number, dtS: number): void {
    const hub = this.deps.hub
    const tick = this.plan.tick({
      now,
      movingS: this.movingPrecise(now),
      dtS,
      power: hub.value('power', now),
      cadence: hub.value('cadence', now),
      hr: hub.value('hr', now),
      intensityPct: this.deps.controller.currentSettings.intensityPct,
    })
    this.lastTick = tick
    if (tick.desired) this.deps.controller.setDesired(tick.desired)
    if (tick.segmentIndex !== null && tick.segmentIndex !== this.lastSegment) {
      if (this.lastSegment !== null) this.recorder.requestLap()
      this.lastSegment = tick.segmentIndex
      this.logEvent('segment', { index: tick.segmentIndex, label: tick.segmentLabel })
      this.emit({ type: 'segment', index: tick.segmentIndex, label: tick.segmentLabel, kind: tick.segmentKind })
    }
    if (tick.cue) this.emit({ type: 'cue', text: tick.cue })
    if (tick.rescue) this.emit({ type: 'rescue', offer: tick.rescue })
    if (tick.finished && !this.planFinished) {
      this.planFinished = true
      this.logEvent('note', { planFinished: true })
      this.emit({ type: 'plan-finished' })
    }
  }

  private autoPause(now: number, power: number | null, cadence: number | null): void {
    const zero = power === 0 && (cadence === 0 || cadence === null)
    const silent = power === null && cadence === null
    if (this.state === 'riding') {
      this.zeroSince = zero ? (this.zeroSince ?? now) : null
      this.silentSince = silent ? (this.silentSince ?? now) : null
      if (this.zeroSince !== null && now - this.zeroSince >= AUTO_PAUSE_ZERO_MS) this.pause('auto')
      else if (this.silentSince !== null && now - this.silentSince >= SENSOR_LOST_MS) this.pause('sensor-lost')
    } else if (this.state === 'paused' && (this.pausedBy === 'auto' || this.pausedBy === 'sensor-lost')) {
      if ((power !== null && power > 0) || (cadence !== null && cadence > 0)) this.resume()
    }
  }

  private collect(now: number): void {
    const recs = this.recorder.collect(now)
    for (const r of recs) this.onRecord(r)
    if (recs.length > 0) void this.flushJournal()
  }

  private onRecord(r: RideRecord): void {
    this.records.push(r)
    this.pendingLines.push(encodeRecord(r))
    this.np.push(r.power)
    this.wbal.push(r.power, 1)
    this.zones.push(r.power)
    this.drift.push(r.power, r.hr)
    if (r.power !== null) this.kjSum += r.power
    const ride = this.ride
    if (r.power !== null) ride.maxPower = Math.max(ride.maxPower ?? 0, r.power)
    if (r.hr !== null) {
      ride.hrSum += r.hr
      ride.hrN++
      ride.maxHr = Math.max(ride.maxHr ?? 0, r.hr)
    }
    if (r.cadence !== null && r.cadence > 0) {
      ride.cadSum += r.cadence
      ride.cadN++
    }
    if (r.lap !== this.lapAcc.index) this.lapAcc = { index: r.lap, powerSum: 0, powerN: 0, hrSum: 0, hrN: 0, cadSum: 0, cadN: 0, seconds: 0 }
    const lap = this.lapAcc
    lap.seconds++
    if (r.power !== null) {
      lap.powerSum += r.power
      lap.powerN++
    }
    if (r.hr !== null) {
      lap.hrSum += r.hr
      lap.hrN++
    }
    if (r.cadence !== null) {
      lap.cadSum += r.cadence
      lap.cadN++
    }
    for (const w of this.prWindows) {
      const m = w.mean.push(r.power)
      if (m !== null && w.mean.count >= w.d) {
        const prev = this.bests[w.d] ?? null
        if (prev === null || m > prev + 1) {
          if (prev !== null) this.emit({ type: 'pr', durationS: w.d, watts: Math.round(m), previous: prev })
          this.bests[w.d] = m
        }
      }
    }
  }

  private logEvent(kind: Extract<JournalEvent, { type: 'event' }>['kind'], data?: Record<string, unknown>): void {
    const e: JournalEvent = { type: 'event', t: this.recorder.movingSeconds, ts: this.deps.clock.wallMs(), kind, data }
    this.events.push(e)
    this.pendingLines.push(encodeEvent(e))
  }

  private async flushJournal(): Promise<void> {
    if (this.pendingLines.length > 0) {
      this.unacked.push({ seq: ++this.seq, lines: this.pendingLines })
      this.pendingLines = []
    }
    if (this.flushing) return
    this.flushing = true
    try {
      await this.journalStarted
      while (this.unacked.length > 0) {
        const batch = this.unacked[0]!
        try {
          await this.deps.journal.append(this.rideId, batch.seq, batch.lines)
          this.unacked.shift()
        } catch (e) {
          this.emit({ type: 'journal-error', message: String(e) })
          break // keep it; retried on the next flush with the same seq
        }
      }
    } finally {
      this.flushing = false
    }
  }

  private emit(e: SessionEvent): void {
    for (const l of this.listeners) l(e)
  }
}

const roundOrNull = (v: number | null, dp: number) => (v === null ? null : Math.round(v * 10 ** dp) / 10 ** dp)
