import { app, type BrowserWindow } from 'electron'

/**
 * FREEGAZ_SELFTEST=1: boot, round-trip one IPC call through the real preload,
 * print the result and exit. Used to smoke-test the *packaged* app, which
 * Playwright cannot drive (the hardening fuses disable --inspect).
 */
export function runSelfTestIfRequested(win: BrowserWindow): void {
  if (process.env.FREEGAZ_SELFTEST !== '1') return

  const fail = (why: string) => {
    process.stdout.write(`SELFTEST FAIL ${why}\n`)
    app.exit(1)
  }
  const timer = setTimeout(() => fail('timeout'), 20_000)

  win.webContents.once('did-finish-load', () => {
    win.webContents
      .executeJavaScript(
        "window.freegaz.invoke('app.ping', { msg: 'selftest' }).then((r) => JSON.stringify({ r, url: location.href }))",
      )
      .then((json: string) => {
        clearTimeout(timer)
        process.stdout.write(`SELFTEST OK ${json}\n`)
        app.exit(0)
      })
      .catch((e: unknown) => fail(String(e)))
  })
}
