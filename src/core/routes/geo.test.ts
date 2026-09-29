import { describe, expect, it } from 'vitest'
import { EARTH_RADIUS_M, destination, haversineM, lerpLon, normalizeLon } from './geo'

const ONE_DEGREE_M = (2 * Math.PI * EARTH_RADIUS_M) / 360 // 111 195.08 m

describe('haversineM', () => {
  it('uses the IUGG mean radius, so 1 degree of latitude is about 111.2 km', () => {
    expect(EARTH_RADIUS_M).toBe(6371008.8)
    expect(haversineM(45, 7, 46, 7) / 1000).toBeCloseTo(111.2, 1)
    expect(haversineM(45, 7, 46, 7)).toBeCloseTo(111195.08, 1)
    expect(haversineM(45, 7, 46, 7)).toBeCloseTo(ONE_DEGREE_M, 6)
  })

  it('is symmetric and zero for identical points', () => {
    expect(haversineM(45, 7, 45.1, 7.2)).toBeCloseTo(haversineM(45.1, 7.2, 45, 7), 9)
    expect(haversineM(45, 7, 45, 7)).toBe(0)
  })

  it('shrinks a degree of longitude by cos(latitude)', () => {
    expect(haversineM(0, 10, 0, 11)).toBeCloseTo(ONE_DEGREE_M, 3)
    expect(haversineM(60, 10, 60, 11) / haversineM(0, 10, 0, 11)).toBeCloseTo(0.5, 3)
  })

  it('takes the short way across the antimeridian', () => {
    expect(haversineM(0, 179.5, 0, -179.5)).toBeCloseTo(ONE_DEGREE_M, 3)
  })
})

describe('destination', () => {
  it('lands the requested great-circle distance away on any bearing', () => {
    for (const bearing of [0, 37, 90, 181, 270]) {
      const p = destination(45, 7, bearing, 12345.6)
      expect(haversineM(45, 7, p.lat, p.lon)).toBeCloseTo(12345.6, 3)
    }
  })

  it('heads north on 0 degrees and east on 90 degrees', () => {
    expect(destination(45, 7, 0, 1000).lat).toBeGreaterThan(45)
    const east = destination(45, 7, 90, 1000)
    expect(east.lon).toBeGreaterThan(7)
    expect(east.lat).toBeCloseTo(45, 4)
  })
})

describe('longitude helpers', () => {
  it('interpolates longitude the short way round', () => {
    expect(lerpLon(10, 20, 0.25)).toBe(12.5)
    expect(lerpLon(179, -179, 0.5)).toBeCloseTo(180, 9)
    expect(lerpLon(179, -179, 0.75)).toBeCloseTo(-179.5, 9)
  })

  it('wraps longitudes into [-180, 180] and leaves in-range values alone', () => {
    expect(normalizeLon(190)).toBe(-170)
    expect(normalizeLon(-190)).toBe(170)
    expect(normalizeLon(180)).toBe(180)
    expect(normalizeLon(-180)).toBe(-180)
    expect(normalizeLon(7.25)).toBe(7.25)
  })
})
