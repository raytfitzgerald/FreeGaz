// Keeps macOS's appearance for the app (scrollbars, menus, window chrome,
// and the page's prefers-color-scheme) in step with the Appearance setting.
import { nativeTheme, type BrowserWindow } from 'electron'
import type { AppSettings } from '@shared/settings'

const BACKGROUND = { dark: '#090b0f', light: '#f3f4f7' } as const

export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light
}

export function applyAppearance(appearance: AppSettings['appearance']): void {
  if (nativeTheme.themeSource !== appearance) nativeTheme.themeSource = appearance
}

/** Repaints a window's native background when the theme changes (no flash on resize or reload). */
export function followTheme(win: BrowserWindow): () => void {
  const update = () => {
    if (!win.isDestroyed()) win.setBackgroundColor(windowBackground())
  }
  nativeTheme.on('updated', update)
  return () => nativeTheme.off('updated', update)
}
