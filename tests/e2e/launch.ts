import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface LaunchOptions {
  sim?: boolean
  warp?: number
  env?: Record<string, string>
  /** Reuse a profile (e.g. to relaunch after a kill); it is then left in place on close. */
  userData?: string
}

export interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
  close(): Promise<void>
}

/** Launches the built app (run `npm run build` first) with an isolated profile. */
export async function launchApp(opts: LaunchOptions = {}): Promise<Launched> {
  const owned = opts.userData === undefined
  const userData = opts.userData ?? mkdtempSync(join(tmpdir(), 'freegaz-e2e-'))
  // Launch the project root so Electron reads package.json (name, version,
  // "main": out/main/index.js) exactly like the packaged app does.
  const args = [join(__dirname, '../..')]
  if (process.platform === 'linux') args.unshift('--no-sandbox')

  const app = await electron.launch({
    args,
    env: {
      ...(process.env as Record<string, string>),
      FREEGAZ_TEST: '1',
      FREEGAZ_USER_DATA: userData,
      FREEGAZ_SIM: opts.sim === false ? '0' : '1',
      FREEGAZ_WARP: String(opts.warp ?? 1),
      ...opts.env,
    },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  return {
    app,
    page,
    userData,
    async close() {
      await app.close().catch(() => undefined)
      if (owned) rmSync(userData, { recursive: true, force: true })
    },
  }
}
