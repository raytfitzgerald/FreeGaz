import { expect, test, type Page } from '@playwright/test'
import { launchApp, type Launched } from './launch'

let ctx: Launched
test.beforeAll(async () => {
  ctx = await launchApp()
})
test.afterAll(async () => {
  await ctx?.close()
})

/** Made-up rides this month, written straight into the throwaway test profile. */
async function seedRides(page: Page) {
  await page.evaluate(async () => {
    const now = new Date()
    const at = (day: number, h: number) => new Date(now.getFullYear(), now.getMonth(), day, h).getTime()
    const mk = (i: number, day: number, h: number, name: string, IF: number, kind: string) => ({
      id: `demo-${i}`, name, kind, simulated: false, startedAt: at(day, h), endedAt: at(day, h) + 3_600_000, movingS: 3600, elapsedS: 3700, kj: 700,
      tss: Math.round(IF * IF * 100), intensityFactor: IF, np: 220, avgPower: 210, mmp: [], laps: [], powerZonesS: [], hrZonesS: [], athlete: { ftpW: 250, weightKg: 75 }, createdAt: Date.now(), updatedAt: Date.now(),
    })
    const rides = [mk(1, 2, 7, 'Sweet Spot 3×12', 0.88, 'workout'), mk(2, 5, 9, 'Endurance 60', 0.65, 'free'), mk(3, 5, 18, 'Race Openers', 0.7, 'workout'), mk(4, 9, 8, 'FreeGaz Six Percent', 0.8, 'route'), mk(5, 12, 7, 'VO2 Max 5×4', 1.0, 'workout')]
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('freegaz')
      req.onsuccess = () => {
        const tx = req.result.transaction('rides', 'readwrite')
        for (const r of rides) tx.objectStore('rides').put(r)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
  })
}

test('History switches between the list and a month calendar, and remembers the choice', async () => {
  const { page } = ctx
  await seedRides(page)
  await page.getByRole('link', { name: 'History', exact: true }).click()
  await expect(page.getByTestId('ride-list')).toBeVisible()
  await page.getByRole('radio', { name: 'Calendar' }).click()
  const cal = page.getByTestId('ride-calendar')
  await expect(cal).toBeVisible()
  await expect(cal.getByTestId('calendar-ride')).toHaveCount(5)
  await expect(cal.getByTestId('calendar-ride-day')).toHaveCount(4) // two rides share the 5th
  await expect(cal.getByTestId('calendar-summary')).toContainText('5 rides')

  // a month back has none of its own (the faded days at its end may still show this month's), and Today comes home
  const month = await cal.getByTestId('calendar-month').textContent()
  await cal.getByTestId('calendar-prev').click()
  await expect(cal.getByTestId('calendar-summary')).toContainText('0 rides')
  await cal.getByRole('button', { name: 'Today' }).click()
  await expect(cal.getByTestId('calendar-month')).toHaveText(month!)

  // a chip opens the ride
  // a chip opens the ride, and a bare record (older app versions, imports) still renders
  await cal.getByTestId('calendar-ride').filter({ hasText: 'VO2 Max' }).click()
  await expect(page).toHaveURL(/#\/history\/demo-5$/)
  await expect(page.getByRole('heading', { name: 'VO2 Max 5×4' })).toBeVisible()
  await expect(page.getByText('Something went wrong')).toHaveCount(0)

  // back on History, the calendar is still the view
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'History', exact: true }).click()
  await expect(page.getByTestId('ride-calendar')).toBeVisible()
  await page.getByRole('radio', { name: 'List' }).click()
  await expect(page.getByTestId('ride-list')).toBeVisible()
})
