import { expect, test, type Page } from '@playwright/test'
import { launchApp, openFreeRide, type Launched } from './launch'

// M1 exit criteria, against the simulator (real GATT bytes, real drivers).
let ctx: Launched

interface TestRuntime {
  clock: { now(): number }
  hub: { value(metric: string, now: number): number | null }
  controller: { setDesired(d: unknown): void; snapshot: { applied: { kind: string; watts?: number } | null } }
  sim: { trainer: { drop(ms: number): void; commandLog: { op: string; detail?: { watts?: number } }[] } }
}
type TestWindow = { __freegazTest: { runtime: TestRuntime } }

/** Instantaneous trainer power (the HUD tile shows the 3-s average). */
const power = (page: Page) =>
  page.evaluate(() => {
    const rt = (window as unknown as TestWindow).__freegazTest.runtime
    return rt.hub.value('power', rt.clock.now())
  })

const commands = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as TestWindow).__freegazTest.runtime.sim.trainer.commandLog.map((c) => (c.op === 'targetPower' ? `targetPower:${c.detail?.watts}` : c.op)),
  )

test.beforeAll(async () => {
  ctx = await launchApp({ sim: true })
})
test.afterAll(async () => {
  await ctx?.close()
})

test('simulated trainer and HR auto-connect on launch', async () => {
  const { page } = ctx
  await page.getByRole('link', { name: 'Devices', exact: true }).click()
  await expect(page.getByTestId('device-trainer-name')).toHaveText('SIM KICKR 0001')
  await expect(page.getByTestId('device-hr-name')).toHaveText('SIM HRM 0002')
  await expect(page.getByTestId('device-trainer')).toContainText('FTMS')
})

test('ERG 200 W: simulated power converges to 200 ± 5 W within 5 s', async () => {
  const { page } = ctx
  await openFreeRide(page)
  await page.getByRole('radio', { name: 'ERG' }).click()
  // Entering ERG soft-starts over 10 s; the criterion is the step response once
  // ERG is holding, so settle at the default 150 W first.
  await expect.poll(async () => Math.abs(((await power(page)) ?? 0) - 150), { timeout: 20_000, intervals: [250] }).toBeLessThanOrEqual(5)
  // default target 150 W → two big steps up
  await page.getByRole('button', { name: 'Increase a lot' }).click()
  await page.getByRole('button', { name: 'Increase a lot' }).click()
  await expect(page.getByTestId('target-value')).toHaveText('200')
  const start = Date.now()
  await expect.poll(async () => (await power(page)) ?? 0, { timeout: 5000, intervals: [200] }).toBeGreaterThanOrEqual(195)
  expect((await power(page))!).toBeLessThanOrEqual(205)
  expect(Date.now() - start).toBeLessThan(5000)
})

test('forced disconnect: control is re-acquired and the target re-sent within 3 s', async () => {
  const { page } = ctx
  // Self-contained: hold ERG 200 W (past any soft start) before pulling the plug.
  await page.evaluate(() => (window as unknown as TestWindow).__freegazTest.runtime.controller.setDesired({ mode: 'erg', watts: 200 }))
  await expect
    .poll(() => page.evaluate(() => (window as unknown as TestWindow).__freegazTest.runtime.controller.snapshot.applied?.watts ?? null), { timeout: 20_000 })
    .toBe(200)
  const t0 = await page.evaluate(() => {
    const trainer = (window as unknown as TestWindow).__freegazTest.runtime.sim.trainer
    trainer.commandLog.length = 0
    trainer.drop(200)
    return Date.now()
  })
  await expect.poll(() => commands(page), { timeout: 3000, intervals: [100] }).toEqual(expect.arrayContaining(['requestControl', 'start', 'targetPower:200']))
  expect(Date.now() - t0).toBeLessThan(3000)
  const ops = await commands(page)
  expect(ops.indexOf('requestControl')).toBeLessThan(ops.indexOf('start'))
  expect(ops.indexOf('start')).toBeLessThan(ops.indexOf('targetPower:200'))
})
