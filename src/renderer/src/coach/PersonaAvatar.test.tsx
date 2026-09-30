import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { packById } from '@core/persona'
import { PersonaAvatar } from './PersonaAvatar'

afterEach(cleanup)

describe('PersonaAvatar', () => {
  it('draws a cartoon face for every built-in coach without a photo caricature', () => {
    for (const id of ['drill-sergeant', 'roast-comic', 'disappointed-dad', 'the-overlord', 'hype-coach', 'data-nerd', 'zen', 'professional']) {
      const { container } = render(<PersonaAvatar persona={packById(id)!.meta} />)
      expect(container.querySelector(`[data-face="${id}"]`)).not.toBeNull()
      cleanup()
    }
  })

  it('falls back to a monogram for a custom persona', () => {
    render(<PersonaAvatar persona={{ id: 'my-coach', name: 'Grumpy Uncle' }} />)
    expect(screen.getByRole('img', { name: 'Grumpy Uncle avatar' }).textContent).toBe('GU')
  })

  it('shows the Bibi photo head, credited', () => {
    const { container } = render(<PersonaAvatar persona={packById('bibi')!.meta} />)
    const avatar = screen.getByRole('img', { name: 'Bibi avatar' })
    expect(avatar.getAttribute('title')).toMatch(/public domain/i)
    const layers = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '')
    expect(layers).toHaveLength(2)
    expect(layers[0]).toMatch(/head\.webp$/)
    expect(layers[1]).toMatch(/jaw\.webp$/)
  })

  it('shows The Donald photo head too', () => {
    const { container } = render(<PersonaAvatar persona={packById('trump')!.meta} />)
    expect(screen.getByRole('img', { name: 'The Donald avatar' }).getAttribute('title')).toMatch(/public domain/i)
    expect([...container.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '')[0]).toMatch(/trump-.*-head\.webp$/)
  })
})
