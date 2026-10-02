import { describe, expect, it } from 'vitest'
import { DEFAULT_BIKE, steadySpeedForPower } from '../physics/bike'
import { IDLE_TICK, type PlanInput, type PlanTick } from '../ride/plan'
import { courseFromData, type JourneyData } from './course'
import { encodePolyline } from './polyline'
import { JourneyLayer, foldPosition, type JourneyLayerOptions } from './layer'

/** 20 km due north from the Eiffel Tower: flat for 10 km, then a steady 5 % climb. */
function data(): JourneyData {
  const pts: [number, number][] = []
  for (let m = 0; m <= 20_000; m += 500) pts.push([48.8584 + m / 111_195, 2.2945])
  const ele: number[] = []
  for (let m = 0; m <= 20_000; m += 50) ele.push(m <= 10_000 ? 35 : 35 + (m - 10_000) * 0.05)
  return {
    v: 1, id: 'test', name: 'Test Road', kind: 'drop', blurb: '', start: 'Eiffel Tower', end: 'Hilltop', lengthM: 20_000, gainM: 500,
    line: encodePolyline(pts), ele: { stepM: 50, m: ele },
    milestones: [{ m: 5_000, name: 'Village', kind: 'place' }, { m: 20_000, name: 'Hilltop', kind: 'finish' }],
  }
}
const course = courseFromData(data())
const plan = (over: Partial<JourneyLayerOptions> = {}) => new JourneyLayer({ course, journeyId: null, startM: 0, terrain: 'real', rider: {}, gps: true, ...over })
const input = (movingS: number, power: number | null): PlanInput => ({ now: movingS * 1000, movingS, dtS: 0.25, power, cadence: 90, hr: 140 })
function ride(p: JourneyLayer, fromS: number, toS: number, power: number | null, base: PlanTick = IDLE_TICK) {
  const ticks = [p.tick(input(fromS, power), base)]
  for (let k = Math.round(fromS * 4) + 1; k <= Math.round(toS * 4); k++) ticks.push(p.tick(input(k / 4, power), base))
  return ticks
}

