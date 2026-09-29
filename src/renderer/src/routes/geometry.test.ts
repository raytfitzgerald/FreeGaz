import { describe, expect, it } from 'vitest'
import { sampleAt } from '@core/routes/lookup'
import { demoRoutes } from '@core/routes/synthetic'
import { courseSamples, elevationRange, fitProjection, gradeRuns, inLap, meanGrade, niceStep, outlineRuns, scaleBar, ticks } from './geometry'
import { GRADE_CLASSES, formatGrade, gradeClass } from './grade'

const demos = demoRoutes()
const six = demos.find((r) => r.id === 'demo-six-percent')!
const loop = demos.find((r) => r.id === 'demo-test-loop')!

describe('grade classes', () => {
  it('bins grades with the flat class taking descents', () => {
    expect([-8, 0, 0.99, 1, 2.9, 3, 4, 5, 6, 7, 9.9, 10, 25].map(gradeClass)).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    expect(gradeClass(Number.NaN)).toBe(0)
    expect(GRADE_CLASSES).toHaveLength(6)
  })

  it('formats with a real minus sign', () => {
    expect(formatGrade(6.24)).toBe('6.2 %')
    expect(formatGrade(-3)).toBe('−3.0 %')
    expect(formatGrade(-0.02)).toBe('0.0 %')
    expect(formatGrade(null)).toBe('—')
  })
})

describe('course samples', () => {
  it('samples elevation and bins the mean grade', () => {
    const s = courseSamples(six.profile, six.distanceM, 0, six.distanceM, 40)
    expect(s.x).toHaveLength(41)
    expect(s.ele[20]).toBeCloseTo(sampleAt(six.profile, 2000).ele, 9)
    expect(s.grade[0]).toBeCloseTo(0, 1)
    expect(s.grade[20]).toBeCloseTo(6, 1)
    // Flat, one solid run for the whole 6 % climb (the grade ramps in within a bin), flat again.
    expect(gradeRuns(s.grade).map((r) => r.cls)).toEqual([0, 3, 0])
    const climb = gradeRuns(s.grade)[1]!
    expect(climb.to - climb.from).toBe(30)
  })

  it('unwraps laps: the second lap starts again at the start line', () => {
    const L = loop.distanceM
    expect(inLap(L, L)).toBe(L)
    expect(inLap(L + 100, L)).toBeCloseTo(100, 9)
    expect(inLap(0, L)).toBe(0)
    const s = courseSamples(loop.profile, L, L - 500, L + 500, 10)
    expect(s.ele[10]).toBeCloseTo(sampleAt(loop.profile, 500).ele, 6)
    expect(s.ele[0]).toBeCloseTo(sampleAt(loop.profile, L - 500).ele, 6)
    // A bin across the line averages both sides.
    expect(meanGrade(loop.profile, L, L - 100, L + 100)).toBeCloseTo(
      (meanGrade(loop.profile, L, L - 100, L) + meanGrade(loop.profile, L, 0, 100)) / 2,
      9,
    )
  })

  it('merges consecutive bins of one class into runs', () => {
    expect(gradeRuns([0, 0.5, 2, 2.5, 7, 0])).toEqual([
      { from: 0, to: 2, cls: 0 },
      { from: 2, to: 4, cls: 1 },
      { from: 4, to: 5, cls: 4 },
      { from: 5, to: 6, cls: 0 },
    ])
  })
})

describe('axes', () => {
  it('pads the elevation range, and keeps a flat road flat', () => {
    expect(elevationRange([100, 200])).toEqual([90, 210])
    expect(elevationRange([100, 100.5], 30)).toEqual([85.25, 115.25])
  })

  it('picks 1-2-5 steps and ticks inside the range', () => {
    expect(niceStep(4000, 5)).toBe(1000)
    expect(niceStep(180, 4)).toBe(50)
    expect(ticks(0, 4000, 5)).toEqual([0, 1000, 2000, 3000, 4000])
    expect(ticks(95, 290, 4)).toEqual([100, 150, 200, 250])
  })
})

describe('outline map', () => {
  it('keeps the route’s shape: a circle stays round, with north up', () => {
    const p = fitProjection(loop.bounds, 400, 200, 10)
    const xs = loop.points.map((q) => p.x(q.lat, q.lon))
    const ys = loop.points.map((q) => p.y(q.lat, q.lon))
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...ys)
    expect(h).toBeCloseTo(180, 0)
    expect(w / h).toBeCloseTo(1, 2)
    // The loop starts on its south side: the start is at the bottom.
    expect(ys[0]).toBeCloseTo(Math.max(...ys), 0)
    // Metres per unit: the circle's diameter is length / pi.
    expect(h * p.metresPerUnit).toBeCloseTo(loop.distanceM / Math.PI, -1)
  })

  it('draws a straight east-west route across the middle', () => {
    const r = demos.find((x) => x.id === 'demo-flat-five')!
    const p = fitProjection(r.bounds, 300, 100, 10)
    expect(p.x(r.points[0]!.lat, r.points[0]!.lon)).toBeCloseTo(10, 6)
    expect(p.x(r.points.at(-1)!.lat, r.points.at(-1)!.lon)).toBeCloseTo(290, 6)
    expect(p.y(r.points[0]!.lat, r.points[0]!.lon)).toBeCloseTo(50, 0)
  })

  it('colours the polylines by grade class', () => {
    const p = fitProjection(six.bounds, 300, 100, 10)
    const runs = outlineRuns(six.profile, p, 100)
    expect(runs.map((r) => r.cls)).toContain(3)
    expect(runs[0]!.cls).toBe(0)
    const vertices = runs.reduce((a, r) => a + r.points.split(' ').length, 0)
    expect(vertices).toBeLessThanOrEqual(110 + runs.length)
  })

  it('picks a round scale bar that fits', () => {
    expect(scaleBar(10, 80)).toEqual({ metres: 500, units: 50, label: '500 m' })
    expect(scaleBar(40, 80)).toEqual({ metres: 2000, units: 50, label: '2 km' })
  })
})
