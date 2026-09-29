import { app, BrowserWindow, safeStorage } from 'electron'
import { join } from 'node:path'
import { configureUserData, env } from './env'
import { handleAppScheme, registerAppScheme } from './app-protocol'
import { createMainWindow } from './windows/main-window'
import { registerAppHandlers } from './ipc/app-handlers'
import { registerDeviceHandlers } from './ipc/device-handlers'
import { defaultExportDir, registerRideHandlers } from './ipc/ride-handlers'
import { registerIntegrationHandlers } from './ipc/integration-handlers'
import { registerAiHandlers } from './ipc/ai-handlers'
import { registerHudHandlers } from './ipc/hud-handlers'
import { SecretStore, type Cipher } from './secrets/secret-store'
import { JournalStore } from './ride/journal-store'
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
  const journal = new JournalStore(app.getPath('userData'))
  registerRideHandlers({ journal, settings })
  // Keychain-backed encryption; E2E runs use a plain cipher so tests never touch the Keychain.
  const cipher: Cipher = env.isTest
    ? { isAvailable: () => true, encrypt: (s) => Buffer.from(s, 'utf8'), decrypt: (b) => b.toString('utf8') }
    : { isAvailable: () => safeStorage.isEncryptionAvailable(), encrypt: (s) => safeStorage.encryptString(s), decrypt: (b) => safeStorage.decryptString(b) }
  const secrets = SecretStore.inDir(app.getPath('userData'), cipher)
  registerIntegrationHandlers({ secrets, userData: app.getPath('userData'), exportDir: () => settings.get().exportDir ?? defaultExportDir() })
  registerAiHandlers({ secrets })
  registerHudHandlers(() => mainWindow)
  mainWindow = createMainWindow()
  chooser.attach(mainWindow.webContents)
  // A renderer that crashed or reloaded left its ride's journal open; close it
  // so the new page offers the ride for recovery.
  mainWindow.webContents.on('render-process-gone', () => journal.closeAll())
  mainWindow.webContents.on('did-navigate', () => journal.closeAll())
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
