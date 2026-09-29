import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { configureUserData, env } from './env'
import { handleAppScheme, registerAppScheme } from './app-protocol'
import { createMainWindow } from './windows/main-window'
import { registerAppHandlers } from './ipc/app-handlers'
import { runSelfTestIfRequested } from './selftest'

// ---- pre-ready setup -------------------------------------------------------
app.setName('FreeGaz')
configureUserData()
registerAppScheme()

// Rides must keep ticking while the window is hidden, occluded or behind
// fullscreen Netflix. backgroundThrottling:false covers timers in the page;
// these switches cover the renderer process and occlusion detection.
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

if (!env.isTest && !app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

// ---- ready -------------------------------------------------------------------
void app.whenReady().then(() => {
  handleAppScheme(join(__dirname, '../renderer'))
  registerAppHandlers()
  mainWindow = createMainWindow()
  runSelfTestIfRequested(mainWindow)
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
  })
})

app.on('window-all-closed', () => {
  // A desktop trainer app quits when its window closes, even on macOS.
  app.quit()
})
