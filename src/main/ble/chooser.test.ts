import { describe, expect, it, vi } from 'vitest'
import { BluetoothChooser, type ChooserState } from './chooser'

function setup(timeoutMs = 60_000) {
  const pushed: ChooserState[] = []
  const chosen: { chooserId: string; name: string }[] = []
  const chooser = new BluetoothChooser((s) => pushed.push(s), (c) => chosen.push(c), timeoutMs)
  return { chooser, pushed, chosen }
}

describe('BluetoothChooser', () => {
  it('auto-picks the remembered device as soon as the scan sees it', () => {
    const { chooser, pushed, chosen } = setup()
    const cb = vi.fn()
    chooser.prepare({ requestId: 'r1', role: 'trainer', preferredChooserId: 'kickr-1' })
    chooser.onScan([{ deviceId: 'hrm-9', deviceName: 'HRM-Pro' }], cb)
    expect(cb).not.toHaveBeenCalled()
    expect(pushed.at(-1)?.devices).toEqual([{ id: 'hrm-9', name: 'HRM-Pro' }])
    chooser.onScan([{ deviceId: 'kickr-1', deviceName: 'KICKR 1234' }], cb)
    expect(cb).toHaveBeenCalledExactlyOnceWith('kickr-1')
    expect(pushed.at(-1)?.open).toBe(false)
    expect(chosen).toEqual([{ requestId: 'r1', chooserId: 'kickr-1', name: 'KICKR 1234' }])
  })

  it('lets the user choose from the accumulated list', () => {
    const { chooser, pushed } = setup()
    const cb = vi.fn()
    chooser.prepare({ requestId: 'r2', role: 'hr' })
    chooser.onScan([{ deviceId: 'b', deviceName: 'Polar H10' }], cb)
    chooser.onScan([{ deviceId: 'a', deviceName: 'Garmin Forerunner' }], cb)
    expect(pushed.at(-1)?.devices.map((d) => d.name)).toEqual(['Garmin Forerunner', 'Polar H10'])
    expect(chooser.choose('r2', 'a')).toBe(true)
    expect(cb).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('rejects choices for unknown requests or devices, and cancels with empty id', () => {
    const { chooser } = setup()
    const cb = vi.fn()
    chooser.prepare({ requestId: 'r3', role: 'hr' })
    chooser.onScan([{ deviceId: 'a', deviceName: 'A' }], cb)
    expect(chooser.choose('other', 'a')).toBe(false)
    expect(chooser.choose('r3', 'zzz')).toBe(false)
    expect(chooser.choose('r3', null)).toBe(true)
    expect(cb).toHaveBeenCalledExactlyOnceWith('')
    expect(chooser.choose('r3', 'a')).toBe(false)
  })

  it('times out to a cancel so requestDevice never hangs', () => {
    vi.useFakeTimers()
    const { chooser } = setup(1000)
    const cb = vi.fn()
    chooser.prepare({ requestId: 'r4', role: 'hr' })
    chooser.onScan([], cb)
    vi.advanceTimersByTime(1001)
    expect(cb).toHaveBeenCalledExactlyOnceWith('')
    vi.useRealTimers()
  })

  it('a new prepare cancels a dangling request', () => {
    const { chooser } = setup()
    const cb = vi.fn()
    chooser.prepare({ requestId: 'r5', role: 'hr' })
    chooser.onScan([], cb)
    chooser.prepare({ requestId: 'r6', role: 'trainer' })
    expect(cb).toHaveBeenCalledExactlyOnceWith('')
  })
})
