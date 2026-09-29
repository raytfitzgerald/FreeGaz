import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { finalizeRide } from '@core/ride/finalize'
import type { RideRecord } from '@core/ride/recorder'
import { lineTrack, toGpx } from '@core/routes/fixtures/tracks'
import { RouteImportError } from '@core/routes/parse'
import { routeFromFile } from '@core/routes/route'
import { db } from '../db/db'
import { packPoints, unpackPoints } from './route-codec'
import { deleteRoute, importRouteFile, listRoutes, loadGhost, loadRoute, noteRouteRide, routeRides, saveRouteRideGhost } from './routes-repo'

beforeEach(async () => {
  await db().delete()
  await db().open()
})

/** A synthetic 3 km track with a 5 % climb in the middle and timestamps at 30 km/h. */
const TRACK = lineTrack({
  lengthM: 3000,
  spacingM: 15,
  ele: (s) => 200 + 0.05 * Math.min(1000, Math.max(0, s - 1000)),
  speedMps: () => 30 / 3.6,
})
const GPX = toGpx(TRACK, 'Synthetic Hill')

function records(seconds: number, mps: number): RideRecord[] {
  return Array.from({ length: seconds }, (_, t) => ({
    t,
    ts: Date.UTC(2026, 8, 1, 7, 0, t + 1),
    power: 200,
    cadence: 90,
    hr: 140,
    speed: mps,
    distance: mps * (t + 1),
    altitude: 200,
    grade: 0,
    targetW: null,
    lrBalance: null,
    coreTemp: null,
    skinTemp: null,
    smo2: null,
    lap: 0,
    rr: [],
  }))
}

async function saveRide(rideId: string, recs: RideRecord[]) {
  const fin = finalizeRide({
    rideId,
    name: 'Synthetic Hill',
    kind: 'route',
    simulated: true,
    startedAt: recs[0]!.ts - 1000,
    athlete: { ftpW: 250, weightKg: 75 },
    records: recs,
    utcOffsetMin: 0,
    softwareVersion: 10,
    now: Date.now(),
  })
  await db().rides.put(fin.summary)
  await db().rideStreams.put(fin.streams)
}

describe('route codec', () => {
  it('packs points into typed arrays and back without losing anything that matters', () => {
    const points = routeFromFile(GPX).points
    const packed = packPoints(points)
    expect(packed.lat).toBeInstanceOf(Int32Array)
    expect(packed.t).toBeInstanceOf(Float64Array)
    const back = unpackPoints(packed)
    expect(back).toHaveLength(points.length)
    back.forEach((p, i) => {
      const q = points[i]!
      expect(Math.abs(p.lat - q.lat)).toBeLessThanOrEqual(5e-8)
      expect(Math.abs(p.lon - q.lon)).toBeLessThanOrEqual(5e-8)
      expect(p.ele).toBeCloseTo(q.ele!, 4)
      expect(p.distM).toBe(q.distM)
      expect(p.t).toBe(q.t)
    })
  })

  it('keeps missing elevation missing and leaves out times when the file had none', () => {
    const packed = packPoints([
      { lat: 45, lon: 7, ele: null, distM: 0 },
      { lat: 45.001, lon: 7, ele: 12, distM: 111 },
    ])
    expect(packed.t).toBeUndefined()
    expect(unpackPoints(packed)).toEqual([
      { lat: 45, lon: 7, ele: null, distM: 0 },
      { lat: 45.001, lon: 7, ele: 12, distM: 111 },
    ])
  })
})

