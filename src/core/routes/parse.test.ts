import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { haversineM } from './geo'
import { RouteImportError, parseGpx, parseRouteFile, parseTcx, toRoutePoints, type RouteImportErrorCode } from './parse'

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const T0 = Date.UTC(2026, 0, 1, 8, 0, 0)

const gpx = (body: string): string => `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`
const trkpt = (lat: number | string, lon: number | string, inner = ''): string => `<trkpt lat="${lat}" lon="${lon}">${inner}</trkpt>`
const track = (...pts: string[]): string => gpx(`<trk><trkseg>${pts.join('')}</trkseg></trk>`)

function importError(fn: () => unknown): RouteImportError {
  try {
    fn()
  } catch (err) {
    if (err instanceof RouteImportError) return err
    throw err
  }
  throw new Error('expected a RouteImportError')
}

function expectCode(fn: () => unknown, code: RouteImportErrorCode): RouteImportError {
  const err = importError(fn)
  expect(err.code).toBe(code)
  expect(err.name).toBe('RouteImportError')
  return err
}

function utf16le(text: string): Uint8Array {
  const bytes = new Uint8Array(2 + text.length * 2)
  bytes[0] = 0xff
  bytes[1] = 0xfe
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    bytes[2 + 2 * i] = c & 0xff
    bytes[3 + 2 * i] = c >> 8
  }
  return bytes
}

