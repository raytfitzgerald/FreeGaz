// Wahoo proprietary trainer control (fallback for KICKRs without FTMS, i.e.
// pre-2018 models or very old firmware). Data comes from the standard Cycling
// Power measurement; control goes to characteristic a026e005 inside CPS.
import { encodeWahooCommand, parseWahooResponse, type WahooCommand } from '../../ble/codecs'
import { toHex, type GattSession } from '../../ble/transport'
import { CHAR, SERVICE } from '../../ble/uuids'
import type { DriverContext, TrainerDriver } from '../driver'
import type { CommandResult, TrainerCaps, TrainerCommand } from '../types'
import { PowerMeterDriver } from './sensors'

/** Wahoo firmware drops commands sent faster than this (Incyclist uses 2 s for ERG). */
const MIN_WRITE_GAP_MS = 2000
const RESPONSE_TIMEOUT_MS = 800

export class WahooTrainerDriver implements TrainerDriver {
  readonly kind = 'wahoo-legacy' as const
  readonly role = 'trainer' as const
  readonly caps: TrainerCaps = { erg: true, sim: true, resistance: true, spinDown: false, powerRange: { min: 0, max: 2000, step: 1 } }

  private readonly data = new PowerMeterDriver('trainer')
  private session: GattSession | null = null
  private ctx: DriverContext | null = null
  private unsub: (() => Promise<void>) | null = null
  private lastWriteAt = -Infinity
  private simInitialized = false
  private waiter: { op: number; resolve: (ok: boolean) => void } | null = null
  private readonly controlLostListeners = new Set<() => void>()

  constructor(private readonly riderKg = 80) {}

  async attach(session: GattSession, ctx: DriverContext): Promise<void> {
    this.session = session
    this.ctx = ctx
    this.simInitialized = false
    // Every KICKR from 2018 on speaks FTMS with current firmware; landing here
    // usually means old firmware (and its ERG/SIM quirks).
    ctx.warn('This trainer is using Wahoo’s older control protocol. Update its firmware in the Wahoo app for FTMS control and the latest ERG fixes.')
    await this.data.attach(session, ctx)
    this.unsub = await session.subscribe(SERVICE.cyclingPower, CHAR.wahooTrainerControl, (dv) => {
      ctx.capture({ dir: 'rx', service: SERVICE.cyclingPower, characteristic: CHAR.wahooTrainerControl, hex: toHex(dv) })
      const r = parseWahooResponse(dv)
      if (r && this.waiter && r.op === this.waiter.op) {
        this.waiter.resolve(r.ok)
        this.waiter = null
      }
    })
    await this.write({ op: 'unlock' })
  }

  detach(): void {
    this.data.detach()
    void this.unsub?.().catch(() => undefined)
    this.unsub = null
    this.session = null
  }

  onControlLost(listener: () => void): () => void {
    this.controlLostListeners.add(listener)
    return () => this.controlLostListeners.delete(listener)
  }

  async send(cmd: TrainerCommand): Promise<CommandResult> {
    if (!this.session) return 'disconnected'
    try {
      switch (cmd.kind) {
        case 'erg':
          return (await this.write({ op: 'erg', watts: Math.round(cmd.watts) })) ? 'ok' : 'rejected'
        case 'resistance':
          return (await this.write({ op: 'resistance', fraction: Math.max(0, Math.min(1, cmd.pct / 100)) })) ? 'ok' : 'rejected'
        case 'sim':
          if (!this.simInitialized) {
            const ok = await this.write({ op: 'simInit', weightKg: this.riderKg, crr: cmd.crr, cwKgPerM: cmd.cwKgPerM })
            if (!ok) return 'rejected'
            this.simInitialized = true
          }
          if (cmd.windMps !== 0) await this.write({ op: 'wind', mps: cmd.windMps })
          return (await this.write({ op: 'grade', gradePct: cmd.gradePct })) ? 'ok' : 'rejected'
        case 'idle':
          return 'ok'
      }
    } catch {
      return 'timeout'
    }
  }

  private async write(cmd: WahooCommand): Promise<boolean> {
    const session = this.session
    const ctx = this.ctx
    if (!session || !ctx) throw new Error('disconnected')
    const wait = this.lastWriteAt + MIN_WRITE_GAP_MS - ctx.now()
    if (wait > 0 && cmd.op !== 'unlock') await new Promise<void>((r) => setTimeout(() => r(), wait))
    const bytes = encodeWahooCommand(cmd)
    const acked = new Promise<boolean>((resolve) => {
      this.waiter = { op: bytes[0]!, resolve }
      setTimeout(() => {
        if (this.waiter?.op === bytes[0]) this.waiter = null
        // Many units never answer; treat silence as success (Incyclist does the same).
        resolve(true)
      }, RESPONSE_TIMEOUT_MS)
    })
    ctx.capture({ dir: 'tx', service: SERVICE.cyclingPower, characteristic: CHAR.wahooTrainerControl, hex: toHex(bytes) })
    await session.write(SERVICE.cyclingPower, CHAR.wahooTrainerControl, bytes, { withResponse: true })
    this.lastWriteAt = ctx.now()
    return acked
  }
}
