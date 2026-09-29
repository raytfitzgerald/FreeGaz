// DeviceManager: one device per role. Owns the connect → probe → attach
// lifecycle, keeps connections alive with backoff reconnects, reads Device
// Information and battery level, and forwards packet captures.
import { BleError, type BlePeripheral, type BleTransport, type GattSession, queuedSession } from '../ble/transport'
import { ALL_OPTIONAL_SERVICES, CHAR, SERVICE } from '../ble/uuids'
import type { SensorHub } from '../sensors/hub'
import type { Clock } from '../time/clock'
import {
  type CaptureEntry,
  type Driver,
  type DriverContext,
  type DriverFactory,
  type TrainerDriver,
  isTrainerDriver,
  sourceIdFor,
} from './driver'
import type { ConnectionState, DeviceInfo, DeviceRole, DriverKind } from './types'

export interface ManagedDevice {
  role: DeviceRole
  name: string
  peripheralId: string
  chooserId: string
  state: ConnectionState
  drivers: DriverKind[]
  info: DeviceInfo
  battery?: number
  lastError?: string
  reconnects: number
  connectedAt?: number
}

export type DeviceEvent =
  | { type: 'connected'; role: DeviceRole; device: ManagedDevice }
  | { type: 'reconnected'; role: DeviceRole; device: ManagedDevice }
  | { type: 'disconnected'; role: DeviceRole; willRetry: boolean }
  | { type: 'warning'; role: DeviceRole; message: string }

/** Filters used to populate the chooser for each role. */
export const ROLE_FILTERS: Record<DeviceRole, { services: string[]; namePrefixes?: string[] }> = {
  trainer: { services: [SERVICE.fitnessMachine, SERVICE.cyclingPower], namePrefixes: ['KICKR', 'Wahoo KICKR'] },
  hr: { services: [SERVICE.heartRate] },
  power: { services: [SERVICE.cyclingPower] },
  cadence: { services: [SERVICE.cyclingSpeedCadence] },
  coreTemp: { services: [SERVICE.coreTemp] },
  smo2: { services: [SERVICE.moxy] },
  fan: { services: [SERVICE.wahooHeadwind, SERVICE.wahooHeadwindAlt], namePrefixes: ['HEADWIND'] },
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000]

interface Slot {
  device: ManagedDevice
  peripheral: BlePeripheral
  drivers: Driver[]
  offDisconnect: () => void
  retryTimer: (() => void) | null
  wanted: boolean
  batteryTimer: (() => void) | null
}

export interface DeviceManagerOptions {
  transport: BleTransport
  hub: SensorHub
  clock: Clock
  driverFactory: DriverFactory
  onCapture?: (entry: CaptureEntry) => void
}

export class DeviceManager {
  private readonly slots = new Map<DeviceRole, Slot>()
  private readonly listeners = new Set<(devices: ManagedDevice[]) => void>()
  private readonly eventListeners = new Set<(e: DeviceEvent) => void>()

  constructor(private readonly opts: DeviceManagerOptions) {}

  get transportKind(): BleTransport['kind'] {
    return this.opts.transport.kind
  }

  list(): ManagedDevice[] {
    return [...this.slots.values()].map((s) => ({ ...s.device }))
  }

  get(role: DeviceRole): ManagedDevice | undefined {
    const d = this.slots.get(role)?.device
    return d ? { ...d } : undefined
  }

  /** The connected trainer's control driver, if any. */
  trainer(): TrainerDriver | null {
    const slot = this.slots.get('trainer')
    if (!slot || slot.device.state !== 'connected') return null
    return slot.drivers.find(isTrainerDriver) ?? null
  }

  drivers(role: DeviceRole): Driver[] {
    return this.slots.get(role)?.drivers ?? []
  }

  subscribe(listener: (devices: ManagedDevice[]) => void): () => void {
    this.listeners.add(listener)
    listener(this.list())
    return () => this.listeners.delete(listener)
  }

  onEvent(listener: (e: DeviceEvent) => void): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  /**
   * Opens the chooser for `role` (auto-picking `preferredChooserId` when the
   * platform sees it), connects and attaches drivers. Replaces any device
   * already in that role.
   */
  async connect(role: DeviceRole, opts: { preferredChooserId?: string } = {}): Promise<ManagedDevice> {
    const filters = ROLE_FILTERS[role]
    const peripheral = await this.opts.transport.acquire({
      role,
      filterServices: filters.services,
      namePrefixes: filters.namePrefixes,
      optionalServices: ALL_OPTIONAL_SERVICES,
      preferredChooserId: opts.preferredChooserId,
    })

    this.disconnect(role)
    const slot: Slot = {
      device: {
        role,
        name: peripheral.name || 'Unknown device',
        peripheralId: peripheral.id,
        chooserId: peripheral.chooserId,
        state: 'connecting',
        drivers: [],
        info: {},
        reconnects: 0,
      },
      peripheral,
      drivers: [],
      offDisconnect: () => undefined,
      retryTimer: null,
      wanted: true,
      batteryTimer: null,
    }
    this.slots.set(role, slot)
    this.changed()

    slot.offDisconnect = peripheral.onDisconnect(() => this.handleDrop(role, slot))
    try {
      await this.establish(slot)
    } catch (e) {
      slot.device.state = 'failed'
      slot.device.lastError = errorMessage(e)
      this.changed()
      throw e
    }
    this.emit({ type: 'connected', role, device: { ...slot.device } })
    return { ...slot.device }
  }

