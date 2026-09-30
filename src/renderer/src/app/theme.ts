// Light / dark theme for the main window. The choice lives in settings
// ('system' follows macOS); the resolved theme is written to
// <html data-theme>, which the CSS tokens key off, before the first paint.
import { createStore, useStore } from 'zustand'
import type { AppSettings } from '@shared/settings'
import { settingsStore } from '../stores/settings'

export type Appearance = AppSettings['appearance']
export type Theme = 'light' | 'dark'

export function resolveTheme(appearance: Appearance, systemDark: boolean): Theme {
  return appearance === 'system' ? (systemDark ? 'dark' : 'light') : appearance
}

export const themeStore = createStore<{ theme: Theme }>(() => ({ theme: 'dark' }))

/** The resolved theme, for canvas charts that bake colours in and must rebuild when it flips. */
export function useTheme(): Theme {
  return useStore(themeStore, (s) => s.theme)
}

/** Applies the theme now and keeps it in step with settings and macOS. */
export function startTheme(root: HTMLElement = document.documentElement): () => void {
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
  const apply = () => {
    const theme = resolveTheme(settingsStore.getState().appearance, media?.matches ?? true)
    root.dataset.theme = theme
    // Inline, so it beats the stylesheet and a click that restyles the
    // document from the Mac's appearance. `only` refuses that override.
    // The CSSOM may serialize "only light" as "light only".
    const scheme = root.style.colorScheme
    const locked = theme === 'light' ? scheme.includes('light') && !scheme.includes('dark') : scheme.includes('dark') && !scheme.includes('light')
    if (!locked) root.style.colorScheme = theme === 'light' ? 'only light' : 'only dark'
    if (themeStore.getState().theme !== theme) themeStore.setState({ theme })
  }
  apply()
  const offSettings = settingsStore.subscribe((next, prev) => {
    if (next.appearance !== prev.appearance) apply()
  })
  media?.addEventListener('change', apply)
  // A press can flip prefers-color-scheme for one frame. Re-assert after it.
  root.addEventListener('pointerup', apply)
  return () => {
    offSettings()
    media?.removeEventListener('change', apply)
    root.removeEventListener('pointerup', apply)
  }
}
