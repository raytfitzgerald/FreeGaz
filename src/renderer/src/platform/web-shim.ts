// Browser-mode implementation of the preload bridge. It lets the renderer run in
// plain Chrome (or Claude's preview pane) with simulated devices, so UI work
// can be checked without Electron. Services that need the main process
// (file system, secrets, Strava, AI) are replaced by in-browser stand-ins.
import type { EventChannel, EventMap, FreegazBridge, InvokeChannel, InvokeReq, InvokeRes } from '@shared/ipc/contract'

type Handlers = { [C in InvokeChannel]: (req: InvokeReq<C>) => Promise<InvokeRes<C>> | InvokeRes<C> }

export function createWebShim(): FreegazBridge {
  const listeners = new Map<string, Set<(payload: unknown) => void>>()

  const handlers: Handlers = {
    'app.ping': ({ msg }) => ({ pong: msg, version: '0.1.0-web', platform: 'web' }),
    'app.info': () => ({
      version: '0.1.0-web',
      electron: 'n/a',
      chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? 'unknown',
      node: 'n/a',
      userData: 'IndexedDB (browser)',
      documents: 'Downloads (browser)',
      isPackaged: false,
      isTest: false,
      sim: true,
      warp: Number(new URLSearchParams(location.search).get('warp') ?? '1') || 1,
    }),
  }

  return {
    platform: 'web',
    async invoke<C extends InvokeChannel>(channel: C, req: InvokeReq<C>): Promise<InvokeRes<C>> {
      const handler = handlers[channel] as (r: InvokeReq<C>) => Promise<InvokeRes<C>> | InvokeRes<C>
      if (!handler) throw new Error(`web shim: unsupported channel ${channel}`)
      return handler(req)
    },
    on<E extends EventChannel>(event: E, listener: (payload: EventMap[E]) => void) {
      const set = listeners.get(event) ?? new Set()
      set.add(listener as (p: unknown) => void)
      listeners.set(event, set)
      return () => set.delete(listener as (p: unknown) => void)
    },
  }
}