  /** Deliberately disconnect (no auto-reconnect). */
  disconnect(role: DeviceRole): void {
    const slot = this.slots.get(role)
    if (!slot) return
    slot.wanted = false
    slot.retryTimer?.()
    slot.batteryTimer?.()
    slot.offDisconnect()
    for (const d of slot.drivers) d.detach()
    for (const d of slot.drivers) this.opts.hub.removeSource(sourceIdFor(role, d.kind))
    try {
      slot.peripheral.disconnect()
    } catch {
      // already gone
    }
    this.slots.delete(role)
    this.changed()
  }

  disconnectAll(): void {
    for (const role of [...this.slots.keys()]) this.disconnect(role)
  }

  // ---- internals ----------------------------------------------------------

  private async establish(slot: Slot): Promise<void> {
    const raw = await slot.peripheral.connect()
    const session = queuedSession(raw)
    const drivers = await this.opts.driverFactory(session, slot.device.role)
    if (drivers.length === 0) {
      throw new BleError(`No supported protocol found on ${slot.device.name} for ${slot.device.role}`, 'not-found')
    }
    for (const old of slot.drivers) old.detach()
    slot.drivers = drivers
    for (const d of drivers) await d.attach(session, this.contextFor(slot, d))
    slot.device.drivers = drivers.map((d) => d.kind)
    slot.device.state = 'connected'
    slot.device.connectedAt = this.opts.clock.now()
    slot.device.lastError = undefined
    this.changed()
    void this.readInfo(slot, session)
    this.startBattery(slot, session)
  }

  private handleDrop(role: DeviceRole, slot: Slot): void {
    if (this.slots.get(role) !== slot || !slot.wanted) return
    for (const d of slot.drivers) d.detach()
    slot.batteryTimer?.()
    slot.device.state = 'reconnecting'
    this.changed()
    this.emit({ type: 'disconnected', role, willRetry: true })
    this.scheduleRetry(role, slot, 0)
  }

  private scheduleRetry(role: DeviceRole, slot: Slot, attempt: number): void {
    const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!
    slot.retryTimer = this.opts.clock.after(delay, () => {
      slot.retryTimer = null
      if (this.slots.get(role) !== slot || !slot.wanted) return
      this.establish(slot)
        .then(() => {
          slot.device.reconnects++
          this.changed()
          this.emit({ type: 'reconnected', role, device: { ...slot.device } })
        })
        .catch((e: unknown) => {
          slot.device.lastError = errorMessage(e)
          slot.device.state = 'reconnecting'
          this.changed()
          this.scheduleRetry(role, slot, attempt + 1)
        })
    })
  }

  private contextFor(slot: Slot, driver: Driver): DriverContext {
    const sourceId = sourceIdFor(slot.device.role, driver.kind)
    const { hub, clock, onCapture } = this.opts
    return {
      sourceId,
      now: () => clock.now(),
      emit: (metric, value, tMono) => hub.ingest({ metric, value, tMono: tMono ?? clock.now(), sourceId }),
      emitRr: (rrMs, tMono) => hub.ingestRr({ rrMs, tMono: tMono ?? clock.now(), sourceId }),
      capture: (entry) => onCapture?.({ ...entry, tMono: clock.now(), sourceId }),
      warn: (message) => this.emit({ type: 'warning', role: slot.device.role, message }),
    }
  }

  private async readInfo(slot: Slot, session: GattSession): Promise<void> {
    try {
      const services = await session.services()
      if (!services.includes(SERVICE.deviceInformation)) return
      const chars = await session.characteristics(SERVICE.deviceInformation)
      const read = async (c: string) => (chars.includes(c) ? decode(await session.read(SERVICE.deviceInformation, c)) : undefined)
      slot.device.info = {
        manufacturer: await read(CHAR.manufacturerName),
        model: await read(CHAR.modelNumber),
        hardware: await read(CHAR.hardwareRevision),
        firmware: await read(CHAR.firmwareRevision),
        software: await read(CHAR.softwareRevision),
      }
      this.changed()
    } catch {
      // Device Information is best-effort
    }
  }

  private startBattery(slot: Slot, session: GattSession): void {
    const poll = async () => {
      try {
        const services = await session.services()
        if (!services.includes(SERVICE.battery)) return false
        const dv = await session.read(SERVICE.battery, CHAR.batteryLevel)
        if (dv.byteLength >= 1) {
          slot.device.battery = dv.getUint8(0)
          this.changed()
        }
        return true
      } catch {
        return false
      }
    }
    void poll().then((has) => {
      if (has) slot.batteryTimer = this.opts.clock.every(5 * 60_000, () => void poll())
    })
  }

  private changed(): void {
    const list = this.list()
    for (const l of this.listeners) l(list)
  }

  private emit(e: DeviceEvent): void {
    for (const l of this.eventListeners) l(e)
  }
}

function decode(dv: DataView): string {
  return new TextDecoder('utf-8').decode(dv).replace(/\0+$/, '').trim()
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

