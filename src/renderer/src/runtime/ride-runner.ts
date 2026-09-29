// Owns the active RideSession inside the renderer: wiring it to the engine
// tick, the journal (via main), keep-awake, commands and persistence.
import { decideFtpUpdate, FTP_SOURCE } from '@core/ride/ftp-update'
import { FuelingTimer } from '@core/ride/fueling'
import type { RidePlan } from '@core/ride/plan'
import type { RideRecord } from '@core/ride/recorder'
import { RideSession, type JournalSink } from '@core/ride/session'
import { WorkoutPlan } from '@core/ride/workout-plan'
import type { RideKind } from '@core/ride/types'
import type { LiveEngine } from '@core/ride/live-engine'
import type { TrainerController } from '@core/control/trainer-controller'
import type { SensorHub } from '@core/sensors/hub'
import type { Clock } from '@core/time/clock'
import type { LiveFrame, RideCommand } from '@shared/live'
import { athleteSnapshot, currentFtp, deleteFtp, recordFtp } from '../db/athlete-repo'
import { bestPowers } from '../db/bests'
import { db } from '../db/db'
import { powerCurve } from '../db/fitness'
import { discardRecovery, pendingRecoveries, recoverRide, saveFinishedRide } from '../db/rides-repo'
import { bridge } from '../platform/bridge'
import { pushToast, rideStore } from '../stores/ride'
import { settingsStore } from '../stores/settings'

const journal: JournalSink = {
  begin: async (rideId, meta) => {
    await bridge().invoke('journal.begin', { rideId, meta })
  },
  append: async (rideId, seq, lines) => (await bridge().invoke('journal.append', { rideId, seq, lines })).durableSeq,
  close: async (rideId) => {
    await bridge().invoke('journal.close', { rideId })
  },
}

const newRideId = () => `r${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}`

export interface RideRunnerDeps {
  clock: Clock
  hub: SensorHub
  controller: TrainerController
  engine: LiveEngine
  simulated: boolean
}

export class RideRunner {
  session: RideSession | null = null
  private offTick: (() => void) | null = null
  private offSession: (() => void) | null = null
  private lastPublish = 0
  private lastMetrics = 0
  private actualSeen = 0
  private actualRev = -1
  private readonly sessionListeners = new Set<(session: RideSession) => void>()

  constructor(private readonly deps: RideRunnerDeps) {
    bridge().on('ride.command', (cmd) => this.command(cmd))
    bridge().on('power.suspend', ({ suspended }) => {
      if (suspended) this.session?.pause('system')
    })
  }

  get active(): boolean {
    return !!this.session && this.session.currentState !== 'finished'
  }

  /**
   * Called with every new ride right after it starts, for features that react
   * to rides (the coach, integrations). Subscribe to its events with session.on().
   */
  onSessionStart(listener: (session: RideSession) => void): () => void {
    this.sessionListeners.add(listener)
    return () => this.sessionListeners.delete(listener)
  }

  async start(opts: { plan?: RidePlan; name?: string; kind?: RideKind } = {}): Promise<void> {
    if (this.active) return
    const athlete = await athleteSnapshot()
    const bests = await bestPowers([5, 60, 300, 1200]).catch(() => ({}))
    const rideId = newRideId()
    const name = opts.plan?.name ?? opts.name ?? defaultName()
    const session = new RideSession(
      { clock: this.deps.clock, hub: this.deps.hub, controller: this.deps.controller, journal, setPaused: (p) => this.deps.engine.setPaused(p) },
      {
        rideId,
        name,
        kind: opts.plan?.kind ?? opts.kind ?? 'free',
        simulated: this.deps.simulated,
        athlete,
        autoPause: settingsStore.getState().trainer.autoPause,
        plan: opts.plan,
        bests,
      },
    )
    this.session = session
    const workout = opts.plan instanceof WorkoutPlan ? opts.plan : null
    this.actualSeen = 0
    this.actualRev = -1
    this.offSession = session.on((e) => {
      if (e.type === 'cue') rideStore.setState({ cue: { text: e.text, at: Date.now() } })
      if (e.type === 'journal-error') rideStore.setState({ error: `Ride journal: ${e.message}` })
      if (e.type === 'rescue') rideStore.setState({ rescue: { ...e.offer, at: Date.now() } })
      if (e.type === 'plan-finished') rideStore.setState({ planFinished: true })
      if (e.type === 'pr') pushToast({ tone: 'pr', title: `New ${prLabel(e.durationS)} best: ${e.watts} W`, body: e.previous === null ? undefined : `Previous best ${Math.round(e.previous)} W` })
    })
    const fueling = new FuelingTimer(settingsStore.getState().fueling)
    this.offTick = this.deps.engine.onTick((now) => {
      session.tick(now)
      if (opts.plan) rideStore.setState({ plan: session.planTick })
      if (workout) this.trackActual(session, workout)
      for (const r of fueling.due(session.movingSeconds)) {
        pushToast(r.kind === 'drink' ? { tone: 'fuel', title: 'Drink', body: 'A few good sips.' } : { tone: 'fuel', title: `Eat about ${r.grams} g of carbs`, body: 'A gel, a bar or a banana.' })
      }
      if (now - this.lastMetrics >= 1000) {
        this.lastMetrics = now
        rideStore.setState({ snapshot: session.snapshot(), metrics: session.liveMetrics() })
      }
    })
    session.start()
    for (const l of this.sessionListeners) l(session)
    rideStore.setState({
      active: true,
      rideId,
      snapshot: session.snapshot(),
      error: null,
      lastSaved: null,
      plan: opts.plan ? session.planTick : null,
      workout: workout ? { plan: workout, rev: workout.revision } : null,
      actual: workout ? new Array<number | null>(Math.ceil(workout.timeline.durationS)).fill(null) : null,
      rescue: null,
      planFinished: false,
      ftpTest: null,
    })
    void bridge().invoke('power.keepAwake', { on: true })
  }

