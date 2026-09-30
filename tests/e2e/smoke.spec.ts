import { expect, test } from '@playwright/test'
import { launchApp, type Launched } from './launch'

let ctx: Launched

test.beforeAll(async () => {
  ctx = await launchApp()
})

test.afterAll(async () => {
  await ctx?.close()
})

test('window boots with the app shell', async () => {
  await expect(ctx.page).toHaveTitle('FreeGaz')
  await expect(ctx.page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await expect(ctx.page.getByTestId('app-info')).toContainText('FreeGaz')
})

test('IPC ping round-trips through the typed bridge', async () => {
  const res = await ctx.page.evaluate(() => window.freegaz.invoke('app.ping', { msg: 'pedal harder' }))
  expect(res.pong).toBe('pedal harder')
  expect(res.version).toMatch(/^\d+\.\d+\.\d+/)
})

test('main rejects invalid IPC payloads', async () => {
  const err = await ctx.page.evaluate(async () => {
    try {
      // @ts-expect-error deliberately wrong payload shape
      await window.freegaz.invoke('app.ping', { msg: 42 })
      return null
    } catch (e) {
      return String(e)
    }
  })
  expect(err).toContain('Invalid request')
})

test('renderer is sandboxed and isolated', async () => {
  const prefs = await ctx.app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0]!.webContents
    // Runtime API (present in Electron 44) that is missing from its typings.
    const p = (wc as unknown as { getLastWebPreferences(): Electron.WebPreferences }).getLastWebPreferences()
    return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration }
  })
  expect(prefs).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false })

  const leaks = await ctx.page.evaluate(() => ({
    require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
  }))
  expect(leaks).toEqual({ require: 'undefined', process: 'undefined' })
})

test('page is served from the app:// origin with a CSP', async () => {
  expect(ctx.page.url()).toMatch(/^app:\/\/freegaz\//)

  const csp = await ctx.page.evaluate(() =>
    fetch(location.href).then((r) => r.headers.get('content-security-policy')),
  )
  expect(csp).toContain("script-src 'self'")
  expect(csp).toContain("object-src 'none'")

  // An injected inline script must not execute (script-src has no 'unsafe-inline').
  const inlineRan = await ctx.page.evaluate(async () => {
    const w = window as unknown as { __inlineRan?: boolean }
    const violation = new Promise<boolean>((resolve) => {
      document.addEventListener('securitypolicyviolation', () => resolve(true), { once: true })
      setTimeout(() => resolve(false), 1000)
    })
    const s = document.createElement('script')
    s.textContent = 'window.__inlineRan = true'
    document.head.appendChild(s)
    const violated = await violation
    return { ran: w.__inlineRan === true, violated }
  })
  expect(inlineRan).toEqual({ ran: false, violated: true })
})

test('Report a bug opens a pre-filled GitHub issue, with diagnostics the reporter can see', async () => {
  const { page, app } = ctx
  // catch the browser hand-off instead of opening one
  await app.evaluate(({ shell }) => {
    const g = globalThis as { __opened?: string[] }
    g.__opened = []
    shell.openExternal = async (url: string) => {
      g.__opened!.push(url)
    }
  })
  await page.getByTestId('report-bug').click()
  await expect(page.getByTestId('bug-diagnostics')).toContainText('FreeGaz')
  await page.getByTestId('bug-title').fill('Theme flips after a units change')
  await page.getByTestId('bug-what').fill('Light mode turned dark.')
  await page.getByTestId('bug-send').click()
  await expect(page.getByRole('status').filter({ hasText: 'Opened on GitHub' })).toBeVisible()
  const opened = await app.evaluate(() => (globalThis as { __opened?: string[] }).__opened ?? [])
  expect(opened).toHaveLength(1)
  const url = new URL(opened[0]!)
  expect(url.origin + url.pathname).toBe('https://github.com/raytfitzgerald/FreeGaz/issues/new')
  expect(url.searchParams.get('title')).toBe('Theme flips after a units change')
  expect(url.searchParams.get('body')).toContain('Light mode turned dark.')
  expect(url.searchParams.get('body')).toContain('### Diagnostics')
  expect(url.searchParams.get('body')).not.toContain('/Users/')
})
