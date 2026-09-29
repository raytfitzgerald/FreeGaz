// SimWorld: a virtual rider on a virtual KICKR with a virtual HR strap (and
// optional pedals / cadence sensor), all advancing on the injected clock. It
// powers E2E tests (with time warp), the browser-only build and "demo mode".
import { BleError, type AcquireRequest, type BlePeripheral, type BleTransport } from '../ble/transport'
import type { DeviceRole } from '../devices/types'
import { DEFAULT_BIKE, stepSpeed, type BikeParams } from '../physics/bike'
import type { Cancel, Clock } from '../time/clock'
import { SimFtmsTrainer, SimHeartRateMonitor, SimPowerMeter, SimSpeedCadence, type SimBody } from './devices'
import { HeartRateModel, RiderModel, createRng } from './physiology'
import { SimPeripheral, type VirtualPeripheral } from './virtual-peripheral'

export type RiderBehavior =
  /**
   * ERG: follow the trainer. Otherwise ride at `freeW` (default 65 % FTP).
   * `exhausted: 'give-up'` makes an exhausted rider's cadence collapse when
   * ERG asks for more than CP, as at the end of a ramp test.
   */
  | { kind: 'auto'; freeW?: number; exhausted?: 'push-on' | 'give-up' }
  /** Hold a power in non-ERG modes (FTP-test effort, SIM climbs). */
  | { kind: 'hold'; watts: number }
  /** Stop pedalling. */
  | { kind: 'coast' }

export interface SimWorldOptions {
  clock: Clock
  seed?: number
  ftpW?: number
  riderKg?: number
  restHr?: number
  maxHr?: number
  lthr?: number
  /** Extra devices beyond trainer + HR. */
  extras?: ('power' | 'cadence')[]
}

const STEP_MS = 250
const WHEEL_M = 2.105

export class SimWorld {
  readonly transport: BleTransport
  readonly trainer: SimFtmsTrainer
  readonly hrm: SimHeartRateMonitor
  readonly powerMeter: SimPowerMeter
  readonly cadenceSensor: SimSpeedCadence
  readonly body: SimBody = {
    powerW: 0,
    cadenceRpm: 0,
    speedMps: 0,
    hrBpm: 62,
    rrMs: [],
    coreTempC: 37.1,
    skinTempC: 33.5,
    crankRevs: 0,
    crankEventTime: 0,
    wheelRevs: 0,
    wheelEventTime2048: 0,
    wheelEventTime1024: 0,
  }
  behavior: RiderBehavior = { kind: 'auto' }
  /** Force a cadence (e.g. 45 rpm to provoke the spiral-of-death guard). */
  cadenceOverride: number | null = null

  readonly ftpW: number
  private readonly rider: RiderModel
  private readonly hr: HeartRateModel
  private readonly bike: BikeParams
  private readonly devices: VirtualPeripheral[]
  private readonly available: Set<DeviceRole>
  private cancelStep: Cancel | null = null
  private cancelNotify: Cancel | null = null
  private readonly normalCadence: number
  private givingUp = false
  private crankPhase = 0
  private wheelPhase = 0
  private simTimeS = 0

  constructor(private readonly opts: SimWorldOptions) {
    const rng = createRng(opts.seed ?? 42)
    const now = () => opts.clock.now()
    const ftp = opts.ftpW ?? 250
    this.ftpW = ftp
    this.rider = new RiderModel({ ftpW: ftp, rng })
    this.normalCadence = this.rider.preferredCadence
    this.hr = new HeartRateModel({ restHr: opts.restHr ?? 55, maxHr: opts.maxHr ?? 188, ftpW: ftp, lthr: opts.lthr ?? 168, rng })
    this.bike = { ...DEFAULT_BIKE, riderKg: opts.riderKg ?? 78 }
    const body = () => this.body
    this.trainer = new SimFtmsTrainer('sim-trainer', now, rng, body)
    this.hrm = new SimHeartRateMonitor('sim-hrm', now, rng, body)
    this.powerMeter = new SimPowerMeter('sim-pedals', now, rng, body)
    this.cadenceSensor = new SimSpeedCadence('sim-cadence', now, rng, body)
    this.devices = [this.trainer, this.hrm, this.powerMeter, this.cadenceSensor]
    this.available = new Set<DeviceRole>(['trainer', 'hr', ...(opts.extras ?? [])])
    this.transport = new SimTransport(this)
    this.start()
  }

