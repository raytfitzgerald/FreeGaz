// The only module that touches navigator.bluetooth. Implements the core
// BleTransport contract on top of Web Bluetooth (Chromium, in Electron or
// Chrome). In Electron, main's BluetoothChooser drives the device list; in
// plain Chrome the browser shows its own chooser.
import {
  BleError,
  type AcquireRequest,
  type BlePeripheral,
  type BleTransport,
  type GattSession,
  type Uuid,
} from '@core/ble/transport'
import { normalizeUuid } from '@core/ble/uuids'
import type { FreegazBridge } from '@shared/ipc/contract'

const newRequestId = () => crypto.randomUUID()

export class WebBluetoothTransport implements BleTransport {
  readonly kind = 'web-bluetooth' as const

  constructor(private readonly bridge: FreegazBridge) {}

  async isAvailable(): Promise<boolean> {
    if (!('bluetooth' in navigator)) return false
    try {
      return await navigator.bluetooth.getAvailability()
    } catch {
      return false
    }
  }

  async acquire(req: AcquireRequest): Promise<BlePeripheral> {
    if (!('bluetooth' in navigator)) throw new BleError('Web Bluetooth is not available', 'unavailable')
    const requestId = newRequestId()

    // Learn which platform chooser id was picked (Electron only), so it can be
    // remembered for auto-pick next launch.
    let chooserId: string | null = null
    const off = this.bridge.on('ble.chosen', (info) => {
      if (info.requestId === requestId) chooserId = info.chooserId
    })

    await this.bridge.invoke('ble.prepare', {
      requestId,
      role: req.role,
      preferredChooserId: req.preferredChooserId,
    })

    const filters: BluetoothLEScanFilter[] = [
      ...req.filterServices.map((s) => ({ services: [s] })),
      ...(req.namePrefixes ?? []).map((namePrefix) => ({ namePrefix })),
    ]

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters,
        optionalServices: req.optionalServices,
      })
      // The ble.chosen event is pushed right after main resolves the chooser; give it a tick.
      await new Promise((r) => setTimeout(r, 50))
      return new WebBluetoothPeripheral(device, chooserId ?? device.id)
    } catch (e) {
      throw mapError(e)
    } finally {
      off()
    }
  }
}

class WebBluetoothPeripheral implements BlePeripheral {
  readonly id: string
  readonly name: string
  private readonly dropListeners = new Set<() => void>()
  private deliberate = false

  constructor(
    private readonly device: BluetoothDevice,
    readonly chooserId: string,
  ) {
    this.id = device.id
    this.name = device.name ?? 'Unnamed device'
    device.addEventListener('gattserverdisconnected', () => {
      if (this.deliberate) {
        this.deliberate = false
        return
      }
      for (const l of this.dropListeners) l()
    })
  }

  get connected(): boolean {
    return this.device.gatt?.connected ?? false
  }

  async connect(): Promise<GattSession> {
    const gatt = this.device.gatt
    if (!gatt) throw new BleError(`${this.name} has no GATT server`, 'gatt')
    try {
      const server = gatt.connected ? gatt : await gatt.connect()
      return new WebGattSession(server)
    } catch (e) {
      throw mapError(e)
    }
  }

  onDisconnect(listener: () => void): () => void {
    this.dropListeners.add(listener)
    return () => this.dropListeners.delete(listener)
  }

  disconnect(): void {
    if (this.device.gatt?.connected) {
      this.deliberate = true
      this.device.gatt.disconnect()
    }
  }
}

class WebGattSession implements GattSession {
  private readonly serviceCache = new Map<Uuid, Promise<BluetoothRemoteGATTService>>()
  private readonly charCache = new Map<string, Promise<BluetoothRemoteGATTCharacteristic>>()

  constructor(private readonly server: BluetoothRemoteGATTServer) {}

  async services(): Promise<Uuid[]> {
    try {
      const list = await this.server.getPrimaryServices()
      return list.map((s) => normalizeUuid(s.uuid))
    } catch (e) {
      throw mapError(e)
    }
  }

  async characteristics(service: Uuid): Promise<Uuid[]> {
    try {
      const svc = await this.service(service)
      const chars = await svc.getCharacteristics()
      return chars.map((c) => normalizeUuid(c.uuid))
    } catch (e) {
      throw mapError(e)
    }
  }

  async read(service: Uuid, characteristic: Uuid): Promise<DataView> {
    try {
      return await (await this.char(service, characteristic)).readValue()
    } catch (e) {
      throw mapError(e)
    }
  }

  async write(service: Uuid, characteristic: Uuid, data: Uint8Array, opts?: { withResponse?: boolean }): Promise<void> {
    try {
      const c = await this.char(service, characteristic)
      const buf = data.slice().buffer
      if (opts?.withResponse === false) await c.writeValueWithoutResponse(buf)
      else await c.writeValueWithResponse(buf)
    } catch (e) {
      throw mapError(e)
    }
  }

  async subscribe(service: Uuid, characteristic: Uuid, listener: (value: DataView) => void): Promise<() => Promise<void>> {
    try {
      const c = await this.char(service, characteristic)
      const handler = (event: Event) => {
        const value = (event.target as BluetoothRemoteGATTCharacteristic).value
        if (value) listener(value)
      }
      c.addEventListener('characteristicvaluechanged', handler)
      await c.startNotifications()
      return async () => {
        c.removeEventListener('characteristicvaluechanged', handler)
        try {
          if (this.server.connected) await c.stopNotifications()
        } catch {
          // link already gone
        }
      }
    } catch (e) {
      throw mapError(e)
    }
  }

  private service(uuid: Uuid): Promise<BluetoothRemoteGATTService> {
    let p = this.serviceCache.get(uuid)
    if (!p) {
      p = this.server.getPrimaryService(uuid)
      p.catch(() => this.serviceCache.delete(uuid))
      this.serviceCache.set(uuid, p)
    }
    return p
  }

  private char(service: Uuid, characteristic: Uuid): Promise<BluetoothRemoteGATTCharacteristic> {
    const key = `${service}|${characteristic}`
    let p = this.charCache.get(key)
    if (!p) {
      p = this.service(service).then((s) => s.getCharacteristic(characteristic))
      p.catch(() => this.charCache.delete(key))
      this.charCache.set(key, p)
    }
    return p
  }
}

function mapError(e: unknown): BleError {
  if (e instanceof BleError) return e
  const err = e as { name?: string; message?: string }
  const msg = err?.message ?? String(e)
  switch (err?.name) {
    case 'NotFoundError':
      return new BleError(msg.includes('cancel') ? 'Device selection cancelled' : msg, 'cancelled', e)
    case 'SecurityError':
      return new BleError(msg, 'security', e)
    case 'NetworkError':
      return new BleError(msg, 'disconnected', e)
    case 'NotSupportedError':
    case 'InvalidStateError':
      return new BleError(msg, 'gatt', e)
    default:
      return new BleError(msg, 'gatt', e)
  }
}
