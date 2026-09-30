import { Profiler } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { liveStore } from '../stores/live'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { createWebShim } from '../platform/web-shim'
import { rideStore } from '../stores/ride'
import { settingsStore } from '../stores/settings'
import { WIDGET_BY_ID } from './catalog'
import { HudTile } from './HudGrid'

const athlete = { ftpW: 250, weightKg: 75 }

describe('HUD tiles', () => {
  it('re-render only when their own value changes, not on every 4 Hz frame', () => {
    let renders = 0
    render(
      <Profiler id="hr" onRender={() => renders++}>
        <HudTile def={WIDGET_BY_ID.get('hr')!} athlete={athlete} />
      </Profiler>,
    )
    const base = renders
    // 40 frames (10 s at 4 Hz) where only power and cadence move.
    act(() => {
      for (let i = 0; i < 40; i++) liveStore.setState({ ...liveStore.getState(), t: i * 250, power: 200 + i, power3s: 200 + i, cadence: 85 + (i % 5), hr: 140 })
    })
    const afterHrSet = renders
    act(() => {
      for (let i = 0; i < 40; i++) liveStore.setState({ ...liveStore.getState(), t: 10_000 + i * 250, power: 250 - i, hr: 140 })
      rideStore.setState({ saving: false })
    })
    expect(renders).toBe(afterHrSet) // nothing it shows changed
    expect(afterHrSet - base).toBe(1) // one render for 140 bpm arriving
    act(() => liveStore.setState({ ...liveStore.getState(), hr: 152 }))
    expect(renders).toBe(afterHrSet + 1)
    expect(screen.getByTestId('hud-hr-value').textContent).toBe('152')
  })

  it('show missing values as an em dash, never 0', () => {
    act(() => liveStore.setState({ ...liveStore.getState(), cadence: null }))
    render(<HudTile def={WIDGET_BY_ID.get('cadence')!} athlete={athlete} />)
    expect(screen.getByTestId('hud-cadence-value').textContent).toBe('—')
  })

  it('derive W/kg and % FTP from the athlete snapshot', () => {
    act(() => liveStore.setState({ ...liveStore.getState(), power3s: 300 }))
    render(
      <>
        <HudTile def={WIDGET_BY_ID.get('wkg')!} athlete={athlete} />
        <HudTile def={WIDGET_BY_ID.get('pctFtp')!} athlete={athlete} />
      </>,
    )
    expect(screen.getByTestId('hud-wkg-value').textContent).toBe('4.00')
    expect(screen.getByTestId('hud-pctFtp-value').textContent).toBe('120')
  })

  it('flip speed between km/h and mph from the unit label', async () => {
    localStorage.clear()
    window.freegaz = createWebShim()
    settingsStore.setState({ ...DEFAULT_SETTINGS, units: 'metric', speedUnit: 'kmh' }, true)
    act(() => liveStore.setState({ ...liveStore.getState(), speedKmh: 32.4 }))
    render(<HudTile def={WIDGET_BY_ID.get('speed')!} athlete={athlete} />)
    expect(screen.getByTestId('hud-speed-value').textContent).toBe('32.4')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Switch speed units' }))
      await new Promise<void>((r) => setTimeout(r, 0))
    })
    expect(settingsStore.getState().speedUnit).toBe('mph')
    expect(settingsStore.getState().units).toBe('metric') // distance stays put
    expect(screen.getByTestId('hud-speed-unit').textContent).toBe('mph')
    expect(screen.getByTestId('hud-speed-value').textContent).toBe('20.1')
  })
})
