// GPX 1.0 / 1.1 and TCX v2 → raw route points (see model.ts).
//
// Lenient about structure, strict about values:
//   * Namespace prefixes are stripped and tag names compared case-insensitively,
//     so <gpx:trkpt>, <ns0:Trackpoint> and default namespaces all work.
//   * GPX: every trk/trkseg/trkpt in document order; rte/rtept only when the
//     file has no usable track. TCX: the first Course with a track, otherwise
//     the laps of the first Activity that has positions.
//   * Truncated files are read as far as they go (fast-xml-parser does not
//     insist on a well-formed tail).
//   * A point needs finite, in-range coordinates. (0, 0) is dropped: some
//     devices write it before their first GPS fix ("null island").
//   * Elevation that is missing, empty, non-numeric or outside -500..9000 m
//     (SRTM voids are -32768) becomes null. smooth.ts interpolates it.
//   * Consecutive points less than 1 mm apart are merged, keeping the first
//     timestamp and the first elevation that exists.
//   * Distance is always cumulative haversine, so profile distance matches the
//     positions drawn on the map. TCX DistanceMeters is only used to place
//     trackpoints that lost their GPS position (tunnels), so their barometric
//     altitude is kept.
import { XMLParser } from 'fast-xml-parser'
import { haversineM, lerpLon } from './geo'
import type { RoutePoint } from './model'

export type RouteImportErrorCode = 'empty' | 'malformed' | 'unsupported' | 'no-points' | 'too-short'

/** An import failure. `message` is written for the rider and can be shown as-is. */
export class RouteImportError extends Error {
  constructor(
    readonly code: RouteImportErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'RouteImportError'
  }
}

export type RouteFileFormat = 'gpx' | 'tcx'

export interface ParsedRoute {
  format: RouteFileFormat
  /** Track, route or course name from the file, if it has one. */
  name?: string
  points: RoutePoint[]
}

/** One point as read from a file, before validation. */
export interface RawSample {
  lat: number | null
  lon: number | null
  ele: number | null
  /** Epoch ms. */
  t?: number
}

/** Consecutive points closer than this are duplicates, m. */
const DUPLICATE_M = 0.001
/** Plausible elevation, m: below the Dead Sea shore (-430 m) to above Everest. */
const MIN_ELE_M = -500
const MAX_ELE_M = 9000

/** Tags that may repeat, so they always parse as arrays. */
const LIST_TAGS = new Set(['trk', 'trkseg', 'trkpt', 'rte', 'rtept', 'course', 'activity', 'lap', 'track', 'trackpoint'])

export function parseGpx(input: string | Uint8Array): ParsedRoute {
  const gpx = rootElement(readDocument(input, 'GPX'), 'gpx')
  if (!gpx) throw new RouteImportError('unsupported', 'This is not a GPX file: it has no <gpx> element.')
  return readGpx(gpx)
}

export function parseTcx(input: string | Uint8Array): ParsedRoute {
  const tcx = rootElement(readDocument(input, 'TCX'), 'trainingcenterdatabase')
  if (!tcx) throw new RouteImportError('unsupported', 'This is not a TCX file: it has no <TrainingCenterDatabase> element.')
  return readTcx(tcx)
}

/** Parses GPX or TCX, whichever the content turns out to be. */
export function parseRouteFile(input: string | Uint8Array): ParsedRoute {
  if (typeof input !== 'string' && isFit(input)) {
    throw new RouteImportError('unsupported', 'FIT routes are not supported yet. Export the route as GPX or TCX.')
  }
  const doc = readDocument(input, 'route')
  const gpx = rootElement(doc, 'gpx')
  if (gpx) return readGpx(gpx)
  const tcx = rootElement(doc, 'trainingcenterdatabase')
  if (tcx) return readTcx(tcx)
  throw new RouteImportError('unsupported', 'Unsupported file: expected a GPX or TCX route.')
}

/**
 * Validates samples and turns them into route points: drops invalid
 * coordinates and implausible elevations, merges consecutive duplicates and
 * accumulates haversine distance. Shared by every importer (FIT included).
 */
