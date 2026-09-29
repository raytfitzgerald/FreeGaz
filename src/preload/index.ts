// The entire renderer <-> main surface. Kept deliberately small: it forwards
// allowlisted channels and nothing else. All validation happens in main.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { EventChannel, EventMap, FreegazBridge, InvokeChannel } from '@shared/ipc/contract'
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '@shared/ipc/channels'

const invokeAllowed = new Set<string>(INVOKE_CHANNELS)
const eventsAllowed = new Set<string>(EVENT_CHANNELS)

const bridge: FreegazBridge = {
  platform: 'electron',

  invoke(channel: InvokeChannel, req: unknown) {
    if (!invokeAllowed.has(channel)) return Promise.reject(new Error(`Unknown channel ${channel}`))
    return ipcRenderer.invoke(channel, req)
  },

  on<E extends EventChannel>(event: E, listener: (payload: EventMap[E]) => void) {
    if (!eventsAllowed.has(event)) throw new Error(`Unknown event ${event}`)
    const wrapped = (_e: IpcRendererEvent, payload: EventMap[E]) => listener(payload)
    ipcRenderer.on(event, wrapped)
    return () => {
      ipcRenderer.removeListener(event, wrapped)
    }
  },
} as FreegazBridge

contextBridge.exposeInMainWorld('freegaz', bridge)
