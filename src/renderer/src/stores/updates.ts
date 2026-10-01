import { createStore, useStore } from 'zustand'
import type { UpdateStatus } from '@shared/ipc/contract'
import { bridge } from '../platform/bridge'

/** Mirror of the main-process updater's status. */
export const updateStore = createStore<UpdateStatus>(() => ({ state: 'idle', checkedAt: null }))

export function useUpdateStatus<T>(selector: (s: UpdateStatus) => T): T {
  return useStore(updateStore, selector)
}

export function startUpdateStatus(): void {
  bridge().on('update.status', (s) => updateStore.setState(s, true))
  void bridge()
    .invoke('update.status', {})
    .then((s) => updateStore.setState(s, true))
    .catch(() => undefined)
}

export async function checkForUpdates(): Promise<void> {
  updateStore.setState(await bridge().invoke('update.check', {}), true)
}

export async function downloadUpdate(): Promise<void> {
  updateStore.setState(await bridge().invoke('update.download', {}), true)
}

export async function installUpdate(): Promise<boolean> {
  return (await bridge().invoke('update.install', {})).ok
}
