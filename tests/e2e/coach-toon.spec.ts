import { expect, test, type Page } from '@playwright/test'
import { launchApp, type Launched } from './launch'

// The Bibi caricature: a labelled parody bobblehead that swaps photos with each
// line and rides onto the ride screen with his lines.
let ctx: Launched

/** A silent stand-in for the Mac's voice: it reports each word, then finishes. */
const silenceVoice = (page: Page) =>
  page.evaluate(() => {
    speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
      const words = u.text.split(/\s+/).length
      let i = 0
      const id = setInterval(() => {
        if (i++ < words) u.onboundary?.({ name: 'word' } as SpeechSynthesisEvent)
        else {
          clearInterval(id)
          u.onend?.({} as SpeechSynthesisEvent)
        }
      }, 120)
    }
    speechSynthesis.cancel = () => undefined
  })

test.beforeAll(async () => {
  ctx = await launchApp({ sim: true })
})
test.afterAll(async () => {
  await ctx?.close()
})

test('Settings: Bibi is a labelled caricature that swaps photos with every sample', async () => {
  const { page } = ctx
  await silenceVoice(page)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Coach' }).click()
  await page.getByTestId('persona-bibi').click()
  const toon = page.getByRole('img', { name: /Bibi, parody caricature/ })
  await expect(toon).toBeVisible()
  await expect(toon.getByTestId('parody-badge')).toHaveText(/parody/i)
  await expect(page.getByTestId('parody-disclaimer')).toHaveText('Parody. Not affiliated with or endorsed by Benjamin Netanyahu.')
  // every photo layer actually loads
  const loaded = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('[data-testid="persona-bibi"] img')] as HTMLImageElement[]
    await Promise.all(imgs.map((i) => i.decode()))
    return imgs.map((i) => i.naturalWidth)
  })
  expect(loaded).toEqual([288, 288])

  const heads = [await toon.getAttribute('data-head')]
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('coach-preview').click()
    await expect(toon).not.toHaveAttribute('data-head', heads.at(-1)!)
    heads.push(await toon.getAttribute('data-head'))
  }
  expect(new Set(heads).size).toBe(3)
  // it talks: the jaw moves while the line is being said
  await page.getByTestId('coach-preview').click()
  await expect
    .poll(() => page.evaluate(() => Number(document.querySelector('[data-testid="coach-toon"] [data-part="jaw"]')?.getAttribute('y'))), { timeout: 3000, intervals: [30] })
    .toBeGreaterThan(-7.5)
})

test('ride: Bibi rides onto the banner with his line, and stands still when the Mac asks for less motion', async () => {
  const { page } = ctx
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('link', { name: 'Ride', exact: true }).click()
  await page.getByTestId('start-ride').click()
  const cue = page.getByTestId('cue')
  // the ride-start line comes within a couple of seconds
  await expect(cue.getByRole('img', { name: /Bibi, parody caricature/ })).toBeVisible({ timeout: 15_000 })
  await expect(cue.getByTestId('parody-badge')).toHaveText(/parody/i)
  await expect(cue).not.toHaveText(/^\s*$/)
  const pose = () =>
    page.evaluate(() => {
      const svg = document.querySelector('[data-testid="cue"] [data-testid="coach-toon"] svg')
      return [svg?.querySelector('[data-part="root"]')?.getAttribute('transform'), svg?.querySelector('[data-part="jaw"]')?.getAttribute('y')]
    })
  const first = await pose()
  expect(first).toEqual(['translate(0.00 0.00)', '-8.00'])
  await page.waitForTimeout(400)
  expect(await pose()).toEqual(first)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
})
