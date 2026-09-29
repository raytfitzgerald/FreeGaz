import { ipcMain, type BrowserWindow } from 'electron'
import QRCode from 'qrcode'
import type { LiveBroadcast, RideCommand } from '@shared/live'
import { RemoteServer } from '../remote/server'
import { createMiniHudWindow } from '../windows/minihud-window'
import { emit, handle, isTrustedSender } from './register'

/**
 * The live bus: the main window publishes LiveBroadcasts (4 Hz); main relays
 * them to the mini-HUD and the phone remote. Commands from those surfaces are
 * relayed back to the main window's dispatcher.
 */
export function registerHudHandlers(getMainWindow: () => BrowserWindow | null): { miniHud: () => BrowserWindow | null } {
  let miniHud: BrowserWindow | null = null
  let qr: string | null = null

  const toMain = (cmd: RideCommand) => {
    const w = getMainWindow()
    if (w) emit(w.webContents, 'ride.command', cmd)
  }
  const remote = new RemoteServer(toMain)

  ipcMain.on('live.publish', (event, payload: LiveBroadcast) => {
    if (!isTrustedSender(event.senderFrame?.url)) return
    const main = getMainWindow()
    if (!main || event.sender.id !== main.webContents.id) return // only the main window publishes
    if (miniHud && !miniHud.isDestroyed()) emit(miniHud.webContents, 'live.broadcast', payload)
    remote.publish(payload)
  })

  handle('minihud.toggle', ({ open }) => {
    if (open && (!miniHud || miniHud.isDestroyed())) {
      miniHud = createMiniHudWindow()
      miniHud.on('closed', () => {
        miniHud = null
      })
    } else if (!open && miniHud && !miniHud.isDestroyed()) {
      miniHud.close()
      miniHud = null
    }
    return { open: !!miniHud }
  })
  handle('minihud.setClickThrough', ({ on }) => {
    miniHud?.setIgnoreMouseEvents(on, { forward: true })
    return { ok: true }
  })
  handle('ride.command', (cmd) => {
    toMain(cmd)
    return { ok: true }
  })

  const statusWithQr = async () => {
    const s = remote.status()
    if (s.url && !qr) qr = await QRCode.toDataURL(s.url, { margin: 1, width: 320 })
    if (!s.url) qr = null
    return { ...s, qrDataUrl: qr }
  }
  handle('remote.start', async ({ allowControl }) => {
    qr = null
    await remote.start({ allowControl })
    return statusWithQr()
  })
  handle('remote.stop', async () => {
    await remote.stop()
    qr = null
    return statusWithQr()
  })
  handle('remote.status', () => statusWithQr())
  handle('remote.kick', ({ clientId }) => {
    remote.kick(clientId)
    return { ok: true }
  })

  return { miniHud: () => miniHud }
}
