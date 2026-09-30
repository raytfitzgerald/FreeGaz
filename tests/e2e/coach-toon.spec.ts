import { expect, test, type Page } from '@playwright/test'
import { launchApp, type Launched } from './launch'

// The Bibi caricature: a bobblehead that swaps photos with each line and rides
// onto the ride screen with his lines.
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

test('Settings: Bibi is a caricature that swaps photos with every sample', async () => {
  const { page } = ctx
  await silenceVoice(page)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Coach' }).click()
  await page.getByTestId('persona-bibi').click()
  const toon = page.getByRole('img', { name: /Bibi, riding a bike/ })
  await expect(toon).toBeVisible()
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

test('ride: Bibi rides alongside and says his line, and stands still when the Mac asks for less motion', async () => {
  const { page } = ctx
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('link', { name: 'Ride', exact: true }).click()
  await page.getByTestId('start-ride').click()
  const along = page.getByTestId('ride-along')
  await expect(along.getByRole('img', { name: /Bibi, riding next to you/ })).toBeVisible()
  // the ride-start line comes within a couple of seconds, in his speech bubble rather than the cue banner
  const bubble = page.getByTestId('ride-along-bubble')
  await expect(bubble).not.toHaveText(/^\s*$/, { timeout: 15_000 })
  await expect(page.getByTestId('cue')).toHaveCount(0)
  const pose = () =>
    page.evaluate(() => {
      const svg = document.querySelector('[data-testid="ride-along-coach"] [data-testid="coach-toon"] svg')
      return [svg?.querySelector('[data-part="root"]')?.getAttribute('transform'), svg?.querySelector('[data-part="jaw"]')?.getAttribute('y')]
    })
  const first = await pose()
  expect(first).toEqual(['translate(0.00 0.00)', '-8.00'])
  await page.waitForTimeout(400)
  expect(await pose()).toEqual(first)

  // the mute button silences him for the ride, and says so
  await along.getByTestId('ride-along-mute').click()
  await expect(along.getByTestId('ride-along-mute')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('cue')).toContainText('Coach muted')
  await page.getByTestId('mute-coach').click()
  await expect(page.getByTestId('mute-coach')).toHaveAttribute('aria-pressed', 'false')

  // folded, the strip keeps the gap and the controls
  await along.getByTestId('ride-along-toggle').click()
  await expect(along).toHaveAttribute('data-mode', 'minimized')
  await expect(along.getByTestId('ride-along-gap')).toBeVisible()
  await expect(page.getByTestId('ride-along-coach')).toHaveCount(0)
  await along.getByTestId('ride-along-toggle').click()
  await page.getByTestId('finish-ride').click()
  await page.getByRole('button', { name: 'Discard' }).click()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
})

test('Settings: The Donald has his own caricature, four photos and a long red tie', async () => {
  const { page } = ctx
  await silenceVoice(page)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Coach' }).click()
  await page.getByTestId('persona-trump').click()
  const toon = page.getByRole('img', { name: /The Donald, riding a bike/ })
  await expect(toon).toBeVisible()
  await expect(toon.locator('[data-part="tie"]')).toHaveAttribute('fill', '#d7263d')
  const heads = [await toon.getAttribute('data-head')]
  for (let i = 0; i < 4; i++) {
    await page.getByTestId('coach-preview').click()
    await expect(toon).not.toHaveAttribute('data-head', heads.at(-1)!)
    heads.push(await toon.getAttribute('data-head'))
  }
  expect(new Set(heads).size).toBe(4)
  // both layers, head and jaw, are his photos (small ones are inlined as data URIs)
  const layers = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="coach-toon"] image')].map((i) => i.getAttribute('href') ?? '').filter((h) => /trump-.*\.webp$/.test(h) || h.startsWith('data:image/webp')).length,
  )
  expect(layers).toBe(2)
})
