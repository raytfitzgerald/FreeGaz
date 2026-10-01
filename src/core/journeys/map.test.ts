import { describe, expect, it } from 'vitest'
import type { RoutePoint } from '../routes/model'
import { mapFrame, pointsBetween } from './map'

// 10 km due east along the equator, a point every 10 m
const road: RoutePoint[] = Array.from({ length: 1001 }, (_, i) => ({ lat: 0, lon: (i * 10) / 111_320, ele: 0, distM: i * 10 }))

describe('journey mini map', () => {
  it('thins a long stretch but keeps its ends', () => {
    const pts = pointsBetween(road, 0, 10_000, 50)
    expect(pts).toHaveLength(50)
    expect(pts[0]!.distM).toBe(0)
    expect(pts.at(-1)!.distM).toBe(10_000)
  })

  it('fits the stretch into the box, north up and west on the left', () => {
    const f = mapFrame(road, 0, 10_000, 300, 120)
    const [x0, y0] = f.project(0, 0)
    const [x1, y1] = f.project(0, 10_000 / 111_320)
    expect(x0).toBeCloseTo(12, 0)
    expect(x1).toBeCloseTo(288, 0)
    expect(y0).toBeCloseTo(60, 5)
    expect(y1).toBeCloseTo(60, 5)
    const [, yn] = f.project(0.01, 0)
    expect(yn).toBeLessThan(60)
  })

  it('draws only the part asked for', () => {
    const f = mapFrame(road, 0, 10_000, 300, 120)
    const xs = f.path(2_000, 3_000).split(' ').map((p) => Number(p.split(',')[0]))
    expect(Math.min(...xs)).toBeGreaterThan(60)
    expect(Math.max(...xs)).toBeLessThan(110)
  })
})
