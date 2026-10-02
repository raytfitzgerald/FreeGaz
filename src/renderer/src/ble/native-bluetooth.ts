// The iPhone app's Bluetooth: the core BleTransport contract on top of
// CoreBluetooth, through the Capacitor Bluetooth LE plugin. iOS browsers have
// no Web Bluetooth, so this is what lets the App Store build drive a trainer.
// The plugin shows its own device list for requestDevice; a remembered device
// is reconnected by id without asking.
import { BleClient, type BleDevice } from '@capacitor-community/bluetooth-le'
import { BleError, type AcquireRequest, type BlePeripheral, type BleTransport, type GattSession, type Uuid } from '@core/ble/transport'
import { normalizeUuid } from '@core/ble/uuids'

let initialized: Promise<void> | null = null
const init = () => (initialized ??= BleClient.initialize({ androidNeverForLocation: true }).catch((e: unknown) => {
  initialized = null
  throw e
}))

export class NativeBleTransport implements BleTransport {
  readonly kind = 'native' as const

  async isAvailable(): Promise<boolean> {
    try {
      await init()
      return await BleClient.isEnabled()
    } catch {
      return false
    }
  }

  async acquire(req: AcquireRequest): Promise<BlePeripheral> {
    try {
      await init()
    } catch (e) {
      throw new BleError('Bluetooth is off or FreeGaz may not use it (Settings → FreeGaz → Bluetooth).', 'unavailable', e)
    }
    if (req.preferredChooserId) {
      // a device this phone has connected before: no list, just reconnect
      const [known] = await BleClient.getDevices([req.preferredChooserId]).catch(() => [] as BleDevice[])
      if (known) return new NativePeripheral(known)
    }
    try {
      // the list shows devices advertising any of these services (CoreBluetooth matches any, not all)
      const device = await BleClient.requestDevice(
        req.filterServices.length > 0
          ? { services: req.filterServices.map(normalizeUuid), optionalServices: req.optionalServices.map(normalizeUuid) }
          : { namePrefix: req.namePrefixes?.[0], optionalServices: req.optionalServices.map(normalizeUuid) },
      )
      return new NativePeripheral(device)
    } catch (e) {
      throw mapError(e)
    }
  }
}

class NativePeripheral implements BlePeripheral {
  readonly id: string
  readonly chooserId: string
  readonly name: string
  private readonly dropListeners = new Set<() => void>()
  private deliberate = false
  private linked = false

  constructor(device: BleDevice) {
    this.id = device.deviceId
    this.chooserId = device.deviceId
    this.name = device.name ?? 'Unnamed device'
  }

  get connected(): boolean {
    return this.linked
  }

  async connect(): Promise<GattSession> {
    try {
      if (!this.linked) {
        await BleClient.connect(this.id, () => {
          this.linked = false
          if (this.deliberate) {
            this.deliberate = false
            return
          }
          for (const l of this.dropListeners) l()
        })
        this.linked = true
      }
      return new NativeGattSession(this.id)
    } catch (e) {
      throw mapError(e)
    }
  }

  onDisconnect(listener: () => void): () => void {
    this.dropListeners.add(listener)
    return () => this.dropListeners.delete(listener)
  }

  disconnect(): void {
    if (!this.linked) return
    this.deliberate = true
    void BleClient.disconnect(this.id).catch(() => undefined)
  }
}

class NativeGattSession implements GattSession {
  private discovered: Promise<{ uuid: string; characteristics: { uuid: string }[] }[]> | null = null

  constructor(private readonly deviceId: string) {}

  private all() {
    this.discovered ??= BleClient.getServices(this.deviceId).catch((e: unknown) => {
      this.discovered = null
      throw e
    })
    return this.discovered
  }

  async services(): Promise<Uuid[]> {
    try {
      return (await this.all()).map((s) => normalizeUuid(s.uuid))
    } catch (e) {
      throw mapError(e)
    }
  }

  async characteristics(service: Uuid): Promise<Uuid[]> {
    try {
      const svc = (await this.all()).find((s) => normalizeUuid(s.uuid) === normalizeUuid(service))
      return (svc?.characteristics ?? []).map((c) => normalizeUuid(c.uuid))
    } catch (e) {
      throw mapError(e)
    }
  }

  async read(service: Uuid, characteristic: Uuid): Promise<DataView> {
    try {
      return await BleClient.read(this.deviceId, normalizeUuid(service), normalizeUuid(characteristic))
    } catch (e) {
      throw mapError(e)
    }
  }

  async write(service: Uuid, characteristic: Uuid, data: Uint8Array, opts?: { withResponse?: boolean }): Promise<void> {
    const view = new DataView(data.slice().buffer)
    try {
      if (opts?.withResponse === false) await BleClient.writeWithoutResponse(this.deviceId, normalizeUuid(service), normalizeUuid(characteristic), view)
      else await BleClient.write(this.deviceId, normalizeUuid(service), normalizeUuid(characteristic), view)
    } catch (e) {
      throw mapError(e)
    }
  }

  async subscribe(service: Uuid, characteristic: Uuid, listener: (value: DataView) => void): Promise<() => Promise<void>> {
    const s = normalizeUuid(service)
    const c = normalizeUuid(characteristic)
    try {
      await BleClient.startNotifications(this.deviceId, s, c, listener)
      return async () => {
        try {
          await BleClient.stopNotifications(this.deviceId, s, c)
        } catch {
          // link already gone
        }
      }
    } catch (e) {
      throw mapError(e)
    }
  }
}

/** The plugin's errors are plain Errors with iOS's wording; map the ones the app reacts to. */
export function mapError(e: unknown): BleError {
  if (e instanceof BleError) return e
  const msg = (e as { message?: string })?.message ?? String(e)
  if (/cancel/i.test(msg)) return new BleError('Device selection cancelled', 'cancelled', e)
  if (/not (enabled|powered)|powered off|unauthori[sz]ed|not allowed/i.test(msg)) return new BleError(msg, 'unavailable', e)
  if (/timeout|timed out/i.test(msg)) return new BleError(msg, 'timeout', e)
  if (/disconnect|not connected/i.test(msg)) return new BleError(msg, 'disconnected', e)
  if (/not found/i.test(msg)) return new BleError(msg, 'not-found', e)
  return new BleError(msg, 'gatt', e)
}
