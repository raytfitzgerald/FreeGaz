import { describe, expect, it } from 'vitest'
import type { UpdateStatus } from '@shared/ipc/contract'
import type { UpdatePrefs } from '@shared/settings'
import { describeError, FIRST_CHECK_DELAY_MS, RECHECK_EVERY_MS, UpdateService, type Updater } from './update-service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- one store for listeners of every event shape
type Listener = (arg: any) => void

class FakeUpdater implements Updater {
  autoDownload = true
  autoInstallOnAppQuit = false
  allowPrerelease = false
  allowDowngrade = true
  checks = 0
  downloads = 0
  installs = 0
  checkFails: Error | null = null
  private listeners = new Map<string, Listener[]>()

  on(event: string, listener: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
    return this
  }
  fire(event: string, arg?: unknown): void {
    for (const l of this.listeners.get(event) ?? []) l(arg)
  }
  async checkForUpdates(): Promise<unknown> {
    this.checks++
    if (this.checkFails) throw this.checkFails
    this.fire('checking-for-update')
    return null
  }
  async downloadUpdate(): Promise<unknown> {
    this.downloads++
    return null
  }
  quitAndInstall(): void {
    this.installs++
  }
}

function setup(opts: { prefs?: Partial<UpdatePrefs>; updater?: FakeUpdater | null } = {}) {
  const updater = opts.updater === undefined ? new FakeUpdater() : opts.updater
  const prefs: UpdatePrefs = { auto: true, prereleases: true, ...opts.prefs }
  const statuses: UpdateStatus[] = []
  const timers: { fn: () => void; ms: number; repeat: boolean }[] = []
  const service = new UpdateService({
    updater,
    unsupportedReason: 'unsigned',
    prefs: () => prefs,
    onStatus: (s) => statuses.push(s),
    now: () => 1_000,
    setTimer: (fn, ms) => timers.push({ fn, ms, repeat: false }),
    setRepeat: (fn, ms) => timers.push({ fn, ms, repeat: true }),
  })
  return { service, updater, prefs, statuses, timers }
}

describe('UpdateService', () => {
  it('says why a build without an updater never checks', async () => {
    const { service, timers } = setup({ updater: null })
    expect(service.get()).toEqual({ state: 'unsupported', reason: 'unsigned' })
    service.start()
    expect(timers).toHaveLength(0)
    expect(await service.check()).toEqual({ state: 'unsupported', reason: 'unsigned' })
    expect(service.install()).toBe(false)
  })

  it('installs on quit, never downgrades, and follows the prerelease setting', async () => {
    const { service, updater, prefs } = setup({ prefs: { prereleases: false } })
    expect(updater?.autoInstallOnAppQuit).toBe(true)
    expect(updater?.allowDowngrade).toBe(false)
    await service.check()
    expect(updater?.allowPrerelease).toBe(false)
    prefs.prereleases = true
    updater?.fire('update-not-available', { version: '0.4.0' })
    await service.check()
    expect(updater?.allowPrerelease).toBe(true)
  })

  it('checks a little after launch and every six hours, only with automatic updates on', () => {
    const { service, updater, prefs, timers } = setup()
    service.start()
    expect(timers.map((t) => [t.ms, t.repeat])).toEqual([
      [FIRST_CHECK_DELAY_MS, false],
      [RECHECK_EVERY_MS, true],
    ])
    timers[0]?.fn()
    expect(updater?.checks).toBe(1)
    updater?.fire('update-not-available', { version: '0.4.0' })
    prefs.auto = false
    timers[1]?.fn()
    expect(updater?.checks).toBe(1)
  })

  it('walks from checking through downloading to ready', async () => {
    const { service, updater, statuses } = setup()
    await service.check()
    updater?.fire('update-available', { version: '0.5.0' })
    updater?.fire('download-progress', { percent: 41.6 })
    updater?.fire('update-downloaded', { version: '0.5.0' })
    expect(statuses).toEqual([
      { state: 'checking' },
      { state: 'downloading', version: '0.5.0', percent: 0 },
      { state: 'downloading', version: '0.5.0', percent: 42 },
      { state: 'ready', version: '0.5.0' },
    ])
    expect(service.install()).toBe(true)
    expect(updater?.installs).toBe(1)
  })

  it('reports up to date with the time of the check', async () => {
    const { service, updater } = setup()
    await service.check()
    updater?.fire('update-not-available', { version: '0.4.0' })
    expect(service.get()).toEqual({ state: 'up-to-date', checkedAt: 1_000 })
  })

  it('with automatic updates off, finds an update and waits for the rider to download it', async () => {
    const { service, updater } = setup({ prefs: { auto: false } })
    await service.check()
    expect(updater?.autoDownload).toBe(false)
    updater?.fire('update-available', { version: '0.5.0' })
    expect(service.get()).toEqual({ state: 'available', version: '0.5.0' })
    await service.download()
    expect(updater?.downloads).toBe(1)
    expect(service.get()).toEqual({ state: 'downloading', version: '0.5.0', percent: 0 })
  })

  it("won't install until an update is downloaded, or start a second check mid-download", async () => {
    const { service, updater } = setup()
    expect(service.install()).toBe(false)
    await service.check()
    updater?.fire('update-available', { version: '0.5.0' })
    await service.check()
    expect(updater?.checks).toBe(1)
    expect(updater?.installs).toBe(0)
  })

  it('keeps a downloaded update installable when a later check fails', async () => {
    const { service, updater } = setup()
    await service.check()
    updater?.fire('update-downloaded', { version: '0.5.0' })
    updater?.fire('error', new Error('net::ERR_INTERNET_DISCONNECTED'))
    expect(service.get()).toEqual({ state: 'ready', version: '0.5.0' })
  })

  it('turns a failed check into a plain error', async () => {
    const updater = new FakeUpdater()
    updater.checkFails = new Error('getaddrinfo ENOTFOUND api.github.com')
    const { service } = setup({ updater })
    expect(await service.check()).toEqual({ state: 'error', message: "Couldn't reach GitHub. Check your connection and try again." })
  })
})

describe('describeError', () => {
  it('explains a release without update files', () => {
    expect(describeError(new Error('Cannot find latest-mac.yml in the latest release artifacts'))).toMatch(/doesn't include an update/)
  })
  it('explains a signature mismatch', () => {
    expect(describeError(new Error('Code signature at URL did not pass validation'))).toMatch(/signature didn't match/)
  })
  it('keeps the first line of anything else', () => {
    expect(describeError(new Error('Something odd\nstack…'))).toBe('Something odd')
  })
})
