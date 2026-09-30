import { expect, test, type Page } from '@playwright/test'
import { launchApp, type Launched } from './launch'

// The workout builder: palette → canvas → inspector → save → library, text
// mode both ways, direct manipulation with undo, and the unsaved-changes guard.
let ctx: Launched

test.beforeAll(async () => {
  ctx = await launchApp({ sim: true })
})
test.afterAll(async () => {
  await ctx?.close()
})

const blocks = (page: Page) => page.getByTestId('builder-block')

/** Opens the builder on a new workout, discarding whatever an earlier test left unsaved. */
async function newWorkout(page: Page) {
  await page.getByRole('link', { name: 'Home' }).click()
  // Leaving a draft with changes asks first (asynchronously): wait for Home or the question.
  // (The app starts at index.html with no hash at all, which is also Home.)
  const atHome = () => (location.hash.replace(/^#/, '') || '/') === '/'
  await page.waitForFunction(`(${atHome})() || document.querySelector('[data-testid="guard-discard"]') !== null`)
  const discard = page.getByTestId('guard-discard')
  if (await discard.isVisible()) await discard.click()
  await page.waitForFunction(atHome)
  await page.getByRole('link', { name: 'Builder' }).click()
  await expect(page.getByRole('heading', { name: 'Workout builder' })).toBeVisible()
  await expect(blocks(page)).toHaveCount(0)
}

async function addBlocks(page: Page, items: string[]) {
  for (const item of items) await page.getByTestId(`palette-${item}`).click()
  await expect(blocks(page)).toHaveCount(items.length)
}

test('builds a workout from the palette, edits a duration, saves it and finds it in the library', async () => {
  const { page } = ctx
  await newWorkout(page)
  await page.getByTestId('builder-name').fill('E2E Over-Unders')
  await addBlocks(page, ['warmup', 'z2', 'intervals', 'cooldown'])
  // Each block goes in after the selection and becomes the selection.
  await expect(blocks(page).nth(3)).toHaveAttribute('data-selected', 'true')
  await expect(blocks(page).nth(2)).toHaveAttribute('data-kind', 'intervals')
  // 10:00 warm-up + 10:00 Z2 + 4 × (3:00 + 3:00) + 10:00 cool-down.
  await expect(page.getByTestId('stat-duration')).toHaveText('54:00')
  await expect(page.getByTestId('builder-dirty')).toBeVisible()

  // Select the Z2 block on the canvas and make it 15 minutes in the inspector.
  await blocks(page).nth(1).click()
  await expect(page.getByTestId('inspector-kind')).toHaveText('Steady')
  await expect(page.getByTestId('inspector-power')).toHaveValue('66')
  const duration = page.getByTestId('inspector-duration')
  await duration.fill('15:00')
  await duration.press('Enter')
  await expect(duration).toHaveValue('15:00')
  await expect(page.getByTestId('stat-duration')).toHaveText('59:00')

  await page.getByTestId('builder-save').click()
  await expect(page.getByTestId('builder-notice')).toContainText('Saved “E2E Over-Unders” to your library.')
  await expect(page.getByTestId('builder-clean')).toBeVisible()

  await page.getByRole('link', { name: 'Workouts' }).click()
  // FreeGaz's own workouts show first; yours are on Custom workouts
  await expect(page.getByTestId('workout-tab-freegaz')).toHaveAttribute('aria-selected', 'true')
  await page.getByTestId('workout-tab-custom').click()
  await page.getByPlaceholder('Search workouts').fill('E2E Over-Unders')
  const card = page.getByTestId('workout-card').filter({ hasText: 'E2E Over-Unders' })
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('59m')
  await expect(card).toContainText('Mine')

  // It reopens from the library with everything intact.
  await card.click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByTestId('builder-name')).toHaveValue('E2E Over-Unders')
  await expect(blocks(page)).toHaveCount(4)
  await expect(page.getByTestId('stat-duration')).toHaveText('59:00')
})

test('text mode round-trips the workout through intervals.icu text', async () => {
  const { page } = ctx
  await newWorkout(page)
  await addBlocks(page, ['warmup', 'z2', 'intervals', 'cooldown'])

  await page.getByRole('radio', { name: 'Text' }).click()
  const text = page.getByTestId('builder-text')
  await expect(text).toHaveValue('- 10m warmup 45-75%\n- 10m 66%\n\n4x\n- 3m 110%\n- 3m 50%\n\n- 10m cooldown 70-45%\n')

  // Typing a different workout updates the blocks after a short pause.
  const typed = 'Warm-up\n- 10m warmup 45-75%\n\nMain set 3x\n- 8m 95%\n- 4m 55%\n\n- 5m freeride\n- 10m cooldown 65-45%\n'
  await text.fill(typed)
  await expect(blocks(page)).toHaveCount(4)
  await expect(blocks(page).nth(1)).toHaveAttribute('data-kind', 'intervals')
  await expect(blocks(page).nth(2)).toHaveAttribute('data-kind', 'freeride')
  await expect(page.getByTestId('stat-duration')).toHaveText('1:01:00')
  await expect(page.getByTestId('builder-text-status')).toContainText('In sync')

  // A mistake is reported with its line number and changes nothing.
  await text.fill(`${typed}- 5m banana\n`)
  await expect(page.getByTestId('builder-text-errors')).toContainText('Line 10: Unknown "banana".')
  await expect(page.getByTestId('stat-duration')).toHaveText('1:01:00')

  // Leaving text mode and coming back regenerates the text from the workout: exactly what was typed.
  await page.getByRole('radio', { name: 'Blocks' }).click()
  await expect(text).toHaveCount(0)
  await expect(blocks(page)).toHaveCount(4)
  await page.getByRole('radio', { name: 'Text' }).click()
  await expect(text).toHaveValue(typed)

  // Canvas-side changes flow back into the text.
  await page.getByTestId('builder-undo').click()
  await expect(text).toHaveValue('- 10m warmup 45-75%\n- 10m 66%\n\n4x\n- 3m 110%\n- 3m 50%\n\n- 10m cooldown 70-45%\n')
})

test('dragging a right edge changes the duration, and one drag is one undo step', async () => {
  const { page } = ctx
  await newWorkout(page)
  await addBlocks(page, ['z3'])
  await expect(page.getByTestId('stat-duration')).toHaveText('10:00')

  // Raw mouse input doesn't scroll for us the way click() does.
  await page.getByTestId('builder-canvas').scrollIntoViewIfNeeded()
  const box = await blocks(page).first().boundingBox()
  if (!box) throw new Error('block not laid out')
  const x = box.x + box.width - 1
  const y = box.y + box.height - 15
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 60, y, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByTestId('stat-duration')).not.toHaveText('10:00')
  const stretched = await page.getByTestId('stat-duration').textContent()
  expect(stretched).toMatch(/^1[1-3]:[0-5][05]$/)

  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByTestId('stat-duration')).toHaveText('10:00')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(page.getByTestId('stat-duration')).toHaveText(stretched ?? '')

  // Keyboard editing: duplicate, move and delete the selection.
  await page.keyboard.press('ControlOrMeta+d')
  await expect(blocks(page)).toHaveCount(2)
  await page.keyboard.press('Delete')
  await expect(blocks(page)).toHaveCount(1)
})

