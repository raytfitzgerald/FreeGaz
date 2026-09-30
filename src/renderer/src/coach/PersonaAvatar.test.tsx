import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { packById } from '@core/persona'
import { PersonaAvatar } from './PersonaAvatar'

afterEach(cleanup)

describe('PersonaAvatar', () => {
  it('draws a monogram for personas without a caricature', () => {
    render(<PersonaAvatar persona={packById('drill-sergeant')!.meta} />)
    const avatar = screen.getByRole('img', { name: 'Drill Sergeant avatar' })
    expect(avatar.textContent).toBe('DS')
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
