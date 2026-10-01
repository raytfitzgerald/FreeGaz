// Google's encoded polyline format at 1e-5 degrees (about a metre): how the
// journey data stores road geometry compactly.

export function encodePolyline(points: readonly (readonly [number, number])[]): string {
  let out = ''
  let pLat = 0
  let pLon = 0
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63)
      n >>= 5
    }
    out += String.fromCharCode(n + 63)
  }
  for (const [lat, lon] of points) {
    const la = Math.round(lat * 1e5)
    const lo = Math.round(lon * 1e5)
    enc(la - pLat)
    enc(lo - pLon)
    pLat = la
    pLon = lo
  }
  return out
}

export function decodePolyline(s: string): [number, number][] {
  const out: [number, number][] = []
  let i = 0
  let lat = 0
  let lon = 0
  const dec = (): number => {
    let shift = 0
    let result = 0
    let b: number
    do {
      if (i >= s.length) throw new RangeError('truncated polyline')
      b = s.charCodeAt(i++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (i < s.length) {
    lat += dec()
    lon += dec()
    out.push([lat / 1e5, lon / 1e5])
  }
  return out
}
