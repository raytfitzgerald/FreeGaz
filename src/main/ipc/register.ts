import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import type { z } from 'zod'
import {
  invoke as contract,
  type EventChannel,
  type EventMap,
  type InvokeChannel,
  type InvokeReq,
  type InvokeRes,
} from '@shared/ipc/contract'
import { APP_ORIGIN } from '../app-protocol'
import { env } from '../env'

type Handler<C extends InvokeChannel> = (
  req: z.output<(typeof contract)[C]['req']>,
  event: IpcMainInvokeEvent,
) => InvokeRes<C> | Promise<InvokeRes<C>>

/** Only frames served by our own app (or the dev server) may call main. */
export function isTrustedSender(frameUrl: string | undefined): boolean {
  if (!frameUrl) return false
  if (frameUrl.startsWith(`${APP_ORIGIN}/`)) return true
  if (env.devServerUrl && frameUrl.startsWith(env.devServerUrl)) return true
  return false
}

/**
 * Registers a handler for a contract channel. The request is parsed with the
 * channel's zod schema (unknown keys stripped, bad input rejected) and the
 * sender is checked before the handler ever runs.
 */
export function handle<C extends InvokeChannel>(channel: C, handler: Handler<C>): void {
  const schema = contract[channel].req
  ipcMain.handle(channel, async (event, raw: InvokeReq<C>) => {
    if (!isTrustedSender(event.senderFrame?.url)) {
      throw new Error(`Rejected IPC "${channel}" from untrusted sender`)
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      throw new Error(`Invalid request for "${channel}": ${parsed.error.message}`)
    }
    return handler(parsed.data as z.output<(typeof contract)[C]['req']>, event)
  })
}

/** Typed main -> renderer push. */
export function emit<E extends EventChannel>(target: WebContents, event: E, payload: EventMap[E]): void {
  if (!target.isDestroyed()) target.send(event, payload)
}
