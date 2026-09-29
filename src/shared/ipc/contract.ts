// The single source of truth for renderer <-> main communication.
//
//  * invoke channels: request/response. Main validates every request with the
//    zod schema below and rejects senders that are not our own window.
//  * events: main -> renderer pushes (typed, fire-and-forget).
//  * streams: long-running cancellable responses (AI). See `StreamChunk`.
//
// The preload script only forwards channel names listed in ./channels.ts, and
// a unit test keeps that list identical to the keys of `invoke`.
import { z } from 'zod'

const Empty = z.object({}).strict()

export const invoke = {
  'app.ping': {
    req: z.object({ msg: z.string().max(200) }),
    res: z.object({ pong: z.string(), version: z.string(), platform: z.string() }),
  },
  'app.info': {
    req: Empty,
    res: z.object({
      version: z.string(),
      electron: z.string(),
      chrome: z.string(),
      node: z.string(),
      userData: z.string(),
      documents: z.string(),
      isPackaged: z.boolean(),
      isTest: z.boolean(),
      /** Start with simulated devices (FREEGAZ_SIM=1). */
      sim: z.boolean(),
      /** Allow time warp > 1x (only ever honoured while all devices are simulated). */
      warp: z.number(),
    }),
  },
} as const satisfies Record<string, { req: z.ZodType; res: z.ZodType }>

export type InvokeContract = typeof invoke
export type InvokeChannel = keyof InvokeContract
export type InvokeReq<C extends InvokeChannel> = z.input<InvokeContract[C]['req']>
export type InvokeRes<C extends InvokeChannel> = z.output<InvokeContract[C]['res']>

/** Main -> renderer pushes. */
export interface EventMap {
  'app.log': { level: 'info' | 'warn' | 'error'; msg: string }
}
export type EventChannel = keyof EventMap

/** Shape of `window.freegaz`, implemented by the preload (Electron) or the web shim (browser). */
export interface FreegazBridge {
  readonly platform: 'electron' | 'web'
  invoke<C extends InvokeChannel>(channel: C, req: InvokeReq<C>): Promise<InvokeRes<C>>
  on<E extends EventChannel>(event: E, listener: (payload: EventMap[E]) => void): () => void
}
