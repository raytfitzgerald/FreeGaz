import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { APP_ORIGIN } from '../app-protocol'
import { env } from '../env'

/**
 * The floating mini-HUD: a small, translucent, always-on-top panel that stays
 * visible over fullscreen Netflix/YouTube/Apple TV and on every Space.
 */
export function createMiniHudWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()
  const width = 360
  const height = 190
  const win = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + 24,
    minWidth: 260,
    minHeight: 140,
    frame: false,
    transparent: true,
    hasShadow: true,
    resizable: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    type: 'panel',
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  // Float above fullscreen apps and follow the user across Spaces.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.once('ready-to-show', () => {
    if (!env.isTest || process.env.FREEGAZ_SHOW === '1') win.showInactive()
  })
  if (env.devServerUrl) void win.loadURL(`${env.devServerUrl.replace(/\/$/, '')}/minihud.html`)
  else void win.loadURL(`${APP_ORIGIN}/minihud.html`)
  return win
}