describe('parseGpx', () => {
  it('reads a prefixed-namespace GPX 1.1 track across segments', () => {
    const r = parseGpx(fixture('prefixed.gpx'))
    expect(r.format).toBe('gpx')
    expect(r.name).toBe('Synthetic Hill & Dale') // the track name wins over <metadata>
    expect(r.points.map((p) => p.lon)).toEqual([7, 7.00127, 7.00254, 7.00381, 7.00508, 7.00635])
    expect(r.points.every((p) => p.lat === 45)).toBe(true)
  })

  it('turns missing, void (-32768) and decimal-comma elevations into null or numbers', () => {
    const r = parseGpx(fixture('prefixed.gpx'))
    expect(r.points.map((p) => p.ele)).toEqual([100, 101, null, 103, null, 105.5])
  })

  it('merges an exact duplicate point, keeping the first timestamp', () => {
    const r = parseGpx(fixture('prefixed.gpx'))
    expect(r.points.map((p) => (p.t! - T0) / 1000)).toEqual([0, 10, 20, 30, 40, 50])
  })

  it('accumulates haversine distance from 0', () => {
    const { points } = parseGpx(fixture('prefixed.gpx'))
    expect(points[0]!.distM).toBe(0)
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!
      const b = points[i]!
      expect(b.distM - a.distM).toBeCloseTo(haversineM(a.lat, a.lon, b.lat, b.lon), 9)
    }
    expect(points.at(-1)!.distM).toBeCloseTo(499.3, 0)
  })

  it('reads a GPX 1.0 planned route (rte/rtept) without timestamps', () => {
    const r = parseGpx(fixture('route-1.0.gpx'))
    expect(r.name).toBe('Synthetic Planned Route')
    expect(r.points.map((p) => p.ele)).toEqual([200, 205, 210, null])
    expect(r.points.every((p) => p.t === undefined)).toBe(true)
    expect(r.points.at(-1)!.distM).toBeCloseTo(333.58, 1)
  })

  it('falls back to route points only when the track has fewer than two', () => {
    const routePts = '<rtept lat="45" lon="7"/><rtept lat="45.001" lon="7"/><rtept lat="45.002" lon="7"/>'
    const onlyRoute = parseGpx(gpx(`<trk><name>T</name><trkseg>${trkpt(45, 7)}</trkseg></trk><rte><name>R</name>${routePts}</rte>`))
    expect(onlyRoute.points).toHaveLength(3)
    expect(onlyRoute.name).toBe('R')
    const both = parseGpx(gpx(`<trk><name>T</name><trkseg>${trkpt(45, 7)}${trkpt(45.001, 7)}</trkseg></trk><rte>${routePts}</rte>`))
    expect(both.points).toHaveLength(2)
    expect(both.name).toBe('T')
  })

  it('falls back to the metadata name, then the GPX 1.0 top-level name, then none', () => {
    const pts = `<trk><trkseg>${trkpt(45, 7)}${trkpt(45.001, 7)}</trkseg></trk>`
    expect(parseGpx(gpx(`<metadata><name>Meta</name></metadata>${pts}`)).name).toBe('Meta')
    expect(parseGpx(gpx(`<name>Top</name>${pts}`)).name).toBe('Top')
    expect(parseGpx(gpx(pts))).not.toHaveProperty('name')
  })

  it('drops points with invalid coordinates, including (0, 0) null island', () => {
    const r = parseGpx(track(trkpt(0, 0), trkpt(91, 7), trkpt(45, 'abc'), trkpt(45, 7), '<trkpt lon="7.001"/>', trkpt(45.001, 7), trkpt(45, 181)))
    expect(r.points.map((p) => [p.lat, p.lon])).toEqual([
      [45, 7],
      [45.001, 7],
    ])
  })

  it('keeps a track with no elevation at all (all null)', () => {
    const r = parseGpx(track(trkpt(45, 7), trkpt(45.001, 7, '<ele></ele>'), trkpt(45.002, 7, '<ele>n/a</ele>')))
    expect(r.points.map((p) => p.ele)).toEqual([null, null, null])
  })

  it('fills a duplicate’s missing elevation from its twin', () => {
    const r = parseGpx(
      track(trkpt(45, 7, '<time>2026-01-01T08:00:00Z</time>'), trkpt(45, 7, '<ele>12</ele><time>2026-01-01T08:00:05Z</time>'), trkpt(45.001, 7, '<ele>13</ele>')),
    )
    expect(r.points).toHaveLength(2)
    expect(r.points[0]).toMatchObject({ ele: 12, t: T0 })
    expect(r.points[1]).not.toHaveProperty('t')
  })

  it('accepts elevation elements with attributes and surrounding whitespace', () => {
    const r = parseGpx(track(trkpt(' +45.0 ', 7, '<ele units="m">\n 12.5 \n</ele>'), trkpt(45.001, 7, '<ele>13</ele>')))
    expect(r.points.map((p) => [p.lat, p.ele])).toEqual([
      [45, 12.5],
      [45.001, 13],
    ])
  })

  it('reads a truncated file as far as it goes', () => {
    const full = track(trkpt(45, 7, '<ele>1</ele>'), trkpt(45.001, 7, '<ele>2</ele>'), trkpt(45.002, 7, '<ele>3</ele>'), trkpt(45.003, 7, '<ele>4</ele>'))
    const r = parseGpx(full.slice(0, full.lastIndexOf('<ele>4')))
    expect(r.points.length).toBeGreaterThanOrEqual(3)
    expect(r.points.slice(0, 3).map((p) => p.ele)).toEqual([1, 2, 3])
  })

  it('decodes bytes: UTF-8 and UTF-16 with a byte-order mark', () => {
    const text = fixture('prefixed.gpx')
    expect(parseGpx(new TextEncoder().encode(text))).toEqual(parseGpx(text))
    const small = track(trkpt(45, 7, '<ele>5</ele>'), trkpt(45.001, 7, '<ele>6</ele>'))
    expect(parseGpx(utf16le(small)).points.map((p) => p.ele)).toEqual([5, 6])
  })

  it('reports clear errors', () => {
    expect(expectCode(() => parseGpx(''), 'empty').message).toBe('The GPX file is empty.')
    expectCode(() => parseGpx('  \n\t '), 'empty')
    expectCode(() => parseGpx('﻿'), 'empty')
    expectCode(() => parseGpx(new Uint8Array(0)), 'empty')
    expectCode(() => parseGpx('<kml><Document/></kml>'), 'unsupported')
    expectCode(() => parseGpx('just some text'), 'unsupported')
    expectCode(() => parseGpx(gpx('')), 'no-points')
    expectCode(() => parseGpx('<gpx/>'), 'no-points') // an empty root element is still GPX
    expectCode(() => parseGpx('<gpx></gpx>'), 'no-points')
    expectCode(() => parseRouteFile('<TrainingCenterDatabase/>'), 'no-points')
    expectCode(() => parseGpx(track(trkpt(0, 0), trkpt(0, 0))), 'no-points')
    expectCode(() => parseGpx(track(trkpt(45, 7))), 'too-short')
    expectCode(() => parseGpx(track(trkpt(45, 7), trkpt(45, 7), trkpt(45, 7))), 'too-short')
    const deep = `<gpx>${'<x>'.repeat(150)}${'</x>'.repeat(150)}</gpx>`
    expect(expectCode(() => parseGpx(deep), 'malformed').message).toMatch(/could not be read as XML/)
  })
})

