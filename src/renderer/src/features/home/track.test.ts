import { describe, expect, it } from 'vitest'
import { lanePoint } from './track'

describe('lanePoint', () => {
  it('goes all the way round the lane and back to the start', () => {
    const a = lanePoint(0, 150)
    const b = lanePoint(1, 150)
    expect(b.x).toBeCloseTo(a.x)
    expect(b.y).toBeCloseTo(a.y)
    expect(a).toEqual({ x: 384, y: 362 })
  })

  it('stays on the lane', () => {
    for (let t = 0; t < 1; t += 0.037) {
      const p = lanePoint(t, 150)
      const dx = p.x < 384 ? p.x - 384 : p.x > 640 ? p.x - 640 : 0
      expect(Math.hypot(dx, p.y - 512)).toBeCloseTo(150, 5)
    }
  })

  it('races anticlockwise: just after the start it is on the left end, not the right', () => {
    expect(lanePoint(0.05, 150).x).toBeLessThan(384)
  })
})
