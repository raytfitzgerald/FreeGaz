import { describe, expect, it, vi } from 'vitest'
import { FakeClock, SystemClock, WarpClock } from './clock'

describe('FakeClock', () => {
  it('fires interval and one-shot timers in chronological order', () => {
    const clock = new FakeClock()
    const log: string[] = []
    clock.every(250, () => log.push(`tick@${clock.now()}`))
    clock.after(600, () => log.push(`once@${clock.now()}`))
    clock.advance(1000)
    expect(log).toEqual(['tick@250', 'tick@500', 'once@600', 'tick@750', 'tick@1000'])
    expect(clock.now()).toBe(1000)
  })

  it('cancels timers and supports jumps without firing', () => {
    const clock = new FakeClock()
    let n = 0
    const cancel = clock.every(100, () => n++)
    clock.advance(350)
    cancel()
    clock.advance(1000)
    expect(n).toBe(3)
    clock.jump(5000)
    expect(clock.now()).toBe(6350)
  })

  it('maps monotonic time to wall time', () => {
    const clock = new FakeClock(1_000_000)
    clock.advance(1500)
    expect(clock.wallMs()).toBe(1_001_500)
    expect(clock.wallMs(10)).toBe(1_000_010)
  })

  it('timers scheduled from callbacks run within the same advance', () => {
    const clock = new FakeClock()
    const log: number[] = []
    clock.after(100, () => {
      log.push(clock.now())
      clock.after(100, () => log.push(clock.now()))
    })
    clock.advance(500)
    expect(log).toEqual([100, 200])
  })
})

describe('WarpClock', () => {
  it('rejects warp below 1', () => {
    expect(() => new WarpClock(0.5)).toThrow()
  })
  it('runs faster than real time', async () => {
    const clock = new WarpClock(20)
    const start = clock.now()
    await new Promise((r) => setTimeout(r, 50))
    expect(clock.now() - start).toBeGreaterThan(500)
  })
})

describe('SystemClock', () => {
  it('re-anchors wall time after the monotonic clock stopped (the Mac slept)', () => {
    let wall = 1_000_000
    let mono = 500
    vi.spyOn(Date, 'now').mockImplementation(() => wall)
    vi.spyOn(performance, 'now').mockImplementation(() => mono)
    const clock = new SystemClock()
    mono += 1000
    wall += 1000
    expect(clock.wallMs()).toBe(1_001_000)
    // eight hours asleep: wall time moves on, the monotonic clock doesn't
    wall += 8 * 3_600_000
    expect(clock.wallMs()).toBe(wall)
    mono += 1000
    wall += 1000
    expect(clock.wallMs()).toBe(wall)
    vi.restoreAllMocks()
  })
})
