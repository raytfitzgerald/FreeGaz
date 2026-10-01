import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import FitParser from 'fit-file-parser'
import { launchApp, openFreeRide, type Launched } from './launch'

// Journeys against the simulator at 30× time warp: a free ride dropped at
// the Eiffel Tower moves a dot up a real road, and the FIT file carries it.
let ctx: Launched

test.beforeAll(async () => {
  ctx = await launchApp({ sim: true, warp: 30 })
  await ctx.page.getByRole('link', { name: 'Devices', exact: true }).click()
  await expect(ctx.page.getByTestId('device-trainer-name')).toHaveText('SIM KICKR 0001')
})
test.afterAll(async () => {
  await ctx?.close()
})

test('a free ride dropped at the Eiffel Tower goes somewhere, and the FIT file has the map', async () => {
  const { page } = ctx
  // off by default: the ride screen offers to turn it on
  await openFreeRide(page)
  await expect(page.getByTestId('where-to-off')).toBeVisible()
  await page.getByRole('link', { name: 'Turn on Journeys' }).click()
  const panel = page.getByRole('tabpanel')
  await expect(panel.getByRole('heading', { name: 'Journeys', exact: true })).toBeVisible()
  await panel.getByRole('switch').first().click()
  await expect(panel.getByRole('switch').first()).toHaveAttribute('data-state', 'checked')

  await openFreeRide(page)
  await page.getByTestId('where-to-select').selectOption('drop:eiffel-tower')
  await expect(page.getByTestId('where-to')).toContainText('Versailles')
  await page.getByTestId('start-ride').click()

  const map = page.getByTestId('journey-map')
  await expect(map).toBeVisible()
  await expect(page.getByTestId('journey-name')).toHaveText('Eiffel Tower to Rambouillet')
  await expect(page.getByTestId('journey-dot')).toBeVisible()
  const km = async () => Number((await page.getByTestId('journey-progress').textContent())!.match(/[\d.]+/)![0])
  await expect.poll(km, { timeout: 30_000 }).toBeGreaterThan(1)
  await expect(page.getByTestId('journey-next')).toContainText(/in [\d.]+ km/)
  await map.getByRole('radio', { name: 'Journey' }).click()

  await page.getByTestId('finish-ride').click()
  await page.getByTestId('confirm-finish').click()
  await expect(page.getByTestId('saved-ride')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('saved-ride')).toContainText('Eiffel Tower to Rambouillet')
  await expect(page.getByTestId('saved-journey')).toContainText(/Eiffel Tower to Rambouillet · [\d.]+ km ridden/)

  const dir = join(ctx.userData, 'Documents', 'FreeGaz', 'Rides')
  const file = readdirSync(dir).find((f) => f.includes('Eiffel Tower to Rambouillet') && f.endsWith('.fit'))!
  expect(file).toBeDefined()
  const fit = (await new FitParser({ mode: 'list', force: true }).parseAsync(readFileSync(join(dir, file)))) as unknown as {
    records: { position_lat?: number; position_long?: number; distance?: number }[]
  }
  const gps = fit.records.filter((r) => typeof r.position_lat === 'number')
  expect(gps.length).toBe(fit.records.length)
  // it starts at the tower, and the ride's distance matches its map
  expect(gps[0]!.position_lat).toBeCloseTo(48.858, 2)
  expect(gps[0]!.position_long).toBeCloseTo(2.294, 2)
  expect(fit.records.at(-1)!.distance).toBeGreaterThan(1000)
})

test('a grand journey started on a simulated ride is saved, but the simulator never moves it', async () => {
  const { page } = ctx
  await openFreeRide(page)
  await page.getByTestId('where-to-select').selectOption('start:lejog')
  await expect(page.getByTestId('where-to')).toContainText('Cornwall')
  await page.getByTestId('start-ride').click()
  await expect(page.getByTestId('journey-name')).toHaveText('Land’s End → John o’ Groats')
  await expect.poll(async () => Number((await page.getByTestId('journey-progress').textContent())!.match(/[\d.]+/)![0]), { timeout: 30_000 }).toBeGreaterThan(0.5)
  await page.getByTestId('finish-ride').click()
  await page.getByTestId('confirm-finish').click()
  await expect(page.getByTestId('saved-journey')).toContainText('day 1')
  await expect(page.getByTestId('saved-journey')).toContainText("simulated, so the journey didn't move")

  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Journeys' }).click()
  const row = page.getByTestId('journey-row').filter({ hasText: 'Land’s End → John o’ Groats' })
  await expect(row).toContainText(/0(\.0)? km of 1,?\d{3} km · 0 rides/)
  await expect(row).toContainText('Next ride')
})
