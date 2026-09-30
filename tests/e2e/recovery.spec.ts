import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { launchApp, openFreeRide } from './launch'

// M2 exit criteria: a crash (renderer or the whole app) loses at most 2 s of ride.
type TestWindow = { __freegazTest: { runtime: { rides: { session: { movingSeconds: number } | null } } } }

async function startRecording(page: Page) {
  await page.getByRole('link', { name: 'Devices', exact: true }).click()
  await expect(page.getByTestId('device-trainer-name')).toHaveText('SIM KICKR 0001')
  await openFreeRide(page)
  await page.getByRole('radio', { name: 'ERG' }).click()
  await page.getByTestId('start-ride').click()
  await expect(page.getByTestId('recording-bar')).toBeVisible()
}
const moving = (page: Page) => page.evaluate(() => (window as unknown as TestWindow).__freegazTest.runtime.rides.session?.movingSeconds ?? 0)

async function recover(page: Page, recordedS: number) {
  const banner = page.getByTestId('recovery-banner')
  await expect(banner).toBeVisible({ timeout: 15_000 })
  const text = (await banner.textContent()) ?? ''
  const [, m, s] = /(\d+):(\d{2}) recorded/.exec(text) ?? []
  const journaled = Number(m) * 60 + Number(s)
  expect(recordedS - journaled).toBeLessThanOrEqual(2)
  await page.getByTestId('recover-ride').click()
  await page.getByRole('link', { name: 'Ride', exact: true }).click()
  await expect(page.getByTestId('saved-ride')).toContainText('(recovered)')
}

test('a renderer crash reloads the window and the ride is recovered with ≤ 2 s lost', async () => {
  const ctx = await launchApp({ sim: true })
  try {
    await startRecording(ctx.page)
    await expect.poll(() => moving(ctx.page), { timeout: 20_000 }).toBeGreaterThanOrEqual(8)
    const recorded = await moving(ctx.page)
    await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.forcefullyCrashRenderer())
    // Main reloads the window. Playwright never re-attaches to a crashed page,
    // so the reloaded renderer is driven through main.
    // executeJavaScript on a dead renderer never settles, so wait (asking main only)
    // until the window has reloaded, and bound every in-page call.
    await expect
      .poll(() => ctx.app.evaluate(({ BrowserWindow }) => {
        const wc = BrowserWindow.getAllWindows()[0]!.webContents
        return !wc.isCrashed() && !wc.isLoading()
      }), { timeout: 20_000 })
      .toBe(true)
    const js = <T>(code: string) =>
      Promise.race([
        ctx.app.evaluate(({ BrowserWindow }, c) => BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScript(c) as Promise<T>, code),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('renderer busy')), 2000)),
      ])
    await expect
      .poll(() => js<string | null>(`document.querySelector('[data-testid="recovery-banner"]')?.textContent ?? null`).catch(() => null), { timeout: 20_000 })
      .toMatch(/recorded before FreeGaz closed/)
    const text = (await js<string>(`document.querySelector('[data-testid="recovery-banner"]').textContent`)) ?? ''
    const [, m, sec] = /(\d+):(\d{2}) recorded/.exec(text) ?? []
    expect(recorded - (Number(m) * 60 + Number(sec))).toBeLessThanOrEqual(2)
    await js(`document.querySelector('[data-testid="recover-ride"]')?.click(); true`)
    await js(`location.hash = '#/ride'; true`)
    await expect.poll(() => js<string | null>(`document.querySelector('[data-testid="saved-ride"]')?.textContent ?? null`), { timeout: 15_000 }).toMatch(/\(recovered\)/)
  } finally {
    await ctx.close()
  }
})

test('a killed app offers the ride on the next launch with ≤ 2 s lost', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'freegaz-e2e-kill-'))
  try {
    const first = await launchApp({ sim: true, userData })
    await startRecording(first.page)
    await expect.poll(() => moving(first.page), { timeout: 20_000 }).toBeGreaterThanOrEqual(8)
    const recorded = await moving(first.page)
    first.app.process().kill('SIGKILL')
    await first.app.close().catch(() => undefined)

    const second = await launchApp({ sim: true, userData })
    try {
      await recover(second.page, recorded)
    } finally {
      await second.close()
    }
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
})