export function toRoutePoints(samples: Iterable<RawSample>): RoutePoint[] {
  const out: RoutePoint[] = []
  let prev: RoutePoint | undefined
  for (const s of samples) {
    const { lat, lon } = s
    if (lat === null || lon === null || !validCoords(lat, lon)) continue
    const ele = s.ele !== null && s.ele >= MIN_ELE_M && s.ele <= MAX_ELE_M ? s.ele : null
    const t = s.t !== undefined && Number.isFinite(s.t) ? s.t : undefined
    if (prev) {
      const step = haversineM(prev.lat, prev.lon, lat, lon)
      if (step < DUPLICATE_M) {
        if (prev.ele === null) prev.ele = ele
        if (prev.t === undefined && t !== undefined) prev.t = t
        continue
      }
      prev = { lat, lon, ele, distM: prev.distM + step }
    } else {
      prev = { lat, lon, ele, distM: 0 }
    }
    if (t !== undefined) prev.t = t
    out.push(prev)
  }
  return out
}

// ---------------------------------------------------------------------------
// GPX

function readGpx(gpx: XmlNode): ParsedRoute {
  const tracks = nodes(gpx['trk'])
  const routes = nodes(gpx['rte'])
  let points = toRoutePoints(tracks.flatMap((trk) => nodes(trk['trkseg']).flatMap((seg) => nodes(seg['trkpt']).map(gpxSample))))
  let named = tracks
  if (points.length < 2) {
    const fromRoutes = toRoutePoints(routes.flatMap((rte) => nodes(rte['rtept']).map(gpxSample)))
    if (fromRoutes.length > points.length) {
      points = fromRoutes
      named = routes
    }
  }
  requireTrack(points, 'GPX')
  const name = named.map((n) => text(n['name'])).find((s) => s !== undefined) ?? text(child(gpx, 'metadata')?.['name']) ?? text(gpx['name'])
  return withName({ format: 'gpx', points }, name)
}

function gpxSample(pt: XmlNode): RawSample {
  return { lat: num(pt['@_lat']), lon: num(pt['@_lon']), ele: num(pt['ele']), t: time(pt['time']) }
}

// ---------------------------------------------------------------------------
// TCX

interface TcxSample extends RawSample {
  /** The device's own cumulative distance, m. */
  devDistM: number | null
}

function readTcx(tcx: XmlNode): ParsedRoute {
  const candidates = [
    ...nodes(child(tcx, 'courses')?.['course']).map((course) => ({ tracks: nodes(course['track']), name: text(course['name']) })),
    ...nodes(child(tcx, 'activities')?.['activity']).map((activity) => ({
      tracks: nodes(activity['lap']).flatMap((lap) => nodes(lap['track'])),
      name: undefined,
    })),
  ]
  let best: RoutePoint[] = []
  let trackpoints = 0
  for (const { tracks, name } of candidates) {
    const raw = tracks.flatMap((track) => nodes(track['trackpoint']))
    trackpoints += raw.length
    const points = tcxPoints(raw)
    if (points.length >= 2) return withName({ format: 'tcx', points }, name)
    if (points.length > best.length) best = points
  }
  if (best.length === 0 && trackpoints > 0) {
    throw new RouteImportError('no-points', 'The TCX file has no GPS positions (an indoor recording?), so there is no course to follow.')
  }
  requireTrack(best, 'TCX')
  return { format: 'tcx', points: best }
}

function tcxPoints(trackpoints: XmlNode[]): RoutePoint[] {
  const samples = trackpoints.map(tcxSample)
  placeUnpositioned(samples)
  return toRoutePoints(samples)
}

function tcxSample(tp: XmlNode): TcxSample {
  const pos = child(tp, 'position')
  return {
    lat: num(pos?.['latitudedegrees']),
    lon: num(pos?.['longitudedegrees']),
    ele: num(tp['altitudemeters']),
    t: time(tp['time']),
    devDistM: num(tp['distancemeters']),
  }
}

/**
 * Trackpoints that lost their GPS position (tunnels, dense forest) but still
 * have a barometric altitude are placed on the straight line between the
 * positioned points around them, by the device's distance or else by time.
 * Anything that cannot be placed stays unpositioned and is dropped later.
 */
