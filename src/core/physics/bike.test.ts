import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  airDensity,
  cwFromCda,
  DEFAULT_BIKE,
  effectiveMassKg,
  powerForSpeed,
  resistiveForce,
  stepSpeed,
  steadySpeedForPower,
  type BikeParams,
} from './bike'

const kmh = (mps: number) => mps * 3.6

// Speed trajectory from fine-step RK4 of m·dv/dt = η·P/v − F(v), sampled once per second.
function referenceTrajectory(v0: number, powerW: number, gradePct: number, seconds: number): number[] {
  const m = effectiveMassKg(DEFAULT_BIKE)
  const accel = (v: number) => ((v > 0 ? (DEFAULT_BIKE.drivetrainEff * powerW) / v : 0) - resistiveForce(v, gradePct)) / m
  const h = 0.001
  let v = v0
  const out: number[] = []
  for (let i = 1; i <= seconds * 1000; i++) {
    const k1 = accel(v)
    const k2 = accel(v + (h / 2) * k1)
    const k3 = accel(v + (h / 2) * k2)
    const k4 = accel(v + h * k3)
    v += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
    if (i % 1000 === 0) out.push(v)
  }
  return out
}

describe('steadySpeedForPower (Martin 1998 defaults: 75 + 8.5 kg, CdA 0.35, Crr 0.0033)', () => {
  it('200 W on the flat ≈ 33 km/h', () => {
    const v = kmh(steadySpeedForPower(200, 0))
    expect(v).toBeGreaterThan(32)
    expect(v).toBeLessThan(34)
  })

  it('300 W at 8 % ≈ 14.7 km/h (VAM ≈ 1170 m/h, which is typical for 4 W/kg)', () => {
    // The task brief expected 11–13 km/h, but at 83.5 kg that needs only about 230–260 W.
    const v = steadySpeedForPower(300, 8)
    expect(kmh(v)).toBeGreaterThan(14)
    expect(kmh(v)).toBeLessThan(15.5)
    const vam = v * Math.sin(Math.atan(0.08)) * 3600
    expect(vam).toBeGreaterThan(1100)
    expect(vam).toBeLessThan(1250)
  })

  it('0 W at −6 % reaches a terminal coasting speed where the resistance vanishes', () => {
    const v = steadySpeedForPower(0, -6)
    expect(kmh(v)).toBeGreaterThan(50)
    expect(kmh(v)).toBeLessThan(70)
    expect(resistiveForce(v, -6)).toBeCloseTo(0, 9)
  })

  it('returns 0 when the rider cannot move: no power on the flat or uphill', () => {
    expect(steadySpeedForPower(0, 0)).toBe(0)
    expect(steadySpeedForPower(0, 12)).toBe(0)
    expect(steadySpeedForPower(-50, 3)).toBe(0)
    expect(steadySpeedForPower(0, -0.2)).toBe(0) // gravity is weaker than rolling resistance here
  })

  it('crawls, rather than stalling, on a steep climb with little power', () => {
    const v = steadySpeedForPower(5, 20)
    expect(v).toBeGreaterThan(0)
    expect(powerForSpeed(v, 20)).toBeCloseTo(5, 6)
  })

  it('handles wind: slower into a headwind, and a tailwind can push a coasting rider', () => {
    expect(steadySpeedForPower(200, 0, { ...DEFAULT_BIKE, windMps: 5 })).toBeLessThan(steadySpeedForPower(200, 0))
    expect(steadySpeedForPower(0, 0, { ...DEFAULT_BIKE, windMps: -5 })).toBeGreaterThan(0)
  })

  it('finds speeds beyond the initial 30 m/s bracket on very steep descents', () => {
    const v = steadySpeedForPower(300, -25)
    expect(v).toBeGreaterThan(30)
    expect(powerForSpeed(v, -25)).toBeCloseTo(300, 6)
  })

  it('round-trips through powerForSpeed within 0.5 W across powers, grades, winds and masses', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1500, noNaN: true }),
        fc.double({ min: -15, max: 20, noNaN: true }),
        fc.double({ min: -8, max: 8, noNaN: true }),
        fc.double({ min: 45, max: 130, noNaN: true }),
        (powerW, gradePct, windMps, riderKg) => {
          const p: BikeParams = { ...DEFAULT_BIKE, windMps, riderKg }
          const v = steadySpeedForPower(powerW, gradePct, p)
          expect(Number.isFinite(v)).toBe(true)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(Math.abs(powerForSpeed(v, gradePct, p) - powerW)).toBeLessThan(0.5)
        },
      ),
    )
  })
})

describe('powerForSpeed and resistiveForce', () => {
  it('is 0 at rest; downhill it is negative below terminal speed (the rider would have to brake) and positive above it', () => {
    expect(powerForSpeed(0, 5)).toBe(0)
    const terminal = steadySpeedForPower(0, -8) // ≈ 17 m/s
    expect(powerForSpeed(terminal - 5, -8)).toBeLessThan(0)
    expect(powerForSpeed(terminal + 5, -8)).toBeGreaterThan(0)
  })

  it('splits into gravity, rolling and aero parts', () => {
    const m = DEFAULT_BIKE.riderKg + DEFAULT_BIKE.bikeKg
    const theta = Math.atan(0.05)
    const expected = m * 9.80665 * (Math.sin(theta) + DEFAULT_BIKE.crr * Math.cos(theta)) + 0.5 * 1.225 * 0.35 * 36
    expect(resistiveForce(6, 5)).toBeCloseTo(expected, 12)
    expect(powerForSpeed(6, 5)).toBeCloseTo((expected * 6) / 0.976, 9)
    expect(resistiveForce(-3, 0)).toBe(resistiveForce(0, 0)) // no rolling backwards
  })
})

