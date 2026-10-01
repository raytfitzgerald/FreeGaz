// Builds the journey data FreeGaz ships (src/renderer/src/journeys/data):
// road geometry for every leg of every journey in catalogue.mjs, elevation
// along it, and the milestones (towns, summits, borders).
//
//   node scripts/journeys/build.mjs            all journeys
//   node scripts/journeys/build.mjs stelvio    just one (by id)
//
// Sources, called once here and never by the app:
//   - BRouter (brouter.de, "trekking" bike profile) for the roads: OpenStreetMap
//     data, © OpenStreetMap contributors, ODbL.
//   - OpenTopoData's NASA SRTM 30 m dataset for elevation: public domain.
//   - Nominatim (OpenStreetMap) reverse geocoding to find where a border crosses the road.
// Every response is cached under scripts/journeys/.cache (git-ignored), and the
// requests are spaced out to stay well inside each service's usage policy.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DROPS, GRAND } from './catalogue.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE = join(HERE, '.cache')
const OUT = join(HERE, '../../src/renderer/src/journeys/data')
const UA = 'FreeGaz-journey-builder/1.0 (+https://github.com/raytfitzgerald/FreeGaz)'
mkdirSync(CACHE, { recursive: true })
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const lastCall = new Map()

/** GET with a per-host gap, a disk cache and a few retries. */
async function cachedJson(url, { gapMs, host }) {
  const file = join(CACHE, `${createHash('sha1').update(url).digest('hex')}.json`)
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  for (let attempt = 1; ; attempt++) {
    const wait = (lastCall.get(host) ?? 0) + gapMs - Date.now()
    if (wait > 0) await sleep(wait)
    lastCall.set(host, Date.now())
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } })
      const text = await res.text()
      if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`)
      const json = JSON.parse(text)
      writeFileSync(file, text)
      return json
    } catch (e) {
      if (attempt >= 4) throw new Error(`${host}: ${e.message} (${url})`, { cause: e })
      await sleep(5000 * attempt)
    }
  }
}

// ---- geometry ----
const R = 6371008.8
const rad = (d) => (d * Math.PI) / 180
function haversine(a, b) {
  const dLat = rad(b[0] - a[0])
  const dLon = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Douglas–Peucker on a local equirectangular projection; keeps the first and last point. */
function simplify(pts, tolM) {
  if (pts.length < 3) return pts
  const lat0 = rad(pts[0][0])
  const xy = pts.map(([lat, lon]) => [R * rad(lon) * Math.cos(lat0), R * rad(lat)])
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, ay] = xy[a]
    const [bx, by] = xy[b]
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy || 1e-9
    let worst = -1
    let at = -1
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((xy[i][0] - ax) * dx + (xy[i][1] - ay) * dy) / len2))
      const d = Math.hypot(xy[i][0] - (ax + t * dx), xy[i][1] - (ay + t * dy))
      if (d > worst) {
        worst = d
        at = i
      }
    }
    if (worst > tolM) {
      keep[at] = 1
      stack.push([a, at], [at, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

/** Points every `stepM` along a polyline, by cumulative distance. */
function resample(pts, cum, stepM) {
  const out = []
  let j = 0
  for (let d = 0; d <= cum[cum.length - 1]; d += stepM) {
    while (j < cum.length - 2 && cum[j + 1] < d) j++
    const f = cum[j + 1] === cum[j] ? 0 : (d - cum[j]) / (cum[j + 1] - cum[j])
    out.push([pts[j][0] + f * (pts[j + 1][0] - pts[j][0]), pts[j][1] + f * (pts[j + 1][1] - pts[j][1])])
  }
  return out
}

const cumulative = (pts) => {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]))
  return cum
}

/** Google's encoded polyline, 1e-5 degrees (about a metre). */
function encodePolyline(pts) {
  let out = ''
  let pLat = 0
  let pLon = 0
  const enc = (v) => {
    let n = v < 0 ? ~(v << 1) : v << 1
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63)
      n >>= 5
    }
    out += String.fromCharCode(n + 63)
  }
  for (const [lat, lon] of pts) {
    const la = Math.round(lat * 1e5)
    const lo = Math.round(lon * 1e5)
    enc(la - pLat)
    enc(lo - pLon)
    pLat = la
    pLon = lo
  }
  return out
}

// ---- services ----
async function routeLeg(a, b) {
  const url = `https://brouter.de/brouter?lonlats=${a[2]},${a[1]}|${b[2]},${b[1]}&profile=trekking&alternativeidx=0&format=geojson`
  const json = await cachedJson(url, { gapMs: 2500, host: 'brouter' })
  const coords = json.features?.[0]?.geometry?.coordinates
  if (!coords?.length) throw new Error(`no route ${a[0]} → ${b[0]}`)
  return coords.map(([lon, lat]) => [lat, lon])
}

