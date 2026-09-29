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
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(243, 244, 247)')
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light')

  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(9, 11, 15)')
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')

  // System follows what macOS reports (forced here by the theme source itself).
  await page.getByRole('radio', { name: 'System' }).click()
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('system')
  const systemDark = await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors)
  await expect(page.locator('html')).toHaveAttribute('data-theme', systemDark ? 'dark' : 'light')
})
