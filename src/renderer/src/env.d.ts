/// <reference types="vite/client" />
import type { FreegazBridge } from '@shared/ipc/contract'

declare global {
  interface Window {
    /** Provided by the Electron preload, or by platform/web-shim.ts in browser mode. */
    freegaz: FreegazBridge
  }
  /** True in the browser-only build (vite.web.config.ts). */
  const __FREEGAZ_WEB__: boolean
  const __FREEGAZ_VERSION__: string
}

export {}
