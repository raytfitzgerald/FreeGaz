import { describe, expect, it } from 'vitest'
import { FanController, fanTarget, type FanPrefsLike } from './fan-controller'

const prefs: FanPrefsLike = { mode: 'hr', fixedPct: 60, hrStart: 110, hrFull: 170, speedFullKmh: 40, powerFull: 1.2 }
const input = (over: Partial<Parameters<typeof fanTarget>[1]> = {}) => ({ now: 0, hr: 140, speedKmh: 30, power3s: 250, ftpW: 250, ...over })

describe('fanTarget', () => {
  it('maps HR, speed and power onto 0–100 % in 5 % steps', () => {
    expect(fanTarget(prefs, input())).toBe(50)
    expect(fanTarget(prefs, input({ hr: 100 }))).toBe(0)
    expect(fanTarget(prefs, input({ hr: 185 }))).toBe(100)
    expect(fanTarget({ ...prefs, mode: 'speed' }, input())).toBe(70) // (30-5)/(40-5) = 71 %
    expect(fanTarget({ ...prefs, mode: 'power' }, input())).toBe(75) // (1.0-0.4)/(1.2-0.4)
    expect(fanTarget({ ...prefs, mode: 'fixed' }, input())).toBe(60)
    expect(fanTarget({ ...prefs, mode: 'off' }, input())).toBe(0)
  })

  it('leaves the fan alone when the input it follows is missing', () => {
    expect(fanTarget(prefs, input({ hr: null }))).toBeNull()
    expect(fanTarget({ ...prefs, mode: 'power' }, input({ power3s: null }))).toBeNull()
  })
})

describe('FanController', () => {
  it('rises right away, waits 20 s before dropping, and never floods the fan', () => {
    const c = new FanController()
    expect(c.update(prefs, input({ now: 0, hr: 140 }))).toBe(50)
    expect(c.update(prefs, input({ now: 1000, hr: 170 }))).toBeNull() // < 3 s since the last command
    expect(c.update(prefs, input({ now: 3000, hr: 170 }))).toBe(100)
    expect(c.update(prefs, input({ now: 10_000, hr: 125 }))).toBeNull() // recovery: hold the air a while
    expect(c.update(prefs, input({ now: 25_000, hr: 125 }))).toBeNull()
    expect(c.update(prefs, input({ now: 31_000, hr: 125 }))).toBe(25)
    expect(c.update(prefs, input({ now: 40_000, hr: 125 }))).toBeNull() // unchanged: nothing to send
  })
})
