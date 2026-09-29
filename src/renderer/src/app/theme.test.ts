import { describe, expect, it } from 'vitest'
import { settingsStore } from '../stores/settings'
import { resolveTheme, startTheme, themeStore } from './theme'

describe('theme', () => {
  it('resolves system to the OS preference, and honours an explicit choice', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('writes data-theme and follows settings changes', () => {
    const root = document.createElement('html')
    settingsStore.setState({ ...settingsStore.getState(), appearance: 'light' })
    const stop = startTheme(root)
    expect(root.dataset.theme).toBe('light')
    expect(themeStore.getState().theme).toBe('light')
    settingsStore.setState({ ...settingsStore.getState(), appearance: 'dark' })
    expect(root.dataset.theme).toBe('dark')
    expect(themeStore.getState().theme).toBe('dark')
    stop()
    settingsStore.setState({ ...settingsStore.getState(), appearance: 'light' })
    expect(root.dataset.theme).toBe('dark') // stopped: no longer following
  })
})
