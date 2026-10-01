import { app } from 'electron'
import { execFile } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import type { UpdateStatus } from '@shared/ipc/contract'
import { env } from '../env'
import type { Updater } from './update-service'

type Unsupported = Extract<UpdateStatus, { state: 'unsupported' }>['reason']

/** Releases come from this repo; electron-builder's `publish` config writes the matching latest-mac.yml. */
const FEED = { provider: 'github', owner: 'raytfitzgerald', repo: 'FreeGaz' } as const

/**
 * The real updater, or why this build can't have one. Squirrel.Mac only
 * accepts an update signed by the same Developer ID as the running app, so
 * dev, test and ad-hoc (`npm run dist`) builds never check.
 */
export async function loadUpdater(): Promise<{ updater: Updater | null; reason: Unsupported }> {
  if (process.platform !== 'darwin') return { updater: null, reason: 'platform' }
  if (!app.isPackaged || env.isTest) return { updater: null, reason: 'dev' }
  if (!(await isDeveloperIdSigned(appBundlePath()))) return { updater: null, reason: 'unsigned' }
  const { autoUpdater } = await import('electron-updater')
  autoUpdater.logger = {
    info: (m: unknown) => console.info('[update]', m),
    warn: (m: unknown) => console.warn('[update]', m),
    error: (m: unknown) => console.error('[update]', m),
    debug: () => {},
  }
  autoUpdater.setFeedURL(FEED)
  return { updater: autoUpdater as unknown as Updater, reason: 'dev' }
}

/** …/FreeGaz.app from …/FreeGaz.app/Contents/MacOS/FreeGaz. */
function appBundlePath(): string {
  return resolve(dirname(process.execPath), '..', '..')
}

function isDeveloperIdSigned(bundle: string): Promise<boolean> {
  return new Promise((done) => {
    // codesign prints the signature details on stderr
    execFile('/usr/bin/codesign', ['-dv', '--verbose=2', bundle], { timeout: 5000 }, (err, _stdout, stderr) => {
      done(!err && /^Authority=Developer ID Application:/m.test(String(stderr)))
    })
  })
}
