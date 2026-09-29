// The engine loop for "just ride": every tick it reads the SensorHub, lets
// the TrainerController reconcile, and publishes a LiveFrame. Recording
// (RideSession, M2) layers on top of the same tick.
import type { LiveFrame } from '../../shared/live'
import { PowerMatch, WINDOW_MS } from '../control/power-match'
import { dfaAlpha1, rmssd } from '../metrics/hrv'
import type { TrainerController } from '../control/trainer-controller'
import type { SensorHub } from '../sensors/hub'
import type { Clock, Cancel } from '../time/clock'

export const ENGINE_TICK_MS = 250

export interface LiveEngineDeps {
  clock: Clock
  hub: SensorHub
  controller: TrainerController
  /** Is a trainer bound to the controller right now? */
  trainerConnected: () => boolean
  simulated: () => boolean
  onFrame: (frame: LiveFrame) => void
  /** Use power pedals to correct ERG (PowerMatch). Default on. */
  powerMatch?: () => boolean
}

export class LiveEngine {
  private cancel: Cancel | null = null
  private paused = false
  private controlLost = false
  private offController: (() => void) | null = null
  private lastPrune = 0
  private readonly extraTick = new Set<(now: number) => void>()
  private readonly powerMatch = new PowerMatch()
  private lastErgTarget: number | null = null
  private powerMatchOn = false
  private hrv = { at: -Infinity, dfa: null as number | null, rmssd: null as number | null }

  constructor(private readonly deps: LiveEngineDeps) {}

  start(): void {
    if (this.cancel) return
    this.offController = this.deps.controller.on((e) => {
      if (e.type === 'control-lost') this.controlLost = true
      if (e.type === 'sent' && e.result === 'ok') this.controlLost = false
    })
    this.cancel = this.deps.clock.every(ENGINE_TICK_MS, () => this.tick())
    this.tick()
  }

  stop(): void {
    this.cancel?.()
    this.cancel = null
    this.offController?.()
    this.offController = null
  }

  setPaused(paused: boolean): void {
    this.paused = paused
  }

  /** Extra per-tick work (recorder, workout player...). */
  onTick(fn: (now: number) => void): () => void {
    this.extraTick.add(fn)
    return () => this.extraTick.delete(fn)
  }

  /** DFA-α1 and RMSSD, recomputed every 5 s (DFA needs ~2 min of beats). */
  private heartRateVariability(now: number): { dfaA1: number | null; rmssd: number | null } {
    if (now - this.hrv.at >= 5000) {
      const hub = this.deps.hub
      this.hrv = { at: now, dfa: dfaAlpha1(hub.rrBetween(now - 120_000, now)), rmssd: rmssd(hub.rrBetween(now - 60_000, now)) }
    }
    return { dfaA1: roundTo(this.hrv.dfa, 2), rmssd: round(this.hrv.rmssd) }
  }

  /** Feeds PowerMatch and hands its factor to the controller (only while pedals and a trainer both report). */
  private applyPowerMatch(now: number): void {
    const { hub, controller } = this.deps
    const ids = hub.sourcesFor('power')
    const pedals = pedalSource(ids)
    const trainer = trainerSource(ids)
    const enabled = (this.deps.powerMatch?.() ?? true) && pedals !== null && trainer !== null
    if (!enabled) {
      if (this.powerMatchOn || controller.currentSettings.powerMatchFactor !== 1) controller.updateSettings({ powerMatchFactor: 1 })
      this.powerMatch.reset()
      this.powerMatchOn = false
      return
    }
    this.powerMatchOn = true
    const snap = controller.snapshot
    const target = snap.desired.mode === 'erg' ? snap.desired.watts : null
    const changed = target !== this.lastErgTarget
    this.lastErgTarget = target
    const factor = this.powerMatch.update({
      now,
      ergSteady: target !== null && !changed && snap.guard === 'none' && !this.paused,
      pedalW: hub.meanOver('power', now - WINDOW_MS, now, pedals),
      trainerW: hub.meanOver('power', now - WINDOW_MS, now, trainer),
    })
    if (Math.abs(factor - controller.currentSettings.powerMatchFactor) >= 0.002) controller.updateSettings({ powerMatchFactor: factor })
  }

  tick(): void {
    const { clock, hub, controller } = this.deps
    const now = clock.now()
    const cadence = hub.value('cadence', now)
    const power = hub.value('power', now)
    const hr = hub.value('hr', now)

    this.applyPowerMatch(now)
    controller.tick({ now, cadence, power, hr, paused: this.paused })
    for (const fn of this.extraTick) fn(now)

    if (now - this.lastPrune > 30_000) {
      hub.prune(now)
      this.lastPrune = now
    }

    const snap = controller.snapshot
    const eff = snap.effective
    const desired = snap.desired
    const speed = hub.value('speed', now)
    this.deps.onFrame({
      t: now,
      wall: clock.wallMs(now),
      power,
      power3s: round(hub.meanOver('power', now - 3000, now)),
      power10s: round(hub.meanOver('power', now - 10_000, now)),
      power30s: round(hub.meanOver('power', now - 30_000, now)),
      lrBalance: roundTo(hub.value('lrBalance', now), 1),
      cadence: cadence === null ? null : Math.round(cadence),
      hr: hr === null ? null : Math.round(hr),
      speedKmh: speed === null ? null : Math.round(speed * 3.6 * 10) / 10,
      coreTemp: roundTo(hub.value('coreTemp', now), 1),
      ...this.heartRateVariability(now),
      trainer: {
        mode: desired.mode,
        targetW: eff.kind === 'erg' ? eff.watts : null,
        gradePct: eff.kind === 'sim' ? eff.gradePct : null,
        rawGradePct: desired.mode === 'sim' ? desired.gradePct : null,
        resistancePct: eff.kind === 'resistance' ? eff.pct : null,
        targetHr: desired.mode === 'hr' ? desired.targetBpm : null,
        intensityPct: controller.currentSettings.intensityPct,
        guard: snap.guard,
        controlLost: this.controlLost,
        powerMatch: this.powerMatchOn && this.powerMatch.active ? Math.round(this.powerMatch.factor * 1000) / 1000 : null,
        connected: this.deps.trainerConnected(),
      },
      sources: {
        power: hub.latest('power', now)?.sourceId ?? null,
        cadence: hub.latest('cadence', now)?.sourceId ?? null,
        hr: hub.latest('hr', now)?.sourceId ?? null,
      },
      simulated: this.deps.simulated(),
    })
  }
}

const round = (v: number | null) => (v === null ? null : Math.round(v))
const pedalSource = (ids: string[]) => ids.find((s) => s.startsWith('power:')) ?? null
const trainerSource = (ids: string[]) => ids.find((s) => s.startsWith('trainer:')) ?? null
const roundTo = (v: number | null, dp: number) => (v === null ? null : Math.round(v * 10 ** dp) / 10 ** dp)
