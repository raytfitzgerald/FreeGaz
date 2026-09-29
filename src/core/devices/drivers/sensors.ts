// Read-only sensor drivers: heart rate, power meter, speed/cadence, CORE, Moxy.
import {
  RevolutionRateCalculator,
  parseCoreTemp,
  parseCscMeasurement,
  parseCyclingPowerMeasurement,
  parseHeartRateMeasurement,
  parseMoxy,
  wheelSpeedMps,
} from '../../ble/codecs'
import { toHex, type GattSession, type Uuid } from '../../ble/transport'
import { CHAR, SERVICE } from '../../ble/uuids'
import type { Driver, DriverContext } from '../driver'
import type { DeviceRole, DriverKind } from '../types'

/** Default road wheel circumference (700x25c), mm. */
export const DEFAULT_WHEEL_MM = 2105

abstract class NotifyDriver implements Driver {
  abstract readonly kind: DriverKind
  protected ctx: DriverContext | null = null
  private unsub: (() => Promise<void>) | null = null

  constructor(
    readonly role: DeviceRole,
    private readonly service: Uuid,
    private readonly characteristic: Uuid,
  ) {}

  async attach(session: GattSession, ctx: DriverContext): Promise<void> {
    this.ctx = ctx
    this.reset()
    this.unsub = await session.subscribe(this.service, this.characteristic, (dv) => {
      ctx.capture({ dir: 'rx', service: this.service, characteristic: this.characteristic, hex: toHex(dv) })
      try {
        this.onValue(dv, ctx, ctx.now())
      } catch (e) {
        ctx.warn(`Bad ${this.kind} packet: ${String(e)}`)
      }
    })
  }

  detach(): void {
    void this.unsub?.().catch(() => undefined)
    this.unsub = null
  }

  protected reset(): void {}
  protected abstract onValue(dv: DataView, ctx: DriverContext, t: number): void
}

export class HeartRateDriver extends NotifyDriver {
  readonly kind = 'hrs' as const
  constructor(role: DeviceRole = 'hr') {
    super(role, SERVICE.heartRate, CHAR.heartRateMeasurement)
  }
  protected onValue(dv: DataView, ctx: DriverContext, t: number): void {
    const m = parseHeartRateMeasurement(dv)
    // Sensors report 0 bpm while the strap is dry / off the chest: that's missing, not zero.
    if (m.bpm > 0 && m.contactDetected !== false) ctx.emit('hr', m.bpm, t)
    if (m.rrMs.length > 0) ctx.emitRr(m.rrMs, t)
  }
}

export class PowerMeterDriver extends NotifyDriver {
  readonly kind = 'cps' as const
  private crank = new RevolutionRateCalculator({ timeResolutionHz: 1024, revBits: 16 })
  private wheel = new RevolutionRateCalculator({ timeResolutionHz: 2048, revBits: 32, maxRatePerMin: 2500 })

  constructor(
    role: DeviceRole = 'power',
    private readonly wheelMm = DEFAULT_WHEEL_MM,
  ) {
    super(role, SERVICE.cyclingPower, CHAR.cyclingPowerMeasurement)
  }
  protected override reset(): void {
    this.crank.reset()
    this.wheel.reset()
  }
  protected onValue(dv: DataView, ctx: DriverContext, t: number): void {
    const m = parseCyclingPowerMeasurement(dv)
    ctx.emit('power', Math.max(0, m.powerW), t)
    if (m.crankRevs !== undefined && m.crankEventTime !== undefined) {
      const rpm = this.crank.update(m.crankRevs, m.crankEventTime, t)
      if (rpm !== null) ctx.emit('cadence', rpm, t)
    }
    if (m.wheelRevs !== undefined && m.wheelEventTime !== undefined) {
      const rpm = this.wheel.update(m.wheelRevs, m.wheelEventTime, t)
      if (rpm !== null) ctx.emit('speed', wheelSpeedMps(rpm, this.wheelMm), t)
    }
    if (m.pedalBalancePct !== undefined) {
      // We store % LEFT. The reference bit is "left" or "unknown" (never
      // "right"), and meters that leave it unknown report the left pedal in
      // practice, so the value is used as-is either way.
      ctx.emit('lrBalance', m.pedalBalancePct, t)
    }
  }
}

export class CscDriver extends NotifyDriver {
  readonly kind = 'csc' as const
  private crank = new RevolutionRateCalculator({ timeResolutionHz: 1024, revBits: 16 })
  private wheel = new RevolutionRateCalculator({ timeResolutionHz: 1024, revBits: 32, maxRatePerMin: 2500 })

  constructor(
    role: DeviceRole = 'cadence',
    private readonly wheelMm = DEFAULT_WHEEL_MM,
  ) {
    super(role, SERVICE.cyclingSpeedCadence, CHAR.cscMeasurement)
  }
  protected override reset(): void {
    this.crank.reset()
    this.wheel.reset()
  }
  protected onValue(dv: DataView, ctx: DriverContext, t: number): void {
    const m = parseCscMeasurement(dv)
    if (m.crankRevs !== undefined && m.crankEventTime !== undefined) {
      const rpm = this.crank.update(m.crankRevs, m.crankEventTime, t)
      if (rpm !== null) ctx.emit('cadence', rpm, t)
    }
    if (m.wheelRevs !== undefined && m.wheelEventTime !== undefined) {
      const rpm = this.wheel.update(m.wheelRevs, m.wheelEventTime, t)
      if (rpm !== null) ctx.emit('speed', wheelSpeedMps(rpm, this.wheelMm), t)
    }
  }
}

export class CoreTempDriver extends NotifyDriver {
  readonly kind = 'core' as const
  constructor(role: DeviceRole = 'coreTemp') {
    super(role, SERVICE.coreTemp, CHAR.coreTempMeasurement)
  }
  protected onValue(dv: DataView, ctx: DriverContext, t: number): void {
    const m = parseCoreTemp(dv)
    const toC = (v: number) => (m.units === 'F' ? ((v - 32) * 5) / 9 : v)
    if (m.coreTempC !== undefined) ctx.emit('coreTemp', toC(m.coreTempC), t)
    if (m.skinTempC !== undefined) ctx.emit('skinTemp', toC(m.skinTempC), t)
    if (m.heatStrainIndex !== undefined) ctx.emit('heatStrain', m.heatStrainIndex, t)
  }
}

export class MoxyDriver extends NotifyDriver {
  readonly kind = 'moxy' as const
  constructor(role: DeviceRole = 'smo2') {
    super(role, SERVICE.moxy, CHAR.moxyData)
  }
  protected onValue(dv: DataView, ctx: DriverContext, t: number): void {
    const m = parseMoxy(dv)
    ctx.emit('smo2', m.smo2Pct, t)
    ctx.emit('thb', m.thbGdl, t)
  }
}
