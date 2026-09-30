import { expect, test } from '@playwright/test'
import { launchApp, type Launched } from './launch'

let ctx: Launched

test.beforeAll(async () => {
  ctx = await launchApp()
})
test.afterAll(async () => {
  await ctx?.close()
})

test('the theme switches between light and dark, for the page and for macOS', async () => {
  const { page, app } = ctx
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Appearance' }).click()

  await page.getByRole('radio', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(235, 241, 247)')
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light')

  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(17, 29, 54)')
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')

  // System follows what macOS reports (forced here by the theme source itself).
  await page.getByRole('radio', { name: 'System' }).click()
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('system')
  const systemDark = await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors)
  await expect(page.locator('html')).toHaveAttribute('data-theme', systemDark ? 'dark' : 'light')
})

test('light mode survives changing a coach setting', async () => {
  const { page, app } = ctx
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Appearance' }).click()
  await page.getByRole('radio', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.getByRole('tab', { name: 'Coach' }).click()
  for (const level of ['1 Gentle', '5 Feral']) {
    await page.getByRole('radio', { name: level }).click()
    await expect(page.getByRole('radio', { name: level })).toHaveAttribute('data-state', 'on')
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light')
})

test('light mode survives changing units, speed and weight', async () => {
  const { page, app } = ctx
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Appearance' }).click()
  await page.getByRole('radio', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  for (const option of ['Imperial', 'Metric', 'mph', 'lb', 'kg', 'km/h']) {
    await page.getByRole('radio', { name: option, exact: true }).click()
    await expect(page.getByRole('radio', { name: option, exact: true })).toHaveAttribute('data-state', 'on')
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light')
})
