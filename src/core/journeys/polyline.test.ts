import { describe, expect, it } from 'vitest'
import { decodePolyline, encodePolyline } from './polyline'

describe('encoded polylines', () => {
  it('matches the reference example', () => {
    // from Google's format documentation
    expect(encodePolyline([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]])).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]])
  })

  it('round-trips both hemispheres to the metre', () => {
    const pts: [number, number][] = [[-33.8568, 151.2153], [48.8584, 2.2945], [37.8199, -122.4783], [0, 0]]
    decodePolyline(encodePolyline(pts)).forEach(([lat, lon], i) => {
      expect(lat).toBeCloseTo(pts[i]![0], 5)
      expect(lon).toBeCloseTo(pts[i]![1], 5)
    })
  })

  it('rejects a cut-off string', () => {
    expect(() => decodePolyline('_p~iF~ps|U_')).toThrow()
  })
})