  command(cmd: RideCommand): void {
    if (cmd.type === 'muteCoach') {
      window.dispatchEvent(new CustomEvent('freegaz:mute-coach'))
      return
    }
    if (cmd.type === 'rescue') rideStore.setState({ rescue: null })
    this.session?.command(cmd)
    if (this.session) rideStore.setState({ snapshot: this.session.snapshot(), plan: this.session.options.plan ? this.session.planTick : null })
  }

  /** Keeps the chart's actual-power trace aligned with the (possibly edited) workout timeline. */
  private trackActual(session: RideSession, plan: WorkoutPlan): void {
    const records = session.records
    if (plan.revision !== this.actualRev) {
      this.actualRev = plan.revision
      this.actualSeen = records.length
      rideStore.setState({ workout: { plan, rev: plan.revision }, actual: plan.alignToTimeline(records, (r: RideRecord) => r.power) })
      return
    }
    if (records.length === this.actualSeen) return
    const actual = [...(rideStore.getState().actual ?? [])]
    for (let i = this.actualSeen; i < records.length; i++) {
      const r = records[i]!
      const k = Math.floor(plan.positionAt(r.t + 0.5))
      if (k >= 0 && k < actual.length) actual[k] = r.power
    }
    this.actualSeen = records.length
    rideStore.setState({ actual })
  }

  /** Stops, saves (Dexie + FIT + uploads) and resets. */
  async finish(): Promise<void> {
    const session = this.session
    if (!session) return
    rideStore.setState({ saving: true })
    try {
      const { records } = await session.finish()
      this.detach()
      if (records.length < 5) {
        await bridge().invoke('journal.remove', { rideId: session.rideId })
        rideStore.setState({ active: false, rideId: null, snapshot: null, metrics: null, saving: false, ...ENDED })
        return
      }
      const plan = session.options.plan
      if (plan instanceof WorkoutPlan && plan.workout.ftpTest) await this.applyFtpTest(session, plan, records)
      const saved = await saveFinishedRide({
        rideId: session.rideId,
        name: session.options.name,
        kind: session.kind,
        simulated: session.options.simulated,
        startedAt: records[0]!.ts - 1000,
        athlete: session.options.athlete,
        records,
        workoutId: plan?.workoutId,
        workoutName: plan?.kind === 'workout' || plan?.kind === 'ftp-test' ? plan.name : undefined,
        workoutJson: plan?.workoutJson,
      })
      await recordTestOnRide(session.rideId)
      rideStore.setState({ active: false, rideId: null, snapshot: null, metrics: null, saving: false, lastSaved: saved, ...ENDED })
    } catch (e) {
      rideStore.setState({ saving: false, error: `Could not save the ride: ${e instanceof Error ? e.message : String(e)}. It is safe in the journal and will be offered for recovery.` })
    } finally {
      this.session = null
      void bridge().invoke('power.keepAwake', { on: false })
    }
  }

  /** Throws the ride away (the user confirmed). */
  async discard(): Promise<void> {
    const session = this.session
    if (!session) return
    await session.finish()
    this.detach()
    await bridge().invoke('journal.remove', { rideId: session.rideId })
    this.session = null
    rideStore.setState({ active: false, rideId: null, snapshot: null, metrics: null, ...ENDED })
    void bridge().invoke('power.keepAwake', { on: false })
  }

