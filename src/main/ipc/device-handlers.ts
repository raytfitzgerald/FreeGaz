import { BrowserWindow } from 'electron'
import type { SettingsStore } from '../store/settings-store'
import type { BluetoothChooser } from '../ble/chooser'
import { emit, handle } from './register'

/** Settings + Bluetooth chooser IPC. */
export function registerDeviceHandlers(deps: { settings: SettingsStore; chooser: BluetoothChooser }): void {
  const { settings, chooser } = deps

  handle('settings.get', () => settings.get())
  handle('settings.patch', (patch) => settings.patch(patch))
  settings.onChange((s) => {
    for (const w of BrowserWindow.getAllWindows()) emit(w.webContents, 'settings.changed', s)
  })

  handle('ble.prepare', (req) => {
    chooser.prepare(req)
    return { ok: true }
  })
  handle('ble.choose', ({ requestId, deviceId }) => ({ ok: chooser.choose(requestId, deviceId) }))

  // requestDevice() needs transient user activation. At launch there is no
  // click, so main runs the renderer's fixed auto-connect hook with
  // userGesture=true. The code string is constant; only our own window may ask.
  handle('ble.requestAutoConnect', async (_req, event) => {
    await event.sender.executeJavaScript('window.__freegazAutoConnect && window.__freegazAutoConnect()', true)
    return { ok: true }
  })
}
