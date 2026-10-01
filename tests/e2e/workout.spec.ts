import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { launchApp, type Launched } from './launch'

// M3/M4 flows against the simulator at 30× time warp.
let ctx: Launched

test.beforeAll(async () => {
  ctx = await launchApp({ sim: true, warp: 30 })
  // Wait for the simulated trainer to connect (launch auto-connect).
  await ctx.page.getByRole('link', { name: 'Devices', exact: true }).click()
  await expect(ctx.page.getByTestId('device-trainer-name')).toHaveText('SIM KICKR 0001')
})
test.afterAll(async () => {
  await ctx?.close()
})

async function openWorkout(page: Page, name: string) {
  await page.getByRole('link', { name: 'Workouts', exact: true }).click()
  await expect(page.getByTestId('workout-card').nth(27)).toBeVisible()
  await page.getByPlaceholder('Search workouts').fill(name)
  await page.getByTestId('workout-card').filter({ hasText: name }).first().click()
  await page.getByTestId('ride-workout').click()
  await expect(page.getByTestId('interval-remaining')).toBeVisible()
}

const simRider = (page: Page, behavior: unknown) =>
  page.evaluate((b) => {
    ;(window as unknown as { __freegazTest: { runtime: { sim: { setBehavior(b: unknown): void } } } }).__freegazTest.runtime.sim.setBehavior(b)
  }, behavior)

async function finishRide(page: Page) {
  await page.getByTestId('finish-ride').click()
  await page.getByTestId('confirm-finish').click()
  await expect(page.getByTestId('saved-ride')).toBeVisible({ timeout: 15_000 })
}

test('rides a built-in workout: live HUD, skip to the next interval, finish and save', async () => {
  const { page } = ctx
  await openWorkout(page, 'Race Openers')
  // The cursor is a vertical SVG line (zero-width box), so check it exists and moves.
  const cursorX = async () => Number(await page.getByTestId('workout-cursor').getAttribute('x1'))
  const x0 = await cursorX()
  await expect.poll(cursorX, { timeout: 10_000 }).toBeGreaterThan(x0)
  await expect(page.getByTestId('target-value')).toHaveText(/^\d+$/)
  // ERG follows the plan: power settles near the target.
  await expect
    .poll(async () => {
      const [p, t] = await Promise.all([page.getByTestId('power-value').textContent(), page.getByTestId('target-value').textContent()])
      return Math.abs(Number(p) - Number(t))
    }, { timeout: 15_000 })
    .toBeLessThanOrEqual(12)

  const next = (await page.getByTestId('next-interval').textContent())!.replace(/^Next: /, '').split(' · ')[0]!
  await page.getByTestId('skip-interval').click()
  await expect(page.getByTestId('interval-remaining-label')).toHaveText(next)
  await expect(page.getByTestId('actual-power-line')).toHaveAttribute('d', /L/)

  await finishRide(page)
  await expect(page.getByTestId('saved-ride')).toContainText('Race Openers')
})

test('captures the hardest effort as a picture, saved next to the FIT file', async () => {
  const { page } = ctx
  await openWorkout(page, 'Race Openers')
  // moments start after two minutes of riding: at 30x that's a few seconds
  await expect(page.getByTestId('workout-progress')).toContainText(/^(2:[3-5]\d|[3-9]:\d\d) elapsed/, { timeout: 30_000 })
  await finishRide(page)
  const moments = page.getByTestId('ride-moments')
  await expect(moments).toBeVisible()
  await expect(moments.getByRole('img', { name: /^Hardest effort: Hardest 30 s · \d+ W/ })).toBeVisible()
  await expect(page.getByTestId('copy-moment-hard')).toBeVisible()

  const dir = join(ctx.userData, 'Documents', 'FreeGaz', 'Rides')
  const pic = readdirSync(dir).find((f) => f.includes('Race Openers') && f.endsWith(' - hardest effort.jpg'))
  expect(pic).toBeDefined()
  const bytes = readFileSync(join(dir, pic!))
  expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
  expect(bytes.length).toBeGreaterThan(20_000)
})

test('20-minute FTP test: ERG off for the effort, and the result appears after the ride', async () => {
  const { page } = ctx
  await openWorkout(page, 'FTP Test: 20 Minutes')
  await simRider(page, { kind: 'hold', watts: 250 })
  // Skip the warm-up blocks straight to the effort. Done in-page, checking the
  // player's live step between skips, so a step ending on its own at 30× can't
  // make us skip past the effort.
  const reached = await page.evaluate(async () => {
    type Rides = { session: { planTick: { segmentLabel: string | null } } | null; command(c: { type: 'skip' }): void }
    const rides = (window as unknown as { __freegazTest: { runtime: { rides: Rides } } }).__freegazTest.runtime.rides
    for (let i = 0; i < 20; i++) {
      if (rides.session?.planTick.segmentLabel === '20-min test effort') return true
      rides.command({ type: 'skip' })
      await new Promise((r) => setTimeout(r, 60))
    }
    return false
  })
  expect(reached).toBe(true)
  await expect(page.getByTestId('ftp-effort')).toBeVisible()
  // A fresh profile has the default 200 W FTP: pace 200 / 0.95 ≈ 211 W ± 3 %.
  await expect(page.getByTestId('ftp-effort')).toContainText('pace 205–217 W')
  // 20 minutes at 30× is 40 s.
  await expect(page.getByTestId('interval-remaining-label')).toHaveText('Cool-down', { timeout: 90_000 })

  await finishRide(page)
  const value = Number((await page.getByTestId('ftp-result-value').textContent())!.replace(/\D/g, ''))
  expect(value).toBeGreaterThanOrEqual(236)
  expect(value).toBeLessThanOrEqual(239)
  // Simulated rides never change FTP.
  await expect(page.getByTestId('ftp-result')).toContainText('Your FTP was not changed')
})

test('the Ride tab starts on a ride-type picker; a ride for time sets up and plays like a workout', async () => {
  const { page } = ctx
  await page.getByRole('link', { name: 'Ride', exact: true }).click()
  const launcher = page.getByTestId('ride-launcher')
  // an earlier ride left the tab on its own kind: go back to the picker
  const change = page.getByTestId('change-ride')
  if (await change.isVisible()) await change.click()
  await expect(launcher.getByRole('heading', { name: 'What are we riding?' })).toBeVisible()
  await page.getByTestId('ride-choice-time').click()
  await page.getByRole('button', { name: '20 min', exact: true }).click()
  await page.getByTestId('start-time-ride').click()
  await expect(page.getByRole('heading', { name: '20-minute ride' })).toBeVisible()
  await expect(page.getByTestId('ride-button')).toHaveAttribute('data-recording', 'true')
  await page.getByTestId('finish-ride').click()
  await page.getByRole('button', { name: 'Discard' }).click()
  // back on the same setup, not a free ride
  await expect(launcher.getByRole('heading', { name: 'Ride for time' })).toBeVisible()
  await page.getByTestId('change-ride').click()
  await expect(launcher.getByRole('heading', { name: 'What are we riding?' })).toBeVisible()
})
