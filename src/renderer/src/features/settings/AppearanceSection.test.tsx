import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { createWebShim } from '../../platform/web-shim'
import { settingsStore } from '../../stores/settings'
import { AppearanceSection } from './AppearanceSection'

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)))
const pick = async (group: string, option: string) => {
  fireEvent.click(within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name: option }))
  await flush()
}

beforeEach(() => {
  localStorage.clear()
  window.freegaz = createWebShim()
  settingsStore.setState(DEFAULT_SETTINGS, true)
})
afterEach(cleanup)

describe('AppearanceSection units', () => {
  it('Units presets speed and weight, which can then be set on their own', async () => {
    render(<AppearanceSection />)
    await pick('Units', 'Imperial')
    expect(settingsStore.getState()).toMatchObject({ units: 'imperial', speedUnit: 'mph', weightUnit: 'lb' })

    await pick('Weight units', 'kg')
    expect(settingsStore.getState()).toMatchObject({ units: 'imperial', speedUnit: 'mph', weightUnit: 'kg' })

    await pick('Speed units', 'km/h')
    expect(settingsStore.getState()).toMatchObject({ units: 'imperial', speedUnit: 'kmh', weightUnit: 'kg' })

    await pick('Units', 'Metric')
    expect(settingsStore.getState()).toMatchObject({ units: 'metric', speedUnit: 'kmh', weightUnit: 'kg' })
  })
})