function placeUnpositioned(samples: TcxSample[]): void {
  let last = -1
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!
    if (s.lat === null || s.lon === null || !validCoords(s.lat, s.lon)) continue
    if (last >= 0 && i - last > 1) {
      const a = samples[last]!
      for (let k = last + 1; k < i; k++) {
        const p = samples[k]!
        const f = fraction(a.devDistM, s.devDistM, p.devDistM) ?? fraction(a.t, s.t, p.t)
        if (f === null) continue
        p.lat = a.lat! + (s.lat - a.lat!) * f
        p.lon = lerpLon(a.lon!, s.lon, f)
      }
    }
    last = i
  }
}

function fraction(from: number | null | undefined, to: number | null | undefined, x: number | null | undefined): number | null {
  if (from == null || to == null || x == null || !(to > from)) return null
  const f = (x - from) / (to - from)
  return f >= 0 && f <= 1 ? f : null
}

// ---------------------------------------------------------------------------
// XML plumbing

type XmlNode = { [key: string]: unknown }

function readDocument(input: string | Uint8Array, label: string): XmlNode {
  const xml = decode(input)
  if (xml.trim() === '') throw new RouteImportError('empty', `The ${label} file is empty.`)
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    // Numbers are parsed here, not by the library, so names like "007" survive.
    parseTagValue: false,
    parseAttributeValue: false,
    ignoreDeclaration: true,
    ignorePiTags: true,
    transformTagName: (name) => name.toLowerCase(),
    transformAttributeName: (name) => name.toLowerCase(),
    isArray: (name, _path, _isLeaf, isAttribute) => !isAttribute && LIST_TAGS.has(name),
  })
  let doc: unknown
  try {
    doc = parser.parse(xml)
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    throw new RouteImportError('malformed', `The ${label} file could not be read as XML (${why}).`)
  }
  return isNode(doc) ? doc : {}
}

function decode(input: string | Uint8Array): string {
  if (typeof input === 'string') return input
  const [b0, b1] = input
  if (b0 === 0xff && b1 === 0xfe) return new TextDecoder('utf-16le').decode(input)
  if (b0 === 0xfe && b1 === 0xff) return new TextDecoder('utf-16be').decode(input)
  return new TextDecoder('utf-8').decode(input)
}

/** FIT files carry ".FIT" at bytes 8..11 of their header. */
function isFit(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && bytes[8] === 0x2e && bytes[9] === 0x46 && bytes[10] === 0x49 && bytes[11] === 0x54
}

function isNode(v: unknown): v is XmlNode {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function nodes(v: unknown): XmlNode[] {
  return (Array.isArray(v) ? v : [v]).filter(isNode)
}

function child(n: XmlNode | undefined, key: string): XmlNode | undefined {
  return n ? nodes(n[key])[0] : undefined
}

/** The document's root element, even when it is empty (<gpx/> parses to ''). */
function rootElement(doc: XmlNode, key: string): XmlNode | undefined {
  if (!(key in doc)) return undefined
  return child(doc, key) ?? {}
}

function text(v: unknown): string | undefined {
  if (Array.isArray(v)) return text(v[0])
  if (isNode(v)) return text(v['#text'])
  if (typeof v !== 'string' && typeof v !== 'number') return undefined
  const s = String(v).trim()
  return s === '' ? undefined : s
}

function num(v: unknown): number | null {
  let s = text(v)
  if (s === undefined) return null
  if (/^[+-]?\d+,\d+$/.test(s)) s = s.replace(',', '.') // decimal comma from some locales' exporters
  const x = Number(s)
  return Number.isFinite(x) ? x : null
}

function time(v: unknown): number | undefined {
  const s = text(v)
  if (s === undefined) return undefined
  const ms = Date.parse(s)
  return Number.isFinite(ms) ? ms : undefined
}

function validCoords(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)
}

function requireTrack(points: RoutePoint[], label: string): void {
  if (points.length === 0) throw new RouteImportError('no-points', `The ${label} file has no track or route points with coordinates.`)
  if (points.length < 2) throw new RouteImportError('too-short', `The ${label} track needs at least two distinct points.`)
}

function withName(parsed: ParsedRoute, name: string | undefined): ParsedRoute {
  return name === undefined ? parsed : { ...parsed, name }
}
