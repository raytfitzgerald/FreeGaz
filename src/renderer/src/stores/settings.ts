import { createStore, useStore } from 'zustand'
import { DEFAULT_SETTINGS, type AppSettings, type AppSettingsPatch } from '@shared/settings'
import { withAvailableCoach } from '../coach/available'
import { bridge } from '../platform/bridge'

/** Mirror of the main-process settings file. */
export const settingsStore = createStore<AppSettings>(() => DEFAULT_SETTINGS)

export function useSettings<T>(selector: (s: AppSettings) => T): T {
  return useStore(settingsStore, selector)
}

export async function loadSettings(): Promise<AppSettings> {
  const stored = await bridge().invoke('settings.get', {})
  // a coach this build doesn't offer (the iPhone app hides the parodies) is swapped, and saved
  const s = withAvailableCoach(stored)
  settingsStore.setState(s, true)
  if (s !== stored) void bridge().invoke('settings.patch', { coach: { personaId: s.coach.personaId } }).catch(() => undefined)
  bridge().on('settings.changed', (next) => settingsStore.setState(withAvailableCoach(next), true))
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