describe('parseTcx', () => {
  it('reads an activity: laps in order, default namespace, extensions ignored', () => {
    const r = parseTcx(fixture('activity.tcx'))
    expect(r.format).toBe('tcx')
    expect(r).not.toHaveProperty('name')
    expect(r.points.map((p) => p.ele)).toEqual([300, 305, 307.5, 310])
    expect(r.points.map((p) => (p.t! - T0) / 1000)).toEqual([0, 11, 16, 22])
  })

  it('places a trackpoint that lost GPS by its device distance, keeping its altitude', () => {
    const tunnel = parseTcx(fixture('activity.tcx')).points[2]!
    expect(tunnel.lat).toBeCloseTo(45.0015, 9)
    expect(tunnel.lon).toBeCloseTo(7, 9)
    expect(tunnel.ele).toBe(307.5)
  })

  it('reads a prefixed course with its name, ignoring the summary lap', () => {
    const r = parseTcx(fixture('course.tcx'))
    expect(r.name).toBe('Fixture Course')
    expect(r.points.map((p) => p.ele)).toEqual([50, 53, 56])
    expect(r.points.at(-1)!.distM).toBeCloseTo(haversineM(45, 7, 45, 7.003), 6)
  })

  it('explains that an indoor recording has no course to follow', () => {
    const indoor = `<TrainingCenterDatabase><Activities><Activity><Lap><Track>
      <Trackpoint><Time>2026-01-01T08:00:00Z</Time><DistanceMeters>0</DistanceMeters></Trackpoint>
      <Trackpoint><Time>2026-01-01T08:00:01Z</Time><DistanceMeters>9</DistanceMeters></Trackpoint>
      </Track></Lap></Activity></Activities></TrainingCenterDatabase>`
    expect(expectCode(() => parseTcx(indoor), 'no-points').message).toMatch(/no GPS positions/)
    expectCode(() => parseTcx('<TrainingCenterDatabase><Activities/></TrainingCenterDatabase>'), 'no-points')
    expectCode(() => parseTcx(fixture('prefixed.gpx')), 'unsupported')
    expectCode(() => parseGpx(fixture('course.tcx')), 'unsupported')
  })
})

describe('parseRouteFile', () => {
  it('detects GPX and TCX from the content', () => {
    expect(parseRouteFile(fixture('route-1.0.gpx')).format).toBe('gpx')
    expect(parseRouteFile(fixture('course.tcx')).format).toBe('tcx')
    expect(parseRouteFile(new TextEncoder().encode(fixture('activity.tcx'))).points).toHaveLength(4)
  })

  it('rejects FIT files and anything else with a clear message', () => {
    const fit = new Uint8Array(16)
    fit[0] = 14
    fit.set([0x2e, 0x46, 0x49, 0x54], 8) // ".FIT"
    expect(expectCode(() => parseRouteFile(fit), 'unsupported').message).toMatch(/FIT/)
    expect(expectCode(() => parseRouteFile('<kml/>'), 'unsupported').message).toMatch(/GPX or TCX/)
    expect(expectCode(() => parseRouteFile(''), 'empty').message).toBe('The route file is empty.')
  })
})

describe('toRoutePoints', () => {
  it('validates, de-duplicates and accumulates distance for any importer', () => {
    const pts = toRoutePoints([
      { lat: 45, lon: 7, ele: 10000, t: T0 },
      { lat: 45, lon: 7.0000000001, ele: 5, t: T0 + 1000 },
      { lat: null, lon: 7, ele: 6 },
      { lat: 45.001, lon: 7, ele: -600 },
      { lat: 45.002, lon: 7, ele: 8, t: Number.NaN },
    ])
    expect(pts.map((p) => p.ele)).toEqual([5, null, 8])
    expect(pts[0]!.t).toBe(T0)
    expect(pts[2]).not.toHaveProperty('t')
    expect(pts[2]!.distM).toBeCloseTo(haversineM(45, 7, 45.002, 7), 6)
  })
})