  deviceFor(role: DeviceRole): VirtualPeripheral | null {
    if (!this.available.has(role)) return null
    return this.devices.find((d) => d.role === role) ?? null
  }

  enable(role: 'power' | 'cadence'): void {
    this.available.add(role)
  }

  setBehavior(b: RiderBehavior): void {
    this.behavior = b
  }

  start(): void {
    if (this.cancelStep) return
    this.cancelStep = this.opts.clock.every(STEP_MS, () => this.step(STEP_MS / 1000))
    this.cancelNotify = this.opts.clock.every(1000, () => {
      for (const d of this.devices) (d as { tick?: () => void }).tick?.()
    })
  }

  stop(): void {
    this.cancelStep?.()
    this.cancelNotify?.()
    this.cancelStep = this.cancelNotify = null
  }

  /** Advance the rider/physics by dt seconds. */
  step(dtS: number): void {
    this.simTimeS += dtS
    const tr = this.trainer
    const b = this.behavior
    let out: { powerW: number; cadenceRpm: number }

    if (b.kind === 'coast') {
      out = this.rider.pedal({ mode: 'coast', dtS })
    } else if (tr.connected && tr.hasControl && tr.mode === 'erg') {
      this.giveUp(b.kind === 'auto' && b.exhausted === 'give-up' && this.rider.fatigued && tr.targetW > this.rider.cpW)
      out = this.rider.pedal({ mode: 'erg', targetW: tr.targetW, dtS })
    } else {
      this.giveUp(false)
      const desired = b.kind === 'hold' ? b.watts : (b.freeW ?? this.ftpW * 0.65)
      out = this.rider.pedal({ mode: 'effort', desiredW: desired, dtS })
    }

    const cadence = this.cadenceOverride ?? out.cadenceRpm
    this.body.powerW = out.powerW
    this.body.cadenceRpm = cadence

    // Virtual wheel speed: the trainer's flywheel follows physics at the sent grade.
    const grade = tr.mode === 'sim' ? tr.gradePct : 0
    this.body.speedMps = stepSpeed(this.body.speedMps, out.powerW, grade, dtS, this.bike)

    // Cumulative crank / wheel counters with sub-revolution phase.
    this.crankPhase += (cadence / 60) * dtS
    while (this.crankPhase >= 1) {
      this.crankPhase -= 1
      this.body.crankRevs = (this.body.crankRevs + 1) & 0xffff
      this.body.crankEventTime = Math.round(this.simTimeS * 1024) & 0xffff
    }
    this.wheelPhase += (this.body.speedMps / WHEEL_M) * dtS
    while (this.wheelPhase >= 1) {
      this.wheelPhase -= 1
      this.body.wheelRevs = (this.body.wheelRevs + 1) >>> 0
      this.body.wheelEventTime1024 = Math.round(this.simTimeS * 1024) & 0xffff
      this.body.wheelEventTime2048 = Math.round(this.simTimeS * 2048) & 0xffff
    }

    this.body.hrBpm = this.hr.step(out.powerW, dtS)
    this.body.rrMs.push(...this.hr.rr(dtS))
    if (this.body.rrMs.length > 50) this.body.rrMs.splice(0, this.body.rrMs.length - 50)
    // Core temp drifts up with sustained work, down at rest (very rough).
    const heat = (out.powerW / this.ftpW - 0.4) * 0.0009 * dtS
    this.body.coreTempC = Math.max(36.8, Math.min(39.5, this.body.coreTempC + heat))
  }
  /** An exhausted rider can't turn the pedals over against a high ERG load. */
  private giveUp(on: boolean): void {
    if (on === this.givingUp) return
    this.givingUp = on
    this.rider.setPreferredCadence(on ? 35 : this.normalCadence)
  }
}

class SimTransport implements BleTransport {
  readonly kind = 'sim' as const
  constructor(private readonly world: SimWorld) {}

  async isAvailable(): Promise<boolean> {
    return true
  }

  async acquire(req: AcquireRequest): Promise<BlePeripheral> {
    const device = this.world.deviceFor(req.role)
    if (!device) throw new BleError(`No simulated ${req.role} device`, 'cancelled')
    return new SimPeripheral(device)
  }
}
