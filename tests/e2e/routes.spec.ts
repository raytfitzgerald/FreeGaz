import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import FitParser from 'fit-file-parser'
import { launchApp, type Launched } from './launch'

// M6 flows against the simulator at 30× time warp: import a route, ride a
// demo route in Reactive mode, watch speed and grade follow the road, save.
let ctx: Launched

test.beforeAll(async () => {
  ctx = await launchApp({ sim: true, warp: 30 })
  await ctx.page.getByRole('link', { name: 'Devices' }).click()
  await expect(ctx.page.getByTestId('device-trainer-name')).toHaveText('SIM KICKR 0001')
})
test.afterAll(async () => {
  await ctx?.close()
})

/** A synthetic GPX track: 3 km east with a 5 % climb in the middle. Never a real ride. */
function syntheticGpx(): string {
  const pts: string[] = []
  for (let s = 0; s <= 3000; s += 20) {
    const ele = 50 + 0.05 * Math.min(1000, Math.max(0, s - 1000))
    const lon = 8 + s / (111_320 * Math.cos((46 * Math.PI) / 180))
    pts.push(`<trkpt lat="46.0000000" lon="${lon.toFixed(7)}"><ele>${ele.toFixed(2)}</ele></trkpt>`)
  }
  return `<?xml version="1.0"?><gpx version="1.1" creator="FreeGaz e2e" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>E2E Synthetic Hill</name><trkseg>${pts.join('')}</trkseg></trk></gpx>`
}

test('imports a GPX route into the library', async () => {
  const { page } = ctx
  await page.getByRole('link', { name: 'Routes' }).click()
  await expect(page.getByTestId('route-card')).toHaveCount(4) // the demo routes
  await page.getByTestId('route-file-input').setInputFiles({ name: 'e2e-hill.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(syntheticGpx()) })
  await expect(page.getByTestId('routes-notice')).toHaveText('Imported E2E Synthetic Hill.')
  // A single import opens the route: its profile, map and numbers.
  await expect(page.getByTestId('route-detail')).toBeVisible()
  await expect(page.getByTestId('route-profile').locator('svg path').first()).toBeVisible()
  // The outline of a due-east track is a flat line (a zero-height box Playwright calls hidden), so check its geometry.
  await expect(page.getByTestId('route-map').locator('polyline').first()).toHaveAttribute('points', /^[\d.]+,[\d.]+( [\d.]+,[\d.]+){20,}/)
  await expect(page.getByRole('dialog')).toContainText('50 m') // climbing
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('route-card')).toHaveCount(5)
})

test('rides a demo route in Reactive mode: speed and grade follow the road, then saves', async () => {
  const { page } = ctx
  await page.getByRole('link', { name: 'Routes' }).click()
  await page.getByTestId('route-card').filter({ hasText: 'FreeGaz Six Percent' }).click()
  await page.getByTestId('ride-route-reactive').click()
  await expect(page.getByTestId('route-view')).toBeVisible()

  const number = async (id: string) => Number((await page.getByTestId(id).textContent())!.replace('−', '-'))
  // It starts on the flat, and the simulated rider gets up to speed...
  await expect(page.getByTestId('route-grade-value')).toHaveText('0.0')
  await expect.poll(() => number('route-speed-value'), { timeout: 20_000 }).toBeGreaterThan(20)
  // ...then the 6 % climb arrives: the grade shows it, the trainer is asked for it, speed drops.
  await expect.poll(() => number('route-grade-value'), { timeout: 30_000 }).toBeGreaterThan(5)
  await expect(page.getByTestId('route-grade-sent')).toHaveText(/Trainer feels [56]\.\d %/)
  await expect.poll(() => number('route-speed-value'), { timeout: 20_000 }).toBeLessThan(18)
  await expect.poll(() => number('route-distance-value'), { timeout: 10_000 }).toBeGreaterThan(0.5)
  await expect(page.getByTestId('route-map').getByTestId('map-rider')).toBeVisible()

  // Switch to Steady mid-ride: the route sets the pace now.
  await page.getByRole('radiogroup', { name: 'Route playback' }).getByText('Steady').click()
  await expect(page.getByTestId('route-speed-label')).toHaveText(/route pace/)

  await page.getByTestId('finish-ride').click()
  await page.getByTestId('confirm-finish').click()
  await expect(page.getByTestId('saved-ride')).toContainText('FreeGaz Six Percent', { timeout: 15_000 })
})

test('a ride on an imported GPX writes GPS into the FIT file, so Strava draws the map', async () => {
  const { page } = ctx
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Routes' }).click()
  await page.getByTestId('route-card').filter({ hasText: 'E2E Synthetic Hill' }).click()
  await page.getByTestId('ride-route-reactive').click()
  await expect(page.getByTestId('route-view')).toBeVisible()
  await expect.poll(async () => Number(await page.getByTestId('route-distance-value').textContent()), { timeout: 20_000 }).toBeGreaterThan(0.3)
  await page.getByTestId('finish-ride').click()
  await page.getByTestId('confirm-finish').click()
  await expect(page.getByTestId('saved-ride')).toContainText('E2E Synthetic Hill', { timeout: 15_000 })

  const dir = join(ctx.userData, 'Documents', 'FreeGaz', 'Rides')
  const file = readdirSync(dir).find((f) => f.includes('E2E Synthetic Hill') && f.endsWith('.fit'))!
  const fit = (await new FitParser({ mode: 'list', force: true }).parseAsync(readFileSync(join(dir, file)))) as unknown as { records: { position_lat?: number; position_long?: number }[] }
  const withGps = fit.records.filter((r) => typeof r.position_lat === 'number')
  expect(withGps.length).toBeGreaterThan(fit.records.length * 0.9)
  expect(withGps[0]!.position_lat).toBeCloseTo(46, 3)
  const lons = withGps.map((r) => r.position_long!)
  expect(Math.min(...lons)).toBeGreaterThanOrEqual(8 - 1e-6)
  expect(Math.max(...lons)).toBeGreaterThan(Math.min(...lons)) // the dot moved east along the road
})
