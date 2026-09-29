import type { FreegazBridge } from '../../src/shared/ipc/contract'

declare global {
  interface Window {
    freegaz: FreegazBridge
  }
}

export {}
