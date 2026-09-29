// RideProbe: reads what the detector needs from a live ride, once per engine
// tick. A handful of SensorHub lookups per tick; the session's live metrics
// (NP, W′bal...) are recomputed at most once a second.
import { scaledErgTarget, type TrainerController } from '../control/trainer-controller'
import type { RideSession } from '../ride/session'
import type { SensorHub } from '../sensors/hub'
import type { DetectorMetrics, DetectorTick } from './detector'

const AVG_MS = 3000

export class RideProbe {
  private metrics: DetectorMetrics | null = null
  private metricsAt = -Infinity

  constructor(
    private readonly session: RideSession,
    private readonly hub: SensorHub,
    private readonly controller: TrainerController,
    private readonly metricsEveryMs = 1000,
  ) {}

  read(now: number): DetectorTick {
    const s = this.session
    const hub = this.hub
    const plan = s.planTick
    const desired = this.controller.snapshot.desired
    const settings = this.controller.currentSettings
    if (now - this.metricsAt >= this.metricsEveryMs) {
      const m = s.liveMetrics()
      this.metrics = { wbalJ: m.wbalJ, np: m.np, tss: m.tss, kj: m.kj, if: m.if }
      this.metricsAt = now
    }
    return {
      now,
      state: s.currentState,
      plan,
      // the session records the same target: the plan's, or manual ERG watts in a free ride
      targetW: plan.targetW ?? (desired.mode === 'erg' ? scaledErgTarget(desired.watts, settings) : null),
      power: hub.value('power', now),
      cadence: hub.value('cadence', now),
      power3s: hub.meanOver('power', now - AVG_MS, now),
      cadence3s: hub.meanOver('cadence', now - AVG_MS, now),
      hr: hub.value('hr', now),
      erg: desired.mode === 'erg',
      intensityPct: settings.intensityPct,
      movingS: s.movingSeconds,
      metrics: this.metrics,
    }
  }
}
