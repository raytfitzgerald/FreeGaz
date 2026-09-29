import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { APP_ORIGIN, isAllowedNavigation } from './navigation'
import { env } from '../env'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    title: 'FreeGaz',
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#0a0c10',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      // A ride keeps running while you watch something else: never throttle.
      backgroundThrottling: false,
      spellcheck: false,
    },
  })

  win.once('ready-to-show', () => {
    if (!env.isTest || process.env.FREEGAZ_SHOW === '1') win.show()
  })

  // No in-app navigation away from the app; external links open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) event.preventDefault()
  })

  if (env.devServerUrl) {
    void win.loadURL(env.devServerUrl)
  } else {
    void win.loadURL(`${APP_ORIGIN}/index.html`)
  }
  return win
}
