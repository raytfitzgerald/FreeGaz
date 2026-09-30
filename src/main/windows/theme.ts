// Keeps macOS's appearance for the app (scrollbars, menus, window chrome,
// and the page's prefers-color-scheme) in step with the Appearance setting.
import { nativeTheme, type BrowserWindow } from 'electron'
import type { AppSettings } from '@shared/settings'

// The theme's page backgrounds (styles.css --color-bg), so a window never flashes the wrong colour.
const BACKGROUND = { dark: '#111d36', light: '#ebf1f7' } as const

export function windowBackground(appearance: AppSettings['appearance']): string {
  const dark = appearance === 'system' ? nativeTheme.shouldUseDarkColors : appearance === 'dark'
  return dark ? BACKGROUND.dark : BACKGROUND.light
}

export function applyAppearance(appearance: AppSettings['appearance']): void {
  if (nativeTheme.themeSource !== appearance) nativeTheme.themeSource = appearance
}

/**
 * Keeps the window background in step with the theme. Also puts themeSource
 * back if a click knocked it onto the system appearance: on a Dark Mac that
 * turns a Light window dark.
 */
export function followTheme(win: BrowserWindow, appearance: () => AppSettings['appearance']): () => void {
  const update = () => {
    const choice = appearance()
    applyAppearance(choice)
    if (!win.isDestroyed()) win.setBackgroundColor(windowBackground(choice))
  }
  nativeTheme.on('updated', update)
  return () => nativeTheme.off('updated', update)
}
