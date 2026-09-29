import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { recordsToStreams } from '@core/ride/streams'
import type { RideRecord } from '@core/ride/recorder'
import type { RideSummary } from '@core/ride/types'
import { createBackup, restoreBackup } from './backup'
import { db } from './db'

const rec = (t: number): RideRecord => ({
  t, ts: 1_790_000_000_000 + t * 1000, power: t % 7 === 0 ? null : 200 + t, cadence: 90, hr: 140, speed: 9.2, distance: t * 9.2,
  altitude: null, grade: 1.25, targetW: 210, lrBalance: 49.5, coreTemp: null, skinTemp: null, smo2: null, lap: t > 5 ? 1 : 0, rr: t % 2 ? [801.5] : [],
})

const summary = (id: string): RideSummary =>
  ({
    id, name: 'Ride', kind: 'free', simulated: false, startedAt: 1_790_000_000_000, endedAt: 1_790_000_010_000, elapsedS: 10, movingS: 10,
    distanceM: 92, elevationGainM: null, avgPower: 205, maxPower: 209, np: 206, intensityFactor: 0.82, tss: 1.9, kj: 2.05, vi: 1, wkg: 2.7,
    avgHr: 140, maxHr: 140, avgCadence: 90, maxCadence: 90, avgSpeed: 9.2, maxSpeed: 9.2, ef: 1.47, decouplingPct: null, powerZonesS: [], hrZonesS: [],
    mmp: [{ durationS: 5, watts: 207 }], laps: [], athlete: { ftpW: 250, weightKg: 75 }, createdAt: 1, updatedAt: 1,
  }) as RideSummary

beforeEach(async () => {
  await db().delete()
  await db().open()
})

describe('backup / restore', () => {
  it('round-trips rides, streams, FTP history and profile losslessly', async () => {
    const records = Array.from({ length: 12 }, (_, i) => rec(i))
    await db().rides.put(summary('ride-aaaaaa'))
    await db().rideStreams.put(recordsToStreams('ride-aaaaaa', records))
    await db().ftpHistory.add({ date: 1, ftpW: 250, source: 'manual' })
    await db().profile.add({ from: 1, weightKg: 75, lthr: 168 })

    const zip = await createBackup()
    const before = {
      rides: await db().rides.toArray(),
      streams: await db().rideStreams.toArray(),
      ftp: await db().ftpHistory.toArray(),
      profile: await db().profile.toArray(),
    }

    await db().delete()
    await db().open()
    expect(await db().rides.count()).toBe(0)

    const res = await restoreBackup(zip)
    expect(res).toEqual({ rides: 1, workouts: 0, ftpEntries: 1 })
    expect(await db().rides.toArray()).toEqual(before.rides)
    expect(await db().ftpHistory.toArray()).toEqual(before.ftp)
    expect(await db().profile.toArray()).toEqual(before.profile)
    const s = (await db().rideStreams.get('ride-aaaaaa'))!
    expect(Array.from(s.power)).toEqual(Array.from(before.streams[0]!.power))
    expect(Array.from(s.rr)).toEqual([801.5, 801.5, 801.5, 801.5, 801.5, 801.5])
    expect(Array.from(s.ts)).toEqual(Array.from(before.streams[0]!.ts))
  })

  it('rejects files that are not FreeGaz backups', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    await expect(restoreBackup(zipSync({ 'manifest.json': strToU8('{"format":"other"}') }))).rejects.toThrow(/not a FreeGaz backup/)
  })
})