describe('JourneyLayer', () => {
  it('builds the course from the shipped format', () => {
    expect(course.lengthM).toBeGreaterThan(19_900)
    expect(course.lengthM).toBeLessThan(20_100)
    expect(course.milestones.map((m) => m.name)).toEqual(['Village', 'Halfway', 'Hilltop'])
  })

  it('moves at the physics speed for the power on the flat, and writes it as the ride speed and GPS', () => {
    const p = plan()
    const last = ride(p, 0, 300, 200).at(-1)!
    const v = steadySpeedForPower(200, 0, DEFAULT_BIKE)
    expect(last.journey!.speedMps).toBeCloseTo(v, 1)
    expect(last.speed).toBeCloseTo(v, 1)
    expect(last.journey!.rideM).toBeGreaterThan(v * 280)
    expect(last.lat).toBeGreaterThan(48.8584)
    expect(last.lon).toBeCloseTo(2.2945, 4)
  })

  it('is slower up the climb on real terrain, and not on flat terrain', () => {
    const real = ride(plan({ startM: 12_000 }), 0, 120, 200).at(-1)!
    const flat = ride(plan({ startM: 12_000, terrain: 'flat' }), 0, 120, 200).at(-1)!
    expect(real.journey!.gradePct).toBeGreaterThan(3)
    expect(flat.journey!.gradePct).toBe(0)
    expect(real.journey!.speedMps).toBeLessThan(flat.journey!.speedMps * 0.6)
  })

  it('freewheels without power: rolls to a stop on the flat', () => {
    const p = plan()
    ride(p, 0, 120, 250)
    const coasted = ride(p, 120, 600, null).at(-1)!
    expect(coasted.journey!.speedMps).toBeLessThan(0.5)
    expect(coasted.journey!.rideM).toBeGreaterThan(0)
  })

  it('starting from a stop with no power, the flat goes nowhere and a descent rolls, like the road', () => {
    expect(ride(plan(), 0, 120, null).at(-1)!.journey!.rideM).toBe(0)
    // past the end the dot rides back down the 5 % climb
    const downhill = ride(plan({ startM: 20_500 }), 0, 60, null).at(-1)!
    expect(downhill.journey!.gradePct).toBeLessThan(-3)
    expect(downhill.journey!.speedMps).toBeGreaterThan(5)
    expect(downhill.speed).toBeCloseTo(downhill.journey!.speedMps, 5)
  })

  it('stands still and shows 0 while the ride is paused, even on a descent', () => {
    const p = plan({ startM: 20_500 })
    ride(p, 0, 60, 200)
    // moving time stops at 60 s while the wall clock runs on
    let t = p.tick({ now: 61_000, movingS: 60, dtS: 0.25, power: 200, cadence: 90, hr: 140 }, IDLE_TICK)
    expect(t.speed).toBeGreaterThan(5)
    const before = t.journey!.rideM
    p.tick({ now: 63_000, movingS: 60, dtS: 0.25, power: 0, cadence: 0, hr: 140 }, IDLE_TICK)
    t = p.tick({ now: 70_000, movingS: 60, dtS: 0.25, power: null, cadence: null, hr: 140 }, IDLE_TICK)
    expect(t.speed).toBe(0)
    expect(t.journey!.speedMps).toBe(0)
    expect(t.journey!.rideM).toBe(before)
  })

  it('leaves out GPS when the rider turned the track off', () => {
    const last = ride(plan({ gps: false }), 0, 30, 200).at(-1)!
    expect(last.lat).toBeUndefined()
    expect(last.journey!.lat).toBeTypeOf('number')
  })

  it('fires each milestone once, says it, and knows what is next', () => {
    const ticks = ride(plan({ startM: 4_900 }), 0, 60, 250)
    const fired = ticks.filter((t) => t.milestone)
    expect(fired.map((t) => t.milestone!.name)).toEqual(['Village'])
    expect(fired[0]!.cue).toMatch(/^Village · 5 km in/)
    expect(ticks.at(-1)!.journey!.next).toMatchObject({ name: 'Halfway', kind: 'halfway' })
  })

  it('does not celebrate milestones from an earlier ride again', () => {
    const ticks = ride(plan({ startM: 6_000 }), 0, 30, 250)
    expect(ticks.some((t) => t.milestone)).toBe(false)
  })

  it('rides back the way it came past the end', () => {
    expect(foldPosition(500, 1000)).toEqual({ positionM: 500, reversed: false })
    expect(foldPosition(1200, 1000)).toEqual({ positionM: 800, reversed: true })
    expect(foldPosition(2300, 1000)).toEqual({ positionM: 300, reversed: false })
    const t = ride(plan({ startM: 19_990 }), 0, 30, 250).at(-1)!
    expect(t.journey!.reversed).toBe(true)
    expect(t.journey!.finished).toBe(true)
    expect(t.journey!.progressM).toBeCloseTo(course.lengthM, 0)
  })

  it('leaves the trainer, the target and the cues to the ride underneath', () => {
    const base: PlanTick = { ...IDLE_TICK, desired: { mode: 'erg', watts: 250 }, targetW: 250, segmentLabel: 'VO2 1/5', cue: 'Go' }
    const t = plan().tick(input(1, 200), base)
    expect(t.desired).toEqual({ mode: 'erg', watts: 250 })
    expect(t.targetW).toBe(250)
    expect(t.segmentLabel).toBe('VO2 1/5')
    expect(t.cue).toBe('Go')
    expect(t.journey!.name).toBe('Test Road')
  })

  it('lists the places passed this ride, for the Strava description', () => {
    const p = plan({ startM: 4_900 })
    ride(p, 0, 1800, 250)
    expect(p.passedThisRide).toEqual(['Village'])
  })
})
