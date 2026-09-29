import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { finalizeRide } from '@core/ride/finalize'
import type { RideRecord } from '@core/ride/recorder'
import { db } from './db'
import { importFitFiles, rideName } from './fit-import'

const T0 = Date.UTC(2026, 8, 12, 5, 10, 0)
const records: RideRecord[] = Array.from({ length: 1200 }, (_, t) => ({
  t, ts: T0 + (t + 1) * 1000, power: 180 + (t % 40), cadence: 90, hr: 135, speed: 9, distance: t * 9, altitude: null, grade: null,
  targetW: null, lrBalance: null, coreTemp: null, skinTemp: null, smo2: null, lap: 0, rr: [],
}))
const fitBytes = () =>
  finalizeRide({ rideId: 'src', name: 'Tempo', kind: 'free', simulated: false, startedAt: T0, athlete: { ftpW: 250, weightKg: 75 }, records, utcOffsetMin: 0, softwareVersion: 10, now: T0 }).fit!

beforeEach(async () => {
  await db().delete()
  await db().open()
})

describe('importFitFiles', () => {
  it('imports a ride with full metrics, then skips it as a duplicate', async () => {
    const r1 = await importFitFiles([{ name: 'garmin-export.fit', bytes: fitBytes() }])
    expect(r1.skipped).toEqual([])
    expect(r1.imported).toHaveLength(1)
    const ride = (await db().rides.get(r1.imported[0]!.rideId))!
    expect(ride).toMatchObject({ kind: 'free', simulated: false, startedAt: T0, movingS: 1200, imported: { fileName: 'garmin-export.fit' } })
    expect(ride.np).toBeGreaterThan(195)
    expect(ride.fit).toBeUndefined() // nothing re-exported
    expect((await db().rideStreams.get(ride.id))!.length).toBe(1200)

    const r2 = await importFitFiles([{ name: 'copy.fit', bytes: fitBytes() }])
    expect(r2.imported).toEqual([])
    expect(r2.skipped[0]!.reason).toMatch(/Already in your history/)
  })

  it('reports unreadable files instead of throwing', async () => {
    const r = await importFitFiles([{ name: 'junk.fit', bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) }])
    expect(r.skipped).toEqual([{ name: 'junk.fit', reason: 'Not a readable FIT file.' }])
  })

  it('keeps FreeGaz file names and names other rides by time of day', () => {
    expect(rideName('2026-09-29 0712 - Sweet Spot 3x15.fit', true, T0)).toBe('Sweet Spot 3x15')
    expect(rideName('12345_ACTIVITY.fit', false, new Date(2026, 8, 12, 7, 0).getTime())).toBe('Morning ride')
  })
})
