import { BrowserWindow, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { IntervalsClient } from '../integrations/intervals'
import { MusicControl } from '../integrations/music'
import { UploadOutbox } from '../integrations/outbox'
import { StravaClient } from '../integrations/strava'
import type { SecretStore } from '../secrets/secret-store'
import { emit, handle } from './register'

/** Strava / intervals.icu configuration and the upload outbox. */
export function registerIntegrationHandlers(deps: { secrets: SecretStore; userData: string; exportDir: () => string }): UploadOutbox {
  const strava = new StravaClient(deps.secrets)
  const intervals = new IntervalsClient(deps.secrets)

  const outbox = UploadOutbox.inDir(
    deps.userData,
    {
      strava: (item, bytes) => strava.uploadFit({ bytes, fileName: item.fileName, name: item.name, description: item.description, externalId: `freegaz-${item.rideId}` }),
      intervals: (item, bytes) => intervals.uploadFit({ bytes, fileName: item.fileName, name: item.name, description: item.description, externalId: `freegaz-${item.rideId}` }),
    },
    (path) => new Uint8Array(readFileSync(path)),
    (item) => {
      for (const w of BrowserWindow.getAllWindows()) emit(w.webContents, 'uploads.changed', item)
    },
  )
  outbox.kick()

  const music = new MusicControl()
  handle('music.status', () => music.status())
  handle('music.command', ({ action }) => music.command(action))

  handle('strava.status', () => strava.status())
  handle('strava.setApp', ({ clientId, clientSecret }) => {
    strava.setApp({ clientId, clientSecret })
    return { ok: true }
  })
  handle('strava.connect', async () => {
    try {
      const t = await strava.connect(async (url) => {
        await shell.openExternal(url)
      })
      return { ok: true, athleteName: t.athleteName }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
  handle('strava.disconnect', () => {
    strava.disconnect()
    return { ok: true }
  })

  handle('intervals.status', () => intervals.status())
  handle('intervals.configure', ({ apiKey, athleteId }) => {
    intervals.configure({ apiKey, athleteId: athleteId || '0' })
    return { ok: true }
  })
  handle('intervals.clear', () => {
    intervals.clear()
    return { ok: true }
  })

  handle('uploads.enqueue', (req) => {
    // Only files FreeGaz itself exported may be uploaded.
    if (!req.fitPath.startsWith(deps.exportDir())) throw new Error('Upload path is outside the FreeGaz export folder')
    const item = outbox.enqueue(req)
    return { id: item.id, status: item.status }
  })
  handle('uploads.list', () => ({ items: outbox.list() }))
  handle('uploads.retry', ({ id }) => {
    outbox.retry(id)
    return { ok: true }
  })
  return outbox
}
