// Wahoo KICKR Headwind fan. FreeGaz drives it in manual mode so fan speed can
// follow whatever the app decides (HR, speed, core temp).
import { encodeHeadwindSetMode, encodeHeadwindSetSpeed, parseHeadwindEvent } from '../../ble/codecs'
import { toHex, type GattSession } from '../../ble/transport'
import { CHAR, SERVICE } from '../../ble/uuids'
import type { DriverContext, FanDriver } from '../driver'
import type { CommandResult } from '../types'

export class HeadwindDriver implements FanDriver {
  readonly kind = 'headwind' as const
  readonly role = 'fan' as const
  private session: GattSession | null = null
  private ctx: DriverContext | null = null
  private service: string = SERVICE.wahooHeadwind
  private unsub: (() => Promise<void>) | null = null
  speedPct = 0

  async attach(session: GattSession, ctx: DriverContext): Promise<void> {
    this.session = session
    this.ctx = ctx
    const services = await session.services()
    this.service = services.includes(SERVICE.wahooHeadwind) ? SERVICE.wahooHeadwind : SERVICE.wahooHeadwindAlt
    this.unsub = await session.subscribe(this.service, CHAR.wahooHeadwindControl, (dv) => {
      ctx.capture({ dir: 'rx', service: this.service, characteristic: CHAR.wahooHeadwindControl, hex: toHex(dv) })
      const ev = parseHeadwindEvent(dv)
      if (ev) this.speedPct = ev.speedPct
    })
    await this.write(encodeHeadwindSetMode('manual'))
  }

  detach(): void {
    void this.unsub?.().catch(() => undefined)
    this.unsub = null
    this.session = null
  }

  async setSpeed(pct: number): Promise<CommandResult> {
    if (!this.session) return 'disconnected'
    try {
      await this.write(encodeHeadwindSetSpeed(Math.round(Math.max(0, Math.min(100, pct)))))
      this.speedPct = pct
      return 'ok'
    } catch {
      return 'timeout'
    }
  }

  private async write(bytes: Uint8Array): Promise<void> {
    this.ctx?.capture({ dir: 'tx', service: this.service, characteristic: CHAR.wahooHeadwindControl, hex: toHex(bytes) })
    await this.session!.write(this.service, CHAR.wahooHeadwindControl, bytes, { withResponse: false })
  }
}
