import { beforeEach, describe, expect, it } from 'vitest'
import { demoMode } from './demo'

describe('demo mode (web and iPhone apps)', () => {
  beforeEach(() => localStorage.clear())

  it('is off in a release build until the rider turns it on, and then stays on', () => {
    expect(demoMode('', false)).toBe(false)
    localStorage.setItem('freegaz.web.demo', '1')
    expect(demoMode('', false)).toBe(true)
  })

  it('follows ?sim=1 and ?sim=0 over the remembered choice', () => {
    expect(demoMode('?sim=1', false)).toBe(true)
    localStorage.setItem('freegaz.web.demo', '1')
    expect(demoMode('?sim=0', false)).toBe(false)
  })

  it('defaults on in development, unless turned off', () => {
    expect(demoMode('', true)).toBe(true)
    localStorage.setItem('freegaz.web.demo', '0')
    expect(demoMode('', true)).toBe(false)
  })
})
