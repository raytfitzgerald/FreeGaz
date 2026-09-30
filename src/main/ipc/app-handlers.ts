import { app, shell } from 'electron'
import { bugIssueUrl } from '@core/support/bug-report'
import { env } from '../env'
import { handle } from './register'

export function registerAppHandlers(): void {
  handle('app.ping', ({ msg }) => ({
    pong: msg,
    version: app.getVersion(),
    platform: process.platform,
  }))

  handle('app.info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    userData: app.getPath('userData'),
    documents: app.getPath('documents'),
    isPackaged: app.isPackaged,
    isTest: env.isTest,
    sim: env.sim,
    warp: env.warp,
    os: process.getSystemVersion(),
    arch: process.arch,
  }))

  handle('support.reportBug', async ({ title, body }) => {
    const { url, trimmed } = bugIssueUrl(title, body)
    await shell.openExternal(url)
    return { ok: true, trimmed }
  })
}
