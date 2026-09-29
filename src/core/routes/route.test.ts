import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lineTrack, toGpx } from './fixtures/tracks'
import { RouteImportError } from './parse'
import { buildRoute, routeFromFile, routeId } from './route'
import { summarize } from './smooth'

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const climbEle = (s: number): number => (s < 1000 ? 100 : s < 4000 ? 100 + 0.06 * (s - 1000) : 280)

describe('buildRoute', () => {
  it('assembles profile, summary, bounds and flags', () => {
    const points = lineTrack({ lengthM: 5000, spacingM: 10, ele: climbEle })
    const route = buildRoute(points, { name: 'Climb', source: 'gpx' })
    const summary = summarize(route.profile)
    expect(route).toMatchObject({
      name: 'Climb',
      source: 'gpx',
      distanceM: 5000,
      elevationGainM: summary.elevationGainM,
      elevationLossM: summary.elevationLossM,
      maxGradePct: summary.maxGradePct,
      minGradePct: summary.minGradePct,
      hasTimes: false,
    })
    expect(route.points).toEqual(points)
    expect(route.bounds.minEle).toBe(summary.minEle)
    expect(route.bounds.maxEle).toBe(summary.maxEle)
    for (const p of points) {
      expect(p.lat).toBeGreaterThanOrEqual(route.bounds.minLat)
      expect(p.lat).toBeLessThanOrEqual(route.bounds.maxLat)
      expect(p.lon).toBeGreaterThanOrEqual(route.bounds.minLon)
      expect(p.lon).toBeLessThanOrEqual(route.bounds.maxLon)
    }
  })

  it('copies the points, so later edits to the input do not leak in', () => {
    const points = lineTrack({ lengthM: 100, spacingM: 10, ele: () => 5 })
    const route = buildRoute(points, { name: 'Copy', source: 'synthetic' })
    points[0]!.ele = 999
    expect(route.points[0]!.ele).toBe(5)
  })
})

describe('routeId', () => {
  const points = lineTrack({ lengthM: 1000, spacingM: 10, ele: (s) => 100 + s / 100 })

  it('is stable for the same geometry and prefixed by the source', () => {
    expect(routeId('gpx', points)).toBe(routeId('gpx', points.map((p) => ({ ...p }))))
    expect(routeId('gpx', points)).toMatch(/^gpx-[0-9a-f]{16}$/)
    expect(routeId('tcx', points).slice(4)).toBe(routeId('gpx', points).slice(4))
    expect(buildRoute(points, { name: 'x', source: 'gpx' }).id).toBe(routeId('gpx', points))
    expect(buildRoute(points, { id: 'given', name: 'x', source: 'gpx' }).id).toBe('given')
  })

  it('changes when a point moves or an elevation changes', () => {
    const base = routeId('gpx', points)
    const moved = points.map((p, i) => (i === 50 ? { ...p, lat: p.lat + 1e-5 } : p))
    const raised = points.map((p, i) => (i === 50 ? { ...p, ele: p.ele! + 0.5 } : p))
    const missing = points.map((p, i) => (i === 50 ? { ...p, ele: null } : p))
    const ids = new Set([base, routeId('gpx', moved), routeId('gpx', raised), routeId('gpx', missing), routeId('gpx', points.slice(1))])
    expect(ids.size).toBe(5)
  })
})

describe('routeFromFile', () => {
  it('imports a GPX file with its own name and timestamps', () => {
    const route = routeFromFile(fixture('prefixed.gpx'), { fileName: 'prefixed.gpx' })
    expect(route).toMatchObject({ name: 'Synthetic Hill & Dale', source: 'gpx', hasTimes: true })
    expect(route.points).toHaveLength(6)
    expect(route.profile.every((p) => p.recordedMps !== undefined)).toBe(true)
  })

  it('imports TCX courses and activities', () => {
    expect(routeFromFile(fixture('course.tcx'))).toMatchObject({ name: 'Fixture Course', source: 'tcx' })
    expect(routeFromFile(fixture('activity.tcx'), { fileName: 'Morning Tunnel Test.tcx' })).toMatchObject({
      name: 'Morning Tunnel Test',
      source: 'tcx',
      hasTimes: true,
    })
  })

  it('names the route from the override, the file, the file name, or a default', () => {
    const noName = toGpx(lineTrack({ lengthM: 100, spacingM: 10, ele: () => 1 })).replace('<name>Synthetic track</name>', '')
    expect(routeFromFile(fixture('route-1.0.gpx'), { name: 'Mine' }).name).toBe('Mine')
    expect(routeFromFile(noName, { fileName: 'rides/Evening Loop.gpx' }).name).toBe('Evening Loop')
    expect(routeFromFile(noName, { fileName: 'C:\\routes\\Col.v2.gpx' }).name).toBe('Col.v2')
    expect(routeFromFile(noName).name).toBe('Imported route')
    expect(routeFromFile(noName, { id: 'abc' }).id).toBe('abc')
  })

  it('round-trips a generated track through GPX text', () => {
    const route = routeFromFile(toGpx(lineTrack({ lengthM: 5000, spacingM: 10, ele: climbEle })))
    expect(route.distanceM).toBeCloseTo(5000, 0)
    expect(route.elevationGainM).toBeCloseTo(180, 0)
    expect(route.maxGradePct).toBeLessThan(6.5)
  })

  it('passes import errors through for the UI', () => {
    expect(() => routeFromFile('')).toThrow(RouteImportError)
    expect(() => routeFromFile('<gpx/>')).toThrow(/no track or route points/)
  })
})
