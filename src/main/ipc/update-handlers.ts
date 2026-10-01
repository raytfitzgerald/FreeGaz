import type { UpdateService } from '../updater/update-service'
import { handle } from './register'

/** The service is created once the build's signature has been checked, a moment after launch. */
export function registerUpdateHandlers(service: Promise<UpdateService>): void {
  handle('update.status', async () => (await service).get())
  handle('update.check', async () => (await service).check())
  handle('update.download', async () => (await service).download())
  handle('update.install', async () => ({ ok: (await service).install() }))
}
