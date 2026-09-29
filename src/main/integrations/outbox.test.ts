import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HttpError } from './http'
import { UploadOutbox, type OutboxItem, type Uploader } from './outbox'

function setup(uploader: Uploader) {
  let now = 1_000_000
  const events: OutboxItem[] = []
  const dir = mkdtempSync(join(tmpdir(), 'freegaz-outbox-'))
  const make = () =>
    new UploadOutbox(join(dir, 'outbox.json'), { strava: uploader, intervals: uploader }, () => Uint8Array.from([1]), (i) => events.push(i), () => now)
  return { make, events, advance: (ms: number) => (now += ms), dir }
}

const entry = { rideId: 'ride-1', provider: 'strava' as const, fitPath: '/tmp/ride.fit', fileName: 'ride.fit', name: 'Ride' }

describe('UploadOutbox', () => {
  it('uploads queued items and records the activity id', async () => {
    const { make } = setup(async () => ({ activityId: '42' }))
    const box = make()
    box.enqueue(entry)
    await box.run()
    expect(box.list()[0]).toMatchObject({ status: 'done', activityId: '42', attempts: 1 })
    box.stop()
  })

  it('backs off on retryable errors, honouring Retry-After, then succeeds', async () => {
    let calls = 0
    const { make, advance } = setup(async () => {
      calls++
      if (calls === 1) throw new HttpError('rate limited', 429, '', 30)
      return { activityId: '7' }
    })
    const box = make()
    box.enqueue(entry)
    await box.run()
    expect(box.list()[0]?.status).toBe('queued')
    await box.run() // not due yet
    expect(calls).toBe(1)
    advance(30_000)
    await box.run()
    expect(box.list()[0]).toMatchObject({ status: 'done', activityId: '7', attempts: 2 })
    box.stop()
  })

  it('fails permanently on a 4xx', async () => {
    const { make } = setup(async () => {
      throw new HttpError('bad file', 400, 'nope')
    })
    const box = make()
    box.enqueue(entry)
    await box.run()
    expect(box.list()[0]?.status).toBe('error')
    box.stop()
  })

  it('persists across restarts and requeues items left mid-upload', async () => {
    const { make } = setup(() => new Promise(() => undefined)) // hangs forever
    const a = make()
    a.enqueue(entry)
    void a.run()
    await new Promise((r) => setTimeout(r, 10))
    a.stop()
    const b = make()
    expect(b.list()[0]).toMatchObject({ rideId: 'ride-1', status: 'queued' })
    b.stop()
  })

  it('does not double-queue the same ride/provider', () => {
    const { make } = setup(() => new Promise(() => undefined))
    const box = make()
    box.enqueue(entry)
    box.enqueue(entry)
    expect(box.list()).toHaveLength(1)
    box.stop()
  })
})