test('asks before leaving with unsaved changes', async () => {
  const { page } = ctx
  await newWorkout(page)
  await addBlocks(page, ['z2'])

  await page.getByRole('link', { name: 'Workouts' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Leave without saving?')
  await page.getByTestId('guard-stay').click()
  await expect(dialog).toHaveCount(0)
  await expect(blocks(page)).toHaveCount(1)

  await page.getByRole('link', { name: 'Workouts' }).click()
  await page.getByTestId('guard-discard').click()
  await expect(page.getByRole('heading', { name: 'Workouts' })).toBeVisible()
})

// Last: it leaves a ride running, which the app's shutdown takes care of.
test('Ride it saves the workout and starts riding it', async () => {
  const { page } = ctx
  await newWorkout(page)
  await page.getByTestId('builder-name').fill('E2E Ride It')
  await addBlocks(page, ['warmup', 'z2'])

  await page.getByTestId('builder-ride').click()
  await expect(page).toHaveURL(/#\/ride$/)
  const riding = () => page.evaluate(() => (window as unknown as { __freegazTest: { runtime: { rides: { active: boolean } } } }).__freegazTest.runtime.rides.active)
  await expect.poll(riding).toBe(true)
  // Saved first, so leaving the builder asked nothing and the library has it.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('link', { name: 'Workouts' }).click()
  await page.getByTestId('workout-tab-custom').click()
  await page.getByPlaceholder('Search workouts').fill('E2E Ride It')
  await expect(page.getByTestId('workout-card').filter({ hasText: 'E2E Ride It' })).toHaveCount(1)
})

test('a workout can be filed in the Training plan from the builder, ordered there, and moved back', async () => {
  const { page } = ctx
  for (const name of ['E2E Plan One', 'E2E Plan Two']) {
    await newWorkout(page)
    await addBlocks(page, ['z2', 'z4'])
    await page.getByTestId('builder-name').fill(name)
    await page.getByTestId('builder-folder').selectOption('plan')
    await page.getByTestId('builder-save').click()
    await expect(page.getByTestId('builder-clean')).toBeVisible()
  }
  await page.getByRole('link', { name: 'Workouts' }).click()
  await page.getByTestId('workout-tab-plan').click()
  const items = page.getByTestId('plan-item')
  await expect(items).toHaveCount(2)
  await expect(items.nth(0)).toContainText('E2E Plan One')
  await expect(items.nth(0).getByLabel('Number 1 in your plan')).toBeVisible()
  await page.getByRole('button', { name: 'Move E2E Plan Two earlier' }).click()
  await expect(items.nth(0)).toContainText('E2E Plan Two')
  await page.getByRole('button', { name: 'Move E2E Plan One back to Custom workouts' }).click()
  await expect(items).toHaveCount(1)
  await page.getByTestId('workout-tab-custom').click()
  await expect(page.getByTestId('workout-card').filter({ hasText: 'E2E Plan One' })).toHaveCount(1)
})
