import type { WebContents } from 'electron'
import type { EventMap } from '@shared/ipc/contract'

type Callback = (deviceId: string) => void
type ScanDevice = { deviceId: string; deviceName: string }

interface PendingRequest {
  requestId: string
  role: string
  preferredChooserId?: string
  callback: Callback | null
  resolved: boolean
  devices: Map<string, string>
  timer: NodeJS.Timeout
}

export type ChooserState = EventMap['ble.chooser']

/**
 * Bridges Electron's `select-bluetooth-device` event (which fires repeatedly
 * while Chromium scans) to our own picker UI in the renderer.
 *
 * Protocol per requestDevice() call:
 *   1. renderer invokes `ble.prepare` { requestId, role, preferredChooserId }
 *   2. renderer calls navigator.bluetooth.requestDevice()
 *   3. every scan update lands here; if the preferred (remembered) device is
 *      seen we pick it immediately, otherwise the list is pushed to the
 *      renderer as `ble.chooser` events
 *   4. the renderer answers with `ble.choose` { requestId, deviceId | null }
 * Electron requires the callback to be called exactly once; '' cancels.
 */
export class BluetoothChooser {
  private pending: PendingRequest | null = null

  constructor(
    private readonly push: (state: ChooserState) => void,
    private readonly chosen: (info: EventMap['ble.chosen']) => void,
    private readonly timeoutMs = 60_000,
  ) {}

  attach(wc: WebContents): void {
    wc.on('select-bluetooth-device', (event, deviceList, callback) => {
      event.preventDefault()
      this.onScan(deviceList, callback)
    })
  }

  prepare(req: { requestId: string; role: string; preferredChooserId?: string }): void {
    this.cancelPending()
    this.pending = {
      ...req,
      callback: null,
      resolved: false,
      devices: new Map(),
      timer: setTimeout(() => this.resolve(''), this.timeoutMs),
    }
  }

  onScan(devices: ScanDevice[], callback: Callback): void {
    let p = this.pending
    if (!p || p.resolved) {
      // A request we weren't told about (or a stale one): start an ad-hoc chooser.
      this.prepare({ requestId: `adhoc-${Date.now()}`, role: 'unknown' })
      p = this.pending!
    }
    p.callback = callback
    for (const d of devices) p.devices.set(d.deviceId, d.deviceName || 'Unnamed device')

    if (p.preferredChooserId && p.devices.has(p.preferredChooserId)) {
      this.resolve(p.preferredChooserId)
      return
    }
    this.push(this.stateOf(p))
  }

  choose(requestId: string, deviceId: string | null): boolean {
    const p = this.pending
    if (!p || p.requestId !== requestId || p.resolved) return false
    if (deviceId !== null && !p.devices.has(deviceId)) return false
    this.resolve(deviceId ?? '')
    return true
  }

  private resolve(deviceId: string): void {
    const p = this.pending
    if (!p || p.resolved) return
    p.resolved = true
    clearTimeout(p.timer)
    const name = p.devices.get(deviceId) ?? ''
    if (p.callback) p.callback(deviceId)
    this.push({ ...this.stateOf(p), open: false })
    if (deviceId) this.chosen({ requestId: p.requestId, chooserId: deviceId, name })
    this.pending = null
  }

  private cancelPending(): void {
    if (this.pending && !this.pending.resolved) this.resolve('')
  }

  private stateOf(p: PendingRequest): ChooserState {
    return {
      requestId: p.requestId,
      role: p.role,
      open: true,
      devices: [...p.devices.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }
  }
}
