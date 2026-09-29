import type { FreegazBridge } from '@shared/ipc/contract'
import { createWebShim } from './web-shim'

/**
 * Returns the platform bridge. In Electron the preload has already installed
 * `window.freegaz`; in the browser-only build we install the web shim so the
 * renderer runs unchanged (simulated devices, IndexedDB-backed services).
 */
export function ensureBridge(): FreegazBridge {
  if (!window.freegaz) {
    window.freegaz = createWebShim()
  }
  return window.freegaz
}

export const bridge = (): FreegazBridge => window.freegaz