describe('routes repo', () => {
  it('lists the built-in demo routes before anything is imported', async () => {
    const list = await listRoutes()
    expect(list.map((r) => r.id)).toEqual(['demo-test-loop', 'demo-flat-five', 'demo-six-percent', 'demo-rollers'])
    expect(list.every((r) => r.builtin && r.thumb.ele.length === 64)).toBe(true)
    expect(list.find((r) => r.id === 'demo-test-loop')!.loop).toBe(true)
    expect(await loadRoute('demo-six-percent')).toMatchObject({ name: 'FreeGaz Six Percent' })
  })

  it('imports a GPX file, lists it and rebuilds the same route from storage', async () => {
    const { route, duplicate } = await importRouteFile('hill.gpx', GPX)
    expect(duplicate).toBe(false)
    expect(route.name).toBe('Synthetic Hill')
    const entry = (await listRoutes()).find((r) => r.id === route.id)!
    expect(entry).toMatchObject({ builtin: false, name: 'Synthetic Hill', fileName: 'hill.gpx', hasTimes: true, loop: false })
    expect(entry.elevationGainM).toBeCloseTo(50, 0)
    expect(entry.maxGradePct).toBeCloseTo(5, 0)

    // A fresh load (not the in-memory copy) rebuilds the profile from the packed points.
    const row = (await db().routes.get(route.id))!
    const { buildRoute } = await import('@core/routes/route')
    const rebuilt = buildRoute(unpackPoints(row.points), { id: row.id, name: row.name, source: row.source })
    expect(rebuilt.profile).toHaveLength(route.profile.length)
    rebuilt.profile.forEach((p, i) => {
      const q = route.profile[i]!
      expect(p.distM).toBe(q.distM)
      expect(p.ele).toBeCloseTo(q.ele, 3)
      expect(p.gradePct).toBeCloseTo(q.gradePct, 3)
      expect(p.recordedMps).toBeCloseTo(q.recordedMps!, 6)
    })
    expect(rebuilt.elevationGainM).toBeCloseTo(route.elevationGainM, 3)
  })

  it('recognises a route it already has', async () => {
    const a = await importRouteFile('hill.gpx', GPX)
    const b = await importRouteFile('hill copy.gpx', GPX)
    expect(b.duplicate).toBe(true)
    expect(b.route.id).toBe(a.route.id)
    expect(await db().routes.count()).toBe(1)
  })

  it('refuses a file that is not a route, with a message for the rider', async () => {
    await expect(importRouteFile('notes.gpx', '<gpx version="1.1"></gpx>')).rejects.toBeInstanceOf(RouteImportError)
    await expect(importRouteFile('notes.txt', 'hello')).rejects.toThrow(/GPX or TCX/)
  })

  it('deletes imported routes with their ride index, never built-ins', async () => {
    const { route } = await importRouteFile('hill.gpx', GPX)
    await noteRouteRide({ rideId: 'r1', routeId: route.id, startedAt: 1, mode: 'reactive', laps: 1 })
    await deleteRoute(route.id)
    expect(await loadRoute(route.id)).toBeNull()
    expect(await db().routeRides.count()).toBe(0)
    await expect(deleteRoute('demo-flat-five')).rejects.toThrow(/Built-in/)
  })
})

describe('ghosts', () => {
  it('keeps a finished ride’s distance per second, cut at the finish, and races it later', async () => {
    const recs = records(560, 8) // the 4 km route at 8 m/s takes 500 s; then a minute of cool-down
    await noteRouteRide({ rideId: 'r1', routeId: 'demo-six-percent', startedAt: 1, mode: 'reactive', laps: 1 })
    await saveRouteRideGhost('r1', recs, { finishS: 500, totalM: 4000 })
    await saveRide('r1', recs)
    const [entry] = await routeRides('demo-six-percent')
    expect(entry).toMatchObject({ rideId: 'r1', mode: 'reactive', finishS: 500, movingS: 560, simulated: true })
    const ghost = (await loadGhost('r1'))!
    expect(ghost[0]).toEqual({ tS: 0, distM: 0 })
    expect(ghost).toHaveLength(501)
    expect(ghost.at(-1)).toEqual({ tS: 500, distM: 4000 })
  })

  it('skips rides that were discarded, and sorts the fastest finish first', async () => {
    for (const [id, mps, finishS] of [
      ['slow', 7, 715],
      ['fast', 9, 556],
      ['gone', 12, 417],
    ] as const) {
      await noteRouteRide({ rideId: id, routeId: 'demo-flat-five', startedAt: 1, mode: 'reactive', laps: 1 })
      await saveRouteRideGhost(id, records(750, mps), { finishS, totalM: 5000 })
      if (id !== 'gone') await saveRide(id, records(750, mps))
    }
    await noteRouteRide({ rideId: 'short', routeId: 'demo-flat-five', startedAt: 2, mode: 'steady', laps: 1 })
    await saveRouteRideGhost('short', records(100, 8), { finishS: null, totalM: 5000 })
    await saveRide('short', records(100, 8))
    expect((await routeRides('demo-flat-five')).map((r) => r.rideId)).toEqual(['fast', 'slow', 'short'])
  })

  it('races a crash-recovered ride from its recorded streams', async () => {
    const recs = records(560, 8)
    await noteRouteRide({ rideId: 'rec', routeId: 'demo-six-percent', startedAt: 1, mode: 'reactive', laps: 1 })
    await saveRide('rec', recs) // recovered: saved from the journal, the ghost was never written
    const ghost = (await loadGhost('rec'))!
    expect(ghost.at(-1)).toEqual({ tS: 500, distM: 4000 })
    expect(await loadGhost('nobody')).toBeNull()
  })
})