describe('stepSpeed', () => {
  const cases: [number, number][] = [
    [200, 0],
    [300, 8],
    [100, -3],
    [0, -6],
    [400, 0],
    [50, 20],
  ]

  it.each(cases)('from rest, %d W at %d %% is within 3 %% of steady speed after 60 s at 4 Hz, and exact later', (powerW, gradePct) => {
    const target = steadySpeedForPower(powerW, gradePct)
    let v = 0
    for (let i = 0; i < 240; i++) v = stepSpeed(v, powerW, gradePct, 0.25)
    expect(Math.abs(v - target) / target).toBeLessThan(0.03)
    for (let i = 0; i < 2400; i++) v = stepSpeed(v, powerW, gradePct, 0.25)
    expect(v).toBeCloseTo(target, 6) // the fixed point is exactly F·v = η·P
  })

  it.each([
    [200, 0, 2],
    [100, -3, 5],
    [0, -6, 0],
    [600, 0, 3],
    [0, 0, 12],
  ])('tracks a fine RK4 reference (%d W, %d %%, from %d m/s) within 0.2 %%', (powerW, gradePct, v0) => {
    const ref = referenceTrajectory(v0, powerW, gradePct, 60)
    let v = v0
    for (const r of ref) {
      for (let k = 0; k < 4; k++) v = stepSpeed(v, powerW, gradePct, 0.25)
      expect(Math.abs(v - r)).toBeLessThan(Math.max(0.002 * r, 0.01))
    }
  })

  it('coasts to a complete stop on the flat, slowing down monotonically', () => {
    let v = 10
    let t = 0
    while (v > 0 && t < 1200) {
      const next = stepSpeed(v, 0, 0, 0.25)
      expect(next).toBeLessThanOrEqual(v)
      v = next
      t += 0.25
    }
    expect(v).toBe(0)
    expect(t).toBeGreaterThan(60)
    expect(t).toBeLessThan(300)
    expect(stepSpeed(0, 0, 0, 1)).toBe(0)
  })

  it('does not blow up at v = 0 and starts rolling downhill from rest', () => {
    const launched = stepSpeed(0, 1000, 0, 0.25)
    expect(launched).toBeGreaterThan(0)
    expect(launched).toBeLessThan(Math.sqrt((2 * 976 * 0.25) / effectiveMassKg()) + 1e-9) // ≤ all work → KE
    expect(stepSpeed(1e-12, 300, 10, 0.25)).toBeGreaterThan(0)
    const rolling = stepSpeed(0, 0, -6, 1)
    expect(rolling).toBeGreaterThan(0.4) // |F_res(0)| / m_eff ≈ 0.55 m/s², for 1 s
    expect(rolling).toBeLessThan(0.7)
    expect(stepSpeed(0, 0, 12, 1)).toBe(0) // no power uphill: stays put, never rolls back
  })

  it('is independent of how the time is sliced', () => {
    let a = 5
    let b = 5
    for (let i = 0; i < 30; i++) {
      a = stepSpeed(a, 300, 2, 1)
      for (let k = 0; k < 4; k++) b = stepSpeed(b, 300, 2, 0.25)
    }
    expect(a).toBeCloseTo(b, 9)
  })

  it('wheel inertia slows acceleration but not the steady speed', () => {
    const noInertia: BikeParams = { ...DEFAULT_BIKE, wheelInertiaKgM2: 0 }
    expect(effectiveMassKg()).toBeCloseTo(83.5 + 0.14 / 0.311 ** 2, 9)
    let a = 0
    let b = 0
    for (let i = 0; i < 20; i++) {
      a = stepSpeed(a, 400, 0, 0.25)
      b = stepSpeed(b, 400, 0, 0.25, noInertia)
    }
    expect(a).toBeLessThan(b)
    expect(steadySpeedForPower(400, 0)).toBe(steadySpeedForPower(400, 0, noInertia))
  })

  it('ignores a non-positive dt and sanitises bad speeds', () => {
    expect(stepSpeed(7, 300, 0, 0)).toBe(7)
    expect(stepSpeed(7, 300, 0, -1)).toBe(7)
    expect(stepSpeed(Number.NaN, 0, 0, 1)).toBe(0)
    expect(stepSpeed(-4, 0, 0, 1)).toBe(0)
  })
})

describe('airDensity and cwFromCda', () => {
  it('matches the International Standard Atmosphere', () => {
    expect(airDensity(15)).toBeCloseTo(1.225, 3)
    expect(airDensity(8.5, undefined, 1000)).toBeCloseTo(1.1117, 3)
    expect(airDensity(2, undefined, 2000)).toBeCloseTo(1.0066, 3)
  })

  it('uses an explicit pressure over altitude', () => {
    expect(airDensity(20, 100_000)).toBeCloseTo(100_000 / (287.058 * 293.15), 12)
    expect(airDensity(20, 100_000, 3000)).toBe(airDensity(20, 100_000))
    expect(airDensity(35)).toBeLessThan(airDensity(0))
  })

  it('cw = ½·ρ·CdA (kg/m)', () => {
    expect(cwFromCda(0.35, 1.225)).toBeCloseTo(0.214375, 12)
    expect(cwFromCda(0.3)).toBeCloseTo(0.18375, 12)
  })
})
