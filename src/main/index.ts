import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { configureUserData, env } from './env'
import { handleAppScheme, registerAppScheme } from './app-protocol'
import { createMainWindow } from './windows/main-window'
import { registerAppHandlers } from './ipc/app-handlers'
import { registerDeviceHandlers } from './ipc/device-handlers'
import { emit } from './ipc/register'
import { BluetoothChooser } from './ble/chooser'
import { SettingsStore } from './store/settings-store'
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
  const settings = SettingsStore.inDir(app.getPath('userData'))
  const chooser = new BluetoothChooser(
    (state) => mainWindow && emit(mainWindow.webContents, 'ble.chooser', state),
    (info) => mainWindow && emit(mainWindow.webContents, 'ble.chosen', info),
  )
  registerAppHandlers()
  registerDeviceHandlers({ settings, chooser })
  mainWindow = createMainWindow()
  chooser.attach(mainWindow.webContents)
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
