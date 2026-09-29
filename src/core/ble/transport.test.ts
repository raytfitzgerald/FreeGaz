import { describe, expect, it } from 'vitest'
import { BleError, GattQueue, dataView, fromHex, toHex } from './transport'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('GattQueue', () => {
  it('never runs two operations at once, preserving order', async () => {
    const q = new GattQueue()
    let active = 0
    let maxActive = 0
    const order: number[] = []
    const op = (i: number, ms: number) =>
      q.run(`op${i}`, async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await delay(ms)
        order.push(i)
        active--
        return i
      })
    const results = await Promise.all([op(1, 15), op(2, 1), op(3, 5)])
    expect(results).toEqual([1, 2, 3])
    expect(order).toEqual([1, 2, 3])
    expect(maxActive).toBe(1)
  })

  it('times out a hung operation and keeps serving later ones', async () => {
    const q = new GattQueue(20)
    const hung = q.run('hung', () => new Promise(() => undefined))
    const next = q.run('next', async () => 'ok')
    await expect(hung).rejects.toBeInstanceOf(BleError)
    await expect(next).resolves.toBe('ok')
  })

  it('a failing operation does not poison the queue', async () => {
    const q = new GattQueue()
    const bad = q.run('bad', async () => {
      throw new Error('boom')
    })
    await expect(bad).rejects.toThrow('boom')
    await expect(q.run('good', async () => 42)).resolves.toBe(42)
    expect(q.depth).toBe(0)
  })
})

describe('hex helpers', () => {
  it('round-trips bytes', () => {
    const bytes = fromHex('44 00 18 01 5a 00 c8 00')
    expect(toHex(bytes)).toBe('44 00 18 01 5a 00 c8 00')
    expect(dataView(bytes).getUint16(0, true)).toBe(0x0044)
  })
})
