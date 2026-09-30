import { app } from 'electron'
import { join } from 'node:path'

/** Process-wide flags, resolved once at startup. */
export const env = {
  /** True when launched by the Playwright E2E suite. Enables test hooks. */
  isTest: process.env.FREEGAZ_TEST === '1',
  /** Start with simulated devices instead of Bluetooth. */
  sim: process.env.FREEGAZ_SIM === '1',
  /** Time-warp factor for simulated rides (tests use 20-30x). */
  warp: Math.max(1, Number(process.env.FREEGAZ_WARP ?? '1') || 1),
  /** Dev server URL injected by electron-vite in `npm run dev`. */
  devServerUrl: process.env.ELECTRON_RENDERER_URL,
}

/**
 * Dev and test runs get their own userData so they never touch real rides.
 * IndexedDB is keyed by origin + userData, so this separation is load-bearing.
 * E2E runs (FREEGAZ_TEST with a FREEGAZ_USER_DATA profile) get a private Documents too.
 */
export function configureUserData(): void {
  const override = process.env.FREEGAZ_USER_DATA
  if (override) {
    app.setPath('userData', override)
    // Test runs also get their own Documents, so FIT exports and Zwift
    // workout files land in the throwaway profile, never the rider's folders.
    if (env.isTest) app.setPath('documents', join(override, 'Documents'))
  } else if (!app.isPackaged) {
    app.setPath('userData', join(app.getPath('appData'), 'FreeGaz-dev'))
  }
}
