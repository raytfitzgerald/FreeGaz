import { app, BrowserWindow, clipboard, ClipboardItem, dialog, nativeImage, powerMonitor, powerSaveBlocker, shell } from 'electron'
import { join } from 'node:path'
import { parseJournal } from '@core/ride/journal'
import { isAllowedExternal, isInside, isJpeg, sanitizeFileName, writeInto } from '../files/files'
import type { JournalStore } from '../ride/journal-store'
import type { SettingsStore } from '../store/settings-store'
import { env } from '../env'
import { emit, handle } from './register'

export function defaultExportDir(): string {
  return join(app.getPath('documents'), 'FreeGaz', 'Rides')
}

/** Journal, file export and power-management IPC. */
export function registerRideHandlers(deps: { journal: JournalStore; settings: SettingsStore }): void {
  const { journal, settings } = deps
  const exportDir = () => settings.get().exportDir ?? defaultExportDir()

  handle('journal.begin', ({ rideId, meta }) => {
    journal.begin(rideId, meta)
    return { ok: true }
  })
  handle('journal.append', ({ rideId, seq, lines }) => ({ durableSeq: journal.append(rideId, seq, lines) }))
  handle('journal.close', ({ rideId }) => {
    journal.close(rideId)
    return { ok: true }
  })
  handle('journal.remove', ({ rideId }) => {
    journal.remove(rideId)
    return { ok: true }
  })
  handle('journal.pending', () => ({
    journals: journal.pending().map((j) => ({
      rideId: j.rideId,
      name: j.meta?.name ?? null,
      startedAt: j.meta?.startedAt ?? null,
      records: j.records,
      lastTs: j.lastTs,
      simulated: j.meta?.simulated ?? false,
    })),
  }))
  handle('journal.read', ({ rideId }) => {
    const text = journal.read(rideId)
    // parse once here so a corrupt file fails loudly in main, not in the UI
    parseJournal(text)
    return { text }
  })

  handle('files.exportDir', () => ({ dir: exportDir() }))
  handle('files.chooseExportDir', async (_req, event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const res = await dialog.showOpenDialog(win!, {
      title: 'Choose where FreeGaz saves ride files',
      defaultPath: exportDir(),
      properties: ['openDirectory', 'createDirectory'],
    })
    if (res.canceled || !res.filePaths[0]) return { dir: null }
    settings.patch({ exportDir: res.filePaths[0] })
    return { dir: res.filePaths[0] }
  })
  handle('files.saveFit', ({ fileName, bytes }) => {
    const safe = sanitizeFileName(fileName.replace(/\.fit$/i, ''), '.fit')
    const path = writeInto(exportDir(), safe, bytes)
    return { path, fileName: safe }
  })
  handle('files.saveImage', ({ fileName, bytes }) => {
    if (!isJpeg(bytes)) throw new Error('Not a JPEG image')
    const safe = sanitizeFileName(fileName.replace(/\.jpe?g$/i, ''), '.jpg')
    return { path: writeInto(exportDir(), safe, bytes), fileName: safe }
  })
  handle('files.copyImage', async ({ path }) => {
    if (!isInside(exportDir(), path) || !/\.jpe?g$/i.test(path)) return { ok: false }
    const image = nativeImage.createFromPath(path)
    if (image.isEmpty()) return { ok: false }
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([image.toPNG().slice()], { type: 'image/png' }) })])
    return { ok: true }
  })
  handle('ride.capture', async (_req, event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    // E2E windows stay hidden but still paint; a rider's hidden or minimized window has nothing worth a picture
    if (!win || (!env.isTest && (!win.isVisible() || win.isMinimized()))) return { image: null, width: 0, height: 0 }
    const shot = await event.sender.capturePage()
    if (shot.isEmpty()) return { image: null, width: 0, height: 0 }
    const { width, height } = shot.getSize()
    return { image: new Uint8Array(shot.toJPEG(92)), width, height }
  })
  handle('files.saveAs', async ({ defaultName, bytes, filters }, event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const res = await dialog.showSaveDialog(win!, { defaultPath: join(app.getPath('documents'), sanitizeFileName(defaultName.replace(/\.[a-z0-9]+$/i, ''), defaultName.match(/\.[a-z0-9]+$/i)?.[0] ?? '.bin')), filters })
    if (res.canceled || !res.filePath) return { path: null }
    const { writeFileSync } = await import('node:fs')
    writeFileSync(res.filePath, bytes)
    return { path: res.filePath }
  })
  handle('files.reveal', ({ path }) => {
    // Only reveal files inside our export folder or userData.
    if (!path.startsWith(exportDir()) && !path.startsWith(app.getPath('userData'))) return { ok: false }
    shell.showItemInFolder(path)
    return { ok: true }
  })
  handle('files.listFits', async () => {
    const { readdirSync, statSync } = await import('node:fs')
    const dir = exportDir()
    let names: string[] = []
    try {
      names = readdirSync(dir).filter((n) => /\.fit$/i.test(n))
    } catch {
      // no folder yet
    }
    const files = names.flatMap((name) => {
      const st = statSync(join(dir, name), { throwIfNoEntry: false })
      return st?.isFile() ? [{ name, size: st.size, mtime: st.mtimeMs }] : []
    })
    return { dir, files }
  })
  handle('files.readFit', async ({ name }) => {
    const { readFileSync, statSync } = await import('node:fs')
    const { basename } = await import('node:path')
    if (basename(name) !== name) throw new Error('Plain file names only')
    const path = join(exportDir(), name)
    if ((statSync(path).size ?? 0) > 64 * 1024 * 1024) throw new Error('File too large')
    return { bytes: new Uint8Array(readFileSync(path)) }
  })
  handle('files.exportZwift', async ({ fileName, text }) => {
    const root = join(app.getPath('documents'), 'Zwift', 'Workouts')
    const { readdirSync, statSync, writeFileSync } = await import('node:fs')
    let dirs: string[] = []
    try {
      // Zwift keeps one folder per account, named with the numeric account id.
      dirs = readdirSync(root).filter((d) => /^\d+$/.test(d) && statSync(join(root, d)).isDirectory())
    } catch {
      // no Zwift install
    }
    if (dirs.length === 0) return { paths: [], error: 'No Zwift workouts folder found. Open Zwift once on this Mac, then try again.' }
    const name = sanitizeFileName(fileName.replace(/\.zwo$/i, ''), '.zwo')
    const paths = dirs.map((d) => {
      const p = join(root, d, name)
      writeFileSync(p, text)
      return p
    })
    return { paths, error: null }
  })
  handle('files.openUrl', async ({ url }) => {
    if (!isAllowedExternal(url)) return { ok: false }
    await shell.openExternal(url)
    return { ok: true }
  })

  let blocker: number | null = null
  handle('power.keepAwake', ({ on }) => {
    if (on && blocker === null) blocker = powerSaveBlocker.start('prevent-display-sleep')
    if (!on && blocker !== null) {
      powerSaveBlocker.stop(blocker)
      blocker = null
    }
    return { ok: true }
  })

  const broadcast = (suspended: boolean) => {
    for (const w of BrowserWindow.getAllWindows()) emit(w.webContents, 'power.suspend', { suspended })
  }
  powerMonitor.on('suspend', () => broadcast(true))
  powerMonitor.on('lock-screen', () => undefined)
  powerMonitor.on('resume', () => broadcast(false))

  app.on('before-quit', () => journal.closeAll())
}
