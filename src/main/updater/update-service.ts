import type { UpdateStatus } from '@shared/ipc/contract'
import type { UpdatePrefs } from '@shared/settings'

/** The slice of electron-updater's `autoUpdater` this service drives (a fake in tests). */
export interface Updater {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
  on(event: 'checking-for-update', listener: () => void): unknown
  on(event: 'update-available' | 'update-not-available' | 'update-downloaded', listener: (info: { version: string }) => void): unknown
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown
  on(event: 'error', listener: (err: Error) => void): unknown
}

export interface UpdateServiceDeps {
  /** null when this build can't update itself; the status then says why. */
  updater: Updater | null
  unsupportedReason: Extract<UpdateStatus, { state: 'unsupported' }>['reason']
  prefs: () => UpdatePrefs
  onStatus: (status: UpdateStatus) => void
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  setRepeat?: (fn: () => void, ms: number) => unknown
}

/** First check a little after launch, so it never competes with device reconnects. */
export const FIRST_CHECK_DELAY_MS = 20_000
export const RECHECK_EVERY_MS = 6 * 60 * 60 * 1000

/**
 * Keeps the signed Mac app up to date from GitHub releases. Downloads happen
 * in the background; installing waits for "Restart to update" or the next
 * quit, so a ride is never cut short.
 */
export class UpdateService {
  private status: UpdateStatus
  private checkedAt: number | null = null
  private readonly now: () => number

  constructor(private readonly deps: UpdateServiceDeps) {
    this.now = deps.now ?? Date.now
    this.status = deps.updater ? { state: 'idle', checkedAt: null } : { state: 'unsupported', reason: deps.unsupportedReason }
    const u = deps.updater
    if (!u) return
    u.autoInstallOnAppQuit = true
    u.allowDowngrade = false
    u.on('checking-for-update', () => this.set({ state: 'checking' }))
    u.on('update-not-available', () => {
      this.checkedAt = this.now()
      this.set({ state: 'up-to-date', checkedAt: this.checkedAt })
    })
    u.on('update-available', ({ version }) => {
      this.checkedAt = this.now()
      // with auto updates off, the rider starts the download from About
      this.set(u.autoDownload ? { state: 'downloading', version, percent: 0 } : { state: 'available', version })
    })
    u.on('download-progress', ({ percent }) => {
      const version = 'version' in this.status ? this.status.version : ''
      this.set({ state: 'downloading', version, percent: Math.max(0, Math.min(100, Math.round(percent))) })
    })
    u.on('update-downloaded', ({ version }) => this.set({ state: 'ready', version }))
    u.on('error', (err) => {
      // a downloaded update stays installable even if a later check fails
      if (this.status.state === 'ready') return
      this.set({ state: 'error', message: describeError(err) })
    })
  }

  get(): UpdateStatus {
    return this.status
  }

  /** Starts the launch check and the periodic re-check, when automatic updates are on. */
  start(): void {
    if (!this.deps.updater) return
    const setTimer = this.deps.setTimer ?? setTimeout
    const setRepeat = this.deps.setRepeat ?? setInterval
    setTimer(() => void this.autoCheck(), FIRST_CHECK_DELAY_MS)
    setRepeat(() => void this.autoCheck(), RECHECK_EVERY_MS)
  }

  /** A check the rider asked for. Runs whether or not automatic updates are on. */
  async check(): Promise<UpdateStatus> {
    const u = this.deps.updater
    if (!u) return this.status
    if (this.status.state === 'checking' || this.status.state === 'downloading' || this.status.state === 'ready') return this.status
    this.applyPrefs(u)
    try {
      await u.checkForUpdates()
    } catch (err) {
      this.set({ state: 'error', message: describeError(err) })
    }
    return this.status
  }

  /** Downloads an update found while automatic updates were off. */
  async download(): Promise<UpdateStatus> {
    const u = this.deps.updater
    if (!u || this.status.state !== 'available') return this.status
    this.set({ state: 'downloading', version: this.status.version, percent: 0 })
    try {
      await u.downloadUpdate()
    } catch (err) {
      this.set({ state: 'error', message: describeError(err) })
    }
    return this.status
  }

  /** Quits and installs. Only once an update has been downloaded. */
  install(): boolean {
    if (!this.deps.updater || this.status.state !== 'ready') return false
    this.deps.updater.quitAndInstall()
    return true
  }

  private async autoCheck(): Promise<void> {
    if (!this.deps.prefs().auto) return
    await this.check()
  }

  private applyPrefs(u: Updater): void {
    const prefs = this.deps.prefs()
    u.autoDownload = prefs.auto
    u.allowPrerelease = prefs.prereleases
  }

  private set(status: UpdateStatus): void {
    this.status = status
    this.deps.onStatus(status)
  }
}

/** Short, plain errors for the About page; the full text goes to the log. */
export function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|net::ERR_/i.test(msg)) return "Couldn't reach GitHub. Check your connection and try again."
  if (/latest-mac\.yml|404/i.test(msg)) return "The newest release doesn't include an update for this app yet. Try again later, or download it from freegaz.app."
  if (/code signature|signature|designated requirement/i.test(msg)) return "The update's signature didn't match this app. Download the new version from freegaz.app."
  return (msg.split('\n')[0] ?? msg).slice(0, 200)
}