async function elevations(points) {
  const out = []
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100)
    const locs = chunk.map(([lat, lon]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join('|')
    const json = await cachedJson(`https://api.opentopodata.org/v1/srtm30m?locations=${locs}`, { gapMs: 1200, host: 'opentopodata' })
    for (const r of json.results) out.push(r.elevation)
  }
  // SRTM has the odd void (null): carry the neighbour's value across it
  for (let i = 0; i < out.length; i++) if (out[i] === null) out[i] = out[i - 1] ?? out.find((v) => v !== null) ?? 0
  return out
}

async function regionAt([lat, lon], field) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=5&accept-language=en&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`
  const json = await cachedJson(url, { gapMs: 1500, host: 'nominatim' })
  return json.address?.[field] ?? null
}

/** The index of the first point on `pts` that is in `to` rather than `from` (binary search). */
async function borderIndex(pts, field, to) {
  let lo = 0
  let hi = pts.length - 1
  if ((await regionAt(pts[hi], field)) !== to) return null
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if ((await regionAt(pts[mid], field)) === to) hi = mid
    else lo = mid
  }
  return hi
}

// ---- build ----
async function build(def, kind) {
  const via = def.via.map(([name, lat, lon, opts = {}]) => [name, lat, lon, opts])
  const tol = kind === 'grand' ? 12 : 6
  const stepM = kind === 'grand' ? 250 : 50
  let line = []
  const milestones = []
  let region = via[0][3].region ?? null
  for (let i = 1; i < via.length; i++) {
    const raw = await routeLeg(via[i - 1], via[i])
    const nextRegion = via[i][3].region ?? region
    const startM = line.length ? cumulative(line).at(-1) : 0
    // the border, found on the unsimplified leg, then placed by distance
    let borderAt = null
    if (def.borders && nextRegion !== region) {
      const idx = await borderIndex(raw, def.borders, nextRegion)
      if (idx !== null) borderAt = startM + cumulative(raw.slice(0, idx + 1)).at(-1)
      else console.warn(`  ${def.id}: no ${nextRegion} border found between ${via[i - 1][0]} and ${via[i][0]}`)
    }
    const leg = simplify(raw, tol)
    line = line.length ? [...line, ...leg.slice(1)] : leg
    const endM = cumulative(line).at(-1)
    if (borderAt !== null) milestones.push({ m: Math.round(Math.min(borderAt, endM)), name: nextRegion, kind: 'border' })
    region = nextRegion
    const last = i === via.length - 1
    milestones.push({ m: Math.round(endM), name: via[i][0], kind: last ? 'finish' : via[i][3].summit ? 'summit' : 'place' })
    process.stdout.write(`  ${def.id}: ${via[i - 1][0]} → ${via[i][0]} ${(endM / 1000).toFixed(1)} km\n`)
  }
  milestones.sort((a, b) => a.m - b.m)
  const cum = cumulative(line)
  const lengthM = cum.at(-1)
  const ele = await elevations(resample(line, cum, stepM))
  // climbing, on a lightly smoothed profile and ignoring wiggles under 5 m: on steep
  // hillsides the 30 m SRTM grid samples the slope beside the road, not the road
  const win = Math.max(1, Math.round(250 / stepM))
  const smooth = ele.map((_, i) => {
    const a = Math.max(0, i - win)
    const b = Math.min(ele.length - 1, i + win)
    let sum = 0
    for (let k = a; k <= b; k++) sum += ele[k]
    return sum / (b - a + 1)
  })
  let gain = 0
  let low = smooth[0]
  let high = smooth[0]
  for (const e of smooth) {
    if (e > high) high = e
    if (high - e > 5) {
      gain += high - low
      low = high = e
    }
    if (e < low) low = high = e
  }
  gain += high - low
  const data = {
    v: 1,
    id: def.id,
    name: def.name,
    kind,
    blurb: def.blurb,
    start: via[0][0],
    end: via.at(-1)[0],
    lengthM: Math.round(lengthM),
    gainM: Math.round(gain),
    line: encodePolyline(line),
    ele: { stepM, m: ele.map((e) => Math.round(e)) },
    milestones,
  }
  writeFileSync(join(OUT, `${def.id}.json`), JSON.stringify(data))
  return { id: data.id, name: data.name, kind, blurb: data.blurb, start: data.start, end: data.end, lengthM: data.lengthM, gainM: data.gainM }
}

const only = process.argv[2]
const index = existsSync(join(OUT, 'index.json')) ? JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8')) : []
const all = [...DROPS.map((d) => [d, 'drop']), ...GRAND.map((d) => [d, 'grand'])]
const failed = []
for (const [def, kind] of all) {
  if (only && def.id !== only) continue
  console.log(`${def.name}`)
  let entry
  try {
    entry = await build(def, kind)
  } catch (e) {
    console.error(`  FAILED ${def.id}: ${e.message}`)
    failed.push(def.id)
    continue
  }
  const at = index.findIndex((e) => e.id === entry.id)
  if (at >= 0) index[at] = entry
  else index.push(entry)
}
// catalogue order, so the picker lists them the way catalogue.mjs does
const order = all.map(([d]) => d.id)
index.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1))
console.log(`wrote ${index.length} journeys to ${OUT}`)
if (failed.length) {
  console.error(`failed: ${failed.join(', ')}`)
  process.exitCode = 1
}
