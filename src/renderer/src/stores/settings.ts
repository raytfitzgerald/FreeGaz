import { createStore, useStore } from 'zustand'
import { DEFAULT_SETTINGS, type AppSettings, type AppSettingsPatch } from '@shared/settings'
import { bridge } from '../platform/bridge'

/** Mirror of the main-process settings file. */
export const settingsStore = createStore<AppSettings>(() => DEFAULT_SETTINGS)

export function useSettings<T>(selector: (s: AppSettings) => T): T {
  return useStore(settingsStore, selector)
}

export async function loadSettings(): Promise<AppSettings> {
  const s = await bridge().invoke('settings.get', {})
  settingsStore.setState(s, true)
  bridge().on('settings.changed', (next) => settingsStore.setState(next, true))
  return s
}

let pendingSpeed: AppSettings['speedUnit'] | null = null

/** The quick km/h ↔ mph flip on the ride speed tile. Flips from the last click, so a double click lands back where it started. */
export async function toggleSpeedUnit(): Promise<AppSettings> {
  const speedUnit = (pendingSpeed ?? settingsStore.getState().speedUnit) === 'mph' ? 'kmh' : 'mph'
  pendingSpeed = speedUnit
  try {
    return await patchSettings({ speedUnit })
  } finally {
    if (pendingSpeed === speedUnit) pendingSpeed = null
  }
}

export async function patchSettings(patch: AppSettingsPatch): Promise<AppSettings> {
  const s = await bridge().invoke('settings.patch', patch)
  settingsStore.setState(s, true)
  return s
}
