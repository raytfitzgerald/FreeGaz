import { defineConfig } from '@playwright/test'

// Electron end-to-end tests. Every spec launches the built app (out/) with a
// throwaway userData dir, simulated devices and (where useful) time warp.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
})
