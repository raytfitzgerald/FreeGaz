import { describe, expect, it } from 'vitest'
import { BIKE_FUND_HOSTS, bikeFundLinks } from './bike-fund'

describe('bike fund links', () => {
  it('hides every service with no handle', () => {
    expect(bikeFundLinks({ venmo: '', buymeacoffee: '', kofi: '' })).toEqual([])
  })

  it('builds each service URL, in order', () => {
    expect(bikeFundLinks({ venmo: '@Ray-F', buymeacoffee: 'rayf', kofi: 'ray_f' })).toEqual([
      { service: 'venmo', label: 'Venmo', url: 'https://venmo.com/u/Ray-F' },
      { service: 'buymeacoffee', label: 'Buy Me a Coffee', url: 'https://buymeacoffee.com/rayf' },
      { service: 'kofi', label: 'Ko-fi', url: 'https://ko-fi.com/ray_f' },
    ])
  })

  it('shows only the services that are set', () => {
    expect(bikeFundLinks({ venmo: '', buymeacoffee: '', kofi: 'rayf' }).map((l) => l.service)).toEqual(['kofi'])
  })

  it('drops handles that could change the URL', () => {
    expect(bikeFundLinks({ venmo: '../evil', buymeacoffee: 'a/b', kofi: 'x?y=1' })).toEqual([])
  })

  it('only links to hosts on the allowlist', () => {
    for (const { url } of bikeFundLinks({ venmo: 'a', buymeacoffee: 'b', kofi: 'c' })) {
      expect(BIKE_FUND_HOSTS).toContain(new URL(url).hostname)
    }
  })
})