  /** Works out FTP from a finished test and saves it when that's safe (see decideFtpUpdate). */
  private async applyFtpTest(session: RideSession, plan: WorkoutPlan, records: RideRecord[]): Promise<void> {
    const result = plan.ftpResult(records)
    if (!result) return
    const [current, curve] = await Promise.all([currentFtp(), powerCurve().catch(() => null)])
    // Only a proper critical-power fit is trusted as a sanity check.
    const eftpW = curve?.eftp.method === 'cp' ? curve.eftp.ftpW : null
    const decision = decideFtpUpdate({ result, currentFtpW: current?.ftpW ?? null, simulated: session.options.simulated, eftpW })
    let savedEntryId: number | null = null
    if (decision.action === 'auto') savedEntryId = await saveTestFtp(session, plan, decision.newFtpW, result.basisW)
    rideStore.setState({
      ftpTest: {
        rideId: session.rideId,
        testName: plan.name,
        protocol: plan.workout.ftpTest!.protocol,
        simulated: session.options.simulated,
        result,
        decision,
        previousFtpW: current?.ftpW ?? null,
        savedEntryId,
      },
    })
  }

  /** The rider accepted a result that needed confirming. */
  async acceptFtpTest(): Promise<void> {
    const t = rideStore.getState().ftpTest
    if (!t || t.savedEntryId !== null || t.decision.action === 'none') return
    const id = await recordFtp({ date: Date.now(), ftpW: t.decision.newFtpW, source: FTP_SOURCE[t.protocol], rideId: t.rideId, basisW: Math.round(t.result.basisW) })
    rideStore.setState({ ftpTest: { ...t, savedEntryId: id } })
    await recordTestOnRide(t.rideId)
  }

  /** Undo an auto-saved (or accepted) test result. */
  async undoFtpTest(): Promise<void> {
    const t = rideStore.getState().ftpTest
    if (!t || t.savedEntryId === null) return
    await deleteFtp(t.savedEntryId)
    rideStore.setState({ ftpTest: { ...t, savedEntryId: null } })
    await recordTestOnRide(t.rideId)
  }

  /** Called ~4 Hz from the engine frame to feed the mini-HUD and phone. */
  publish(frame: LiveFrame): void {
    const now = frame.t
    if (now - this.lastPublish < 240) return
    this.lastPublish = now
    bridge().send('live.publish', { frame, ride: this.session && this.session.currentState !== 'finished' ? this.session.snapshot() : null })
  }

  async loadRecoveries(): Promise<void> {
    rideStore.setState({ recoveries: await pendingRecoveries() })
  }

  async recover(rideId: string): Promise<void> {
    const saved = await recoverRide(rideId)
    rideStore.setState((s) => ({ recoveries: s.recoveries.filter((r) => r.rideId !== rideId), lastSaved: saved ?? s.lastSaved }))
  }

  async discardRecovery(rideId: string): Promise<void> {
    await discardRecovery(rideId)
    rideStore.setState((s) => ({ recoveries: s.recoveries.filter((r) => r.rideId !== rideId) }))
  }

  private detach(): void {
    this.offTick?.()
    this.offSession?.()
    this.offTick = this.offSession = null
  }
}

function prLabel(s: number): string {
  return s < 60 ? `${s}-second` : `${Math.round(s / 60)}-minute`
}

/** Keeps the ride's own record of its FTP test (result and whether it was applied) in step. */
async function recordTestOnRide(rideId: string): Promise<void> {
  const t = rideStore.getState().ftpTest
  if (!t || t.rideId !== rideId) return
  await db().rides.update(rideId, {
    ftpTest: {
      protocol: t.protocol,
      ftpW: t.decision.newFtpW,
      basisW: Math.round(t.result.basisW),
      valid: t.result.valid,
      problems: t.result.problems,
      applied: t.savedEntryId !== null,
    },
  })
}

const ENDED = { plan: null, workout: null, actual: null, rescue: null, planFinished: false } as const

async function saveTestFtp(session: RideSession, plan: WorkoutPlan, ftpW: number, basisW: number): Promise<number> {
  return recordFtp({
    date: Date.now(),
    ftpW,
    source: FTP_SOURCE[plan.workout.ftpTest!.protocol],
    rideId: session.rideId,
    basisW: Math.round(basisW),
    weightKg: session.options.athlete.weightKg,
  })
}

function defaultName(): string {
  const h = new Date().getHours()
  const part = h < 5 ? 'Night' : h < 11 ? 'Morning' : h < 14 ? 'Lunch' : h < 18 ? 'Afternoon' : 'Evening'
  return `${part} ride`
}
