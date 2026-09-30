import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PACKS } from '@core/persona'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { resetHeadCycles } from '../../coach/toon/motion'
import { createWebShim } from '../../platform/web-shim'
import { settingsStore } from '../../stores/settings'
import { CoachSection } from './CoachSection'

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)))

beforeEach(() => {
  localStorage.clear()
  // the browser shim stands in for main: settings round-trip, AI is not configured
  window.freegaz = createWebShim()
  settingsStore.setState(DEFAULT_SETTINGS, true)
})
afterEach(cleanup)

describe('CoachSection', () => {
  it('lists every persona with its style, and marks the parody', async () => {
    render(<CoachSection />)
    await flush()
    for (const p of PACKS) {
      const card = screen.getByTestId(`persona-${p.meta.id}`)
      expect(card.textContent).toContain(p.meta.name)
      expect(card.textContent).toContain(p.meta.tagline)
    }
    const bibi = screen.getByTestId('persona-bibi')
    expect(within(bibi).getByTestId('parody-badge').textContent).toMatch(/parody/i)
    expect(bibi.textContent).toContain('Parody. Not affiliated with or endorsed by Benjamin Netanyahu.')
    const donald = screen.getByTestId('persona-trump')
    expect(within(donald).getByTestId('parody-badge').textContent).toMatch(/parody/i)
    expect(donald.textContent).toContain('Parody. Not affiliated with or endorsed by Donald J. Trump.')
    // the two parodies, and nobody else
    expect(screen.getAllByTestId('parody-badge')).toHaveLength(2)
  })

  it('shows the disclaimer prominently once Bibi is picked', async () => {
    render(<CoachSection />)
    await flush()
    expect(screen.queryByTestId('parody-disclaimer')).toBeNull()
    fireEvent.click(screen.getByTestId('persona-bibi'))
    await flush()
    expect(settingsStore.getState().coach.personaId).toBe('bibi')
    expect(screen.getByTestId('persona-bibi').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('parody-disclaimer').textContent).toBe('Parody. Not affiliated with or endorsed by Benjamin Netanyahu.')
  })

  it('previews a sample line in the chosen persona', async () => {
    render(<CoachSection />)
    await flush()
    fireEvent.click(screen.getByTestId('coach-preview'))
    expect(screen.getByTestId('coach-sample').textContent).toMatch(/“.+”/)
  })

  it('shows Bibi as a caricature that swaps photos with every sample', async () => {
    resetHeadCycles()
    render(<CoachSection />)
    await flush()
    expect(screen.queryByTestId('coach-toon')).toBeNull() // the drill sergeant is a monogram
    fireEvent.click(screen.getByTestId('persona-bibi'))
    await flush()
    const toon = screen.getByRole('img', { name: /Bibi, parody caricature/ })
    expect(within(toon).getByTestId('parody-badge').textContent).toMatch(/parody/i)
    const heads = [toon.dataset.head]
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByTestId('coach-preview'))
      await flush()
      heads.push(screen.getByTestId('coach-toon').dataset.head)
    }
    expect(heads).toEqual(['0', '1', '2', '0'])
    expect(screen.getByTestId('coach-sample').textContent).toMatch(/“.+”/)
  })

  it('gives The Donald his own caricature, with four photos and a long red tie', async () => {
    resetHeadCycles()
    render(<CoachSection />)
    await flush()
    fireEvent.click(screen.getByTestId('persona-trump'))
    await flush()
    expect(screen.getByTestId('parody-disclaimer').textContent).toBe('Parody. Not affiliated with or endorsed by Donald J. Trump.')
    const toon = screen.getByRole('img', { name: /The Donald, parody caricature/ })
    expect(toon.querySelector('[data-part="tie"]')?.getAttribute('fill')).toBe('#d7263d')
    const heads = [toon.dataset.head]
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByTestId('coach-preview'))
      await flush()
      heads.push(screen.getByTestId('coach-toon').dataset.head)
    }
    expect(heads).toEqual(['0', '1', '2', '3', '0'])
  })

  it('offers spice levels with labels, and hides the AI switch without an AI provider', async () => {
    render(<CoachSection />)
    await flush()
    const spice = screen.getByRole('radiogroup', { name: 'Spice level' })
    expect(within(spice).getAllByRole('radio').map((r) => r.textContent)).toEqual(['1 Gentle', '2 Cheeky', '3 Snarky', '4 Savage', '5 Unhinged'])
    fireEvent.click(within(spice).getByText('5 Unhinged'))
    await flush()
    expect(settingsStore.getState().coach.spice).toBe(5)
    expect(screen.queryByText('Use AI for fresh lines')).toBeNull()
  })
})
