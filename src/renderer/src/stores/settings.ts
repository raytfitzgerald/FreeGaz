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

/** The quick km/h ↔ mph flip on the ride speed tile. */
export function toggleSpeedUnit(): Promise<AppSettings> {
  return patchSettings({ speedUnit: settingsStore.getState().speedUnit === 'mph' ? 'kmh' : 'mph' })
}

export async function patchSettings(patch: AppSettingsPatch): Promise<AppSettings> {
  const s = await bridge().invoke('settings.patch', patch)
  settingsStore.setState(s, true)
  return s
}
