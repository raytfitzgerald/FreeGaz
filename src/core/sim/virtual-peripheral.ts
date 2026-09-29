// Virtual GATT peripherals. They speak real bytes (via the same codecs the
// drivers use, in the other direction), so the simulator exercises the full
// driver stack: parsing, control-point indications, reconnects, everything.
import { BleError, type BlePeripheral, type GattSession, type Uuid } from '../ble/transport'
import { CHAR, SERVICE } from '../ble/uuids'
import type { DeviceRole } from '../devices/types'

type Listener = (value: DataView) => void

const key = (s: Uuid, c: Uuid) => `${s}|${c}`
const dv = (bytes: Uint8Array) => new DataView(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))

export interface GattTable {
  [service: Uuid]: Uuid[]
}

export interface SimFaults {
  /** Probability [0,1] of silently dropping each notification. */
  dropRate: number
  /** Probability [0,1] of delivering a notification twice. */
  duplicateRate: number
}

export abstract class VirtualPeripheral {
  abstract readonly role: DeviceRole
  abstract readonly name: string
  abstract readonly table: GattTable
  readonly id: string
  connected = false
  faults: SimFaults = { dropRate: 0, duplicateRate: 0 }
  /** Written commands, for tests: [{ t, char, hex }] */
  readonly writes: { t: number; characteristic: Uuid; bytes: Uint8Array }[] = []
  private readonly subscribers = new Map<string, Set<Listener>>()
  private readonly dropListeners = new Set<() => void>()
  /** While > now, connect() fails (simulates an out-of-range device). */
  unavailableUntil = 0

  constructor(
    id: string,
    protected readonly now: () => number,
    protected readonly rng: () => number,
  ) {
    this.id = id
  }

  /** Device Information values. */
  protected info(): Partial<Record<Uuid, string>> {
    return {
      [CHAR.manufacturerName]: 'FreeGaz Simulator',
      [CHAR.modelNumber]: `SIM-${this.role.toUpperCase()}`,
      [CHAR.firmwareRevision]: '1.0.0',
    }
  }

  protected abstract readChar(service: Uuid, characteristic: Uuid): Uint8Array | null
  protected abstract onWrite(service: Uuid, characteristic: Uuid, bytes: Uint8Array): void
  /** Called when a client connects/disconnects (e.g. reset control state). */
  protected onConnectionChange(_connected: boolean): void {}

  /** Push a notification/indication to subscribers. */
  protected notify(service: Uuid, characteristic: Uuid, bytes: Uint8Array): void {
    if (!this.connected) return
    const subs = this.subscribers.get(key(service, characteristic))
    if (!subs || subs.size === 0) return
    if (this.rng() < this.faults.dropRate) return
    const deliver = () => {
      for (const l of subs) l(dv(bytes))
    }
    deliver()
    if (this.rng() < this.faults.duplicateRate) deliver()
  }

  protected isSubscribed(service: Uuid, characteristic: Uuid): boolean {
    return (this.subscribers.get(key(service, characteristic))?.size ?? 0) > 0
  }

  // ---- used by SimPeripheral / SimGattSession ----

  connect(): void {
    if (this.now() < this.unavailableUntil) throw new BleError(`${this.name} is out of range`, 'disconnected')
    this.connected = true
    this.onConnectionChange(true)
  }

  disconnect(): void {
    this.connected = false
    this.subscribers.clear()
    this.onConnectionChange(false)
  }

  /** Simulate a link drop. The device can't be reconnected for `forMs`. */
  drop(forMs = 0): void {
    if (!this.connected) return
    this.unavailableUntil = this.now() + forMs
    this.disconnect()
    for (const l of this.dropListeners) l()
  }

  onDrop(listener: () => void): () => void {
    this.dropListeners.add(listener)
    return () => this.dropListeners.delete(listener)
  }

  gattRead(service: Uuid, characteristic: Uuid): DataView {
    this.assertChar(service, characteristic)
    if (service === SERVICE.deviceInformation) {
      const s = this.info()[characteristic]
      if (s !== undefined) return dv(new TextEncoder().encode(s))
    }
    const bytes = this.readChar(service, characteristic)
    if (!bytes) throw new BleError(`${characteristic} is not readable`, 'gatt')
    return dv(bytes)
  }

  gattWrite(service: Uuid, characteristic: Uuid, bytes: Uint8Array): void {
    this.assertChar(service, characteristic)
    this.writes.push({ t: this.now(), characteristic, bytes: bytes.slice() })
    this.onWrite(service, characteristic, bytes)
  }

  gattSubscribe(service: Uuid, characteristic: Uuid, listener: Listener): () => void {
    this.assertChar(service, characteristic)
    const k = key(service, characteristic)
    let set = this.subscribers.get(k)
    if (!set) {
      set = new Set()
      this.subscribers.set(k, set)
    }
    set.add(listener)
    return () => set.delete(listener)
  }

  private assertChar(service: Uuid, characteristic: Uuid): void {
    if (!this.connected) throw new BleError('GATT server disconnected', 'disconnected')
    if (!this.table[service]?.includes(characteristic)) throw new BleError(`No characteristic ${characteristic}`, 'not-found')
  }
}

/** BlePeripheral facade over a VirtualPeripheral. */
export class SimPeripheral implements BlePeripheral {
  readonly id: string
  readonly chooserId: string
  readonly name: string

  constructor(private readonly device: VirtualPeripheral) {
    this.id = device.id
    this.chooserId = device.id
    this.name = device.name
  }

  get connected(): boolean {
    return this.device.connected
  }

  async connect(): Promise<GattSession> {
    this.device.connect()
    const d = this.device
    // Async boundaries mimic a real GATT round-trip.
    return {
      services: async () => Object.keys(d.table),
      characteristics: async (s) => d.table[s] ?? [],
      read: async (s, c) => d.gattRead(s, c),
      write: async (s, c, bytes) => d.gattWrite(s, c, bytes),
      subscribe: async (s, c, l) => {
        const off = d.gattSubscribe(s, c, l)
        return async () => off()
      },
    }
  }

  onDisconnect(listener: () => void): () => void {
    return this.device.onDrop(listener)
  }

  disconnect(): void {
    this.device.disconnect()
  }
}
