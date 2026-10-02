// Transport abstraction over Bluetooth LE. Implementations:
//   * WebBluetoothTransport (renderer, Chrome/Electron)  src/renderer/src/ble/web-bluetooth.ts
//   * NativeBleTransport (the iPhone app, CoreBluetooth)  src/renderer/src/ble/native-bluetooth.ts
//   * SimTransport (virtual peripherals, tests/demo)     src/core/sim/transport.ts
//   * NobleTransport (future fallback, utilityProcess)
// Drivers only ever see these interfaces.
import type { DeviceRole } from '../devices/types'

export type Uuid = string

export interface AcquireRequest {
  role: DeviceRole
  /** Services used as chooser filters (device must advertise at least one). */
  filterServices: Uuid[]
  /** Name-prefix filters, e.g. ["KICKR"]. */
  namePrefixes?: string[]
  /** Every service the drivers may touch. */
  optionalServices: Uuid[]
  /** If the platform chooser sees this id, pick it without asking. */
  preferredChooserId?: string
}

export interface BleTransport {
  readonly kind: 'web-bluetooth' | 'native' | 'sim' | 'noble'
  isAvailable(): Promise<boolean>
  /** Opens the chooser (or auto-picks) and resolves with the chosen peripheral. Rejects on cancel. */
  acquire(req: AcquireRequest): Promise<BlePeripheral>
}

export interface BlePeripheral {
  /** Transport-level id (stable for the life of the object). */
  readonly id: string
  /** Platform chooser id to remember for auto-pick next launch (may equal id). */
  readonly chooserId: string
  readonly name: string
  connect(signal?: AbortSignal): Promise<GattSession>
  readonly connected: boolean
  /** Fires when the link drops (not when disconnect() is called deliberately). */
  onDisconnect(listener: () => void): () => void
  disconnect(): void
}

export interface GattSession {
  services(): Promise<Uuid[]>
  characteristics(service: Uuid): Promise<Uuid[]>
  read(service: Uuid, characteristic: Uuid): Promise<DataView>
  /** withResponse defaults to true (writeValueWithResponse). */
  write(service: Uuid, characteristic: Uuid, data: Uint8Array, opts?: { withResponse?: boolean }): Promise<void>
  /** Starts notifications/indications. Resolves with an unsubscribe function. */
  subscribe(service: Uuid, characteristic: Uuid, listener: (value: DataView) => void): Promise<() => Promise<void>>
}

export class BleError extends Error {
  constructor(
    message: string,
    readonly code: 'cancelled' | 'unavailable' | 'not-found' | 'timeout' | 'disconnected' | 'gatt' | 'security',
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'BleError'
  }
}

/**
 * Serializes GATT operations for one device. Chromium rejects overlapping
 * operations ("GATT operation already in progress"), and FTMS control points
 * require one outstanding procedure at a time, so every read/write/subscribe
 * goes through this queue with a timeout.
 */
export class GattQueue {
  private tail: Promise<unknown> = Promise.resolve()
  private pending = 0

  constructor(private readonly defaultTimeoutMs = 4000) {}

  get depth(): number {
    return this.pending
  }

  run<T>(label: string, op: () => Promise<T>, timeoutMs = this.defaultTimeoutMs): Promise<T> {
    this.pending++
    const result = this.tail.then(() => withTimeout(label, op(), timeoutMs))
    this.tail = result.catch(() => undefined).finally(() => {
      this.pending--
    })
    return result
  }
}

function withTimeout<T>(label: string, p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new BleError(`${label} timed out after ${ms} ms`, 'timeout')), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

/** Wraps a raw session so every operation is serialized through a GattQueue. */
export function queuedSession(raw: GattSession, queue = new GattQueue()): GattSession {
  return {
    services: () => queue.run('services', () => raw.services()),
    characteristics: (s) => queue.run(`characteristics ${s}`, () => raw.characteristics(s)),
    read: (s, c) => queue.run(`read ${c}`, () => raw.read(s, c)),
    write: (s, c, d, o) => queue.run(`write ${c}`, () => raw.write(s, c, d, o)),
    subscribe: (s, c, l) =>
      queue.run(`subscribe ${c}`, async () => {
        const unsub = await raw.subscribe(s, c, l)
        return () => queue.run(`unsubscribe ${c}`, unsub)
      }),
  }
}

export const toHex = (dv: DataView | Uint8Array): string => {
  const bytes = dv instanceof Uint8Array ? dv : new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ')
}

export const fromHex = (hex: string): Uint8Array => {
  const clean = hex.replace(/[^0-9a-f]/gi, '')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

export const dataView = (bytes: Uint8Array | number[]): DataView => {
  const u8 = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes)
  return new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
}
