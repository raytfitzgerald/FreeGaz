import { createStore, useStore } from 'zustand'
import { EMPTY_FRAME, type LiveFrame } from '@shared/live'

/** Replaced wholesale ~4x/s by the engine. Select primitives only, never objects. */
export const liveStore = createStore<LiveFrame>(() => EMPTY_FRAME)

export function useLive<T>(selector: (frame: LiveFrame) => T): T {
  return useStore(liveStore, selector)
}
