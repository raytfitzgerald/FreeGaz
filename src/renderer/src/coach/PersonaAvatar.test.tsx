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
    expect(screen.queryByTestId('parody-badge')).toBeNull()
  })

  it('shows the Bibi photo head, credited, with the PARODY badge', () => {
    const { container } = render(<PersonaAvatar persona={packById('bibi')!.meta} />)
    const avatar = screen.getByRole('img', { name: 'Bibi avatar, parody' })
    expect(avatar.getAttribute('title')).toMatch(/public domain/i)
    const layers = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '')
    expect(layers).toHaveLength(2)
    expect(layers[0]).toMatch(/head\.webp$/)
    expect(layers[1]).toMatch(/jaw\.webp$/)
    expect(screen.getByTestId('parody-badge').textContent).toMatch(/parody/i)
  })
})
