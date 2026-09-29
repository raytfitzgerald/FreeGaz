// The engine loop for "just ride": every tick it reads the SensorHub, lets
// the TrainerController reconcile, and publishes a LiveFrame. Recording
// (RideSession, M2) layers on top of the same tick.
import type { LiveFrame } from '../../shared/live'
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
}

export class LiveEngine {
  private cancel: Cancel | null = null
  private paused = false
  private controlLost = false
  private offController: (() => void) | null = null
  private lastPrune = 0
  private readonly extraTick = new Set<(now: number) => void>()

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

  tick(): void {
    const { clock, hub, controller } = this.deps
    const now = clock.now()
    const cadence = hub.value('cadence', now)
    const power = hub.value('power', now)
    const hr = hub.value('hr', now)

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
      cadence: cadence === null ? null : Math.round(cadence),
      hr: hr === null ? null : Math.round(hr),
      speedKmh: speed === null ? null : Math.round(speed * 3.6 * 10) / 10,
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
