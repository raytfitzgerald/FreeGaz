// Road-cycling power model for virtual speed.
//
// Martin, Milliken, Cobb, McFadden & Coggan (1998), "Validation of a
// mathematical model for road cycling power", J Appl Biomech 14:276–291:
//
//   η·P = v·m·g·(sin θ + Crr·cos θ) + ½·ρ·CdA·(v + w)·|v + w|·v + (m + I/r²)·a·v
//
// θ = atan(grade/100), w = headwind (m/s, positive into the rider). Martin's
// small wheel-bearing term is left out. Speeds are ground speeds in m/s and
// never negative: the model does not roll backwards.

/** Standard gravity, m/s². */
export const G = 9.80665

export interface BikeParams {
  /** Rider mass, kg. */
  riderKg: number
  /** Bike mass (with kit, bottles...), kg. */
  bikeKg: number
  /** Drag area, m² (default 0.35: hoods, road bike). */
  cda: number
  /** Rolling-resistance coefficient (default 0.0033: good road tyres). */
  crr: number
  /** Drivetrain efficiency, 0–1 (default 0.976). */
  drivetrainEff: number
  /** Air density, kg/m³ (default 1.225: 15 °C at sea level). */
  airDensity: number
  /** Wind along the direction of travel, m/s. Positive is a headwind, negative a tailwind. */
  windMps: number
  /** Combined moment of inertia of both wheels, kg·m² (Martin: 0.14). It affects acceleration only. */
  wheelInertiaKgM2?: number
  /** Wheel radius, m (default 0.311 for 700c). Only used together with wheelInertiaKgM2. */
  wheelRadiusM?: number
}

export const DEFAULT_BIKE: Readonly<BikeParams> = {
  riderKg: 75,
  bikeKg: 8.5,
  cda: 0.35,
  crr: 0.0033,
  drivetrainEff: 0.976,
  airDensity: 1.225,
  windMps: 0,
  wheelInertiaKgM2: 0.14,
  wheelRadiusM: 0.311,
}

// Resistive force as F(v) = a + b·(v + w)·|v + w|. It is non-decreasing in v.
interface ForceModel {
  a: number
  b: number
  w: number
}

function forceModel(gradePct: number, p: Readonly<BikeParams>): ForceModel {
  const theta = Math.atan((Number.isFinite(gradePct) ? gradePct : 0) / 100)
  const m = p.riderKg + p.bikeKg
  return { a: m * G * (Math.sin(theta) + p.crr * Math.cos(theta)), b: 0.5 * p.airDensity * p.cda, w: p.windMps }
}

function force(fm: ForceModel, v: number): number {
  const air = v + fm.w
  return fm.a + fm.b * air * Math.abs(air)
}

function cleanSpeed(v: number): number {
  return Number.isFinite(v) ? Math.max(0, v) : 0
}

function wheelPower(powerW: number, p: Readonly<BikeParams>): number {
  return p.drivetrainEff * (Number.isFinite(powerW) ? Math.max(0, powerW) : 0)
}

/** Mass plus the wheels' rotational inertia expressed as mass (m + I/r²), kg. */
export function effectiveMassKg(p: Readonly<BikeParams> = DEFAULT_BIKE): number {
  const m = p.riderKg + p.bikeKg
  const r = p.wheelRadiusM ?? 0.311
  return p.wheelInertiaKgM2 && r > 0 ? m + p.wheelInertiaKgM2 / (r * r) : m
}

/**
 * Total resistive force at ground speed `v`, N: gravity along the slope, plus
 * rolling resistance, plus aerodynamic drag. It is negative when gravity or a
 * tailwind pushes the rider forward.
 * @param v ground speed, m/s (negative values are treated as 0)
 * @param gradePct road grade, % (rise/run × 100; negative is downhill)
 */
export function resistiveForce(v: number, gradePct: number, p: Readonly<BikeParams> = DEFAULT_BIKE): number {
  return force(forceModel(gradePct, p), cleanSpeed(v))
}

/**
 * Rider power at the cranks needed to hold speed `v` steadily, W:
 * F_res(v)·v / η. It is negative when gravity alone would go faster, i.e. the
 * rider would have to brake.
 * @param vMps ground speed, m/s
 * @param gradePct road grade, %
 */
export function powerForSpeed(vMps: number, gradePct: number, p: Readonly<BikeParams> = DEFAULT_BIKE): number {
  const v = cleanSpeed(vMps)
  return (force(forceModel(gradePct, p), v) * v) / p.drivetrainEff
}

/**
 * Steady ground speed (m/s) at which `powerW` at the cranks balances the
 * resistance, i.e. the solution v ≥ 0 of F_res(v)·v = η·P.
 *
 * With P = 0 the result is the terminal coasting speed (F_res = 0) on a
 * descent or with a strong tailwind, and 0 where the rider cannot move (on the
 * flat or a climb). The root is unique on [v0, ∞), where v0 is the speed at
 * which F_res changes sign. It is found with Newton's method on a bracket that
 * starts at [v0, 30 m/s] and doubles until it contains the root, with a
 * bisection fallback, to about 1e-9 W.
 * @param powerW rider power at the cranks, W (negative values are treated as 0)
 * @param gradePct road grade, %
 */
export function steadySpeedForPower(powerW: number, gradePct: number, p: Readonly<BikeParams> = DEFAULT_BIKE): number {
  const fm = forceModel(gradePct, p)
  const target = wheelPower(powerW, p)
  const v0 = zeroForceSpeed(fm)
  if (!Number.isFinite(v0)) return Number.POSITIVE_INFINITY // no drag and gravity wins: no steady state
  if (target === 0) return v0
  if (fm.b === 0) return target / fm.a // a > 0 here, otherwise v0 would be infinite

  const g = (v: number): number => force(fm, v) * v - target
  let lo = v0
  let hi = Math.max(30, 2 * v0)
  while (g(hi) < 0) hi *= 2
  let v = hi
  for (let i = 0; i < 100; i++) {
    const gv = g(v)
    if (Math.abs(gv) <= 1e-9 * Math.max(1, target)) return v
    if (gv > 0) hi = v
    else lo = v
    const slope = force(fm, v) + 2 * fm.b * Math.abs(v + fm.w) * v
    let next = slope > 0 ? v - gv / slope : Number.NaN
    if (!(next > lo && next < hi)) next = 0.5 * (lo + hi)
    if (Math.abs(next - v) <= 1e-12 * Math.max(1, v)) return next
    v = next
  }
  return v
}

// Smallest v ≥ 0 at which F(v) ≤ 0 stops holding, i.e. where F changes sign.
// 0 when F(0) > 0, and Infinity when F never becomes positive (no drag and a net forward force).
function zeroForceSpeed(fm: ForceModel): number {
  if (fm.b === 0) return fm.a > 0 ? 0 : Number.POSITIVE_INFINITY
  const c = -fm.a / fm.b // (v + w)·|v + w| = c
  const air = c >= 0 ? Math.sqrt(c) : -Math.sqrt(-c)
  return Math.max(0, air - fm.w)
}

// Longest internal integration step, s.
const MAX_SUBSTEP_S = 0.05

/**
 * Advances ground speed by `dtS` seconds under rider power `powerW`. Returns the new speed, m/s.
 *
 * This integrates the energy equation d(½·m_eff·v²)/dt = η·P − F_res(v)·v,
 * with m_eff = effectiveMassKg(p), in sub-steps h of at most 50 ms:
 *
 *   ½·m_eff·v′² = ½·m_eff·v² + η·P·h − F_res(v)·h·(v + v′)/2
 *
 * The resistive work is the force times the distance covered at the step's
 * mean speed, and it is solved for v′ as a quadratic. As a result:
 * - there is no P/v singularity, and a standing start with power gives a finite speed;
 * - a stationary bike at the top of a descent starts to roll. Using F·v at the
 *   start speed would leave it stuck, because F·v = 0 at v = 0;
 * - the fixed point is exactly F_res(v)·v = η·P, so the speed converges to
 *   steadySpeedForPower with no discretisation bias;
 * - speed is clamped at 0 when the resistive work exceeds the kinetic energy.
 *   So coasting on the flat stops in finite time, and a stalled climb stops
 *   rather than rolling back.
 * @param v current ground speed, m/s
 * @param powerW rider power at the cranks, W
 * @param gradePct road grade, %
 * @param dtS time step, s
 */
export function stepSpeed(v: number, powerW: number, gradePct: number, dtS: number, p: Readonly<BikeParams> = DEFAULT_BIKE): number {
  let speed = cleanSpeed(v)
  if (!(dtS > 0) || !Number.isFinite(dtS)) return speed
  const fm = forceModel(gradePct, p)
  const halfM = 0.5 * effectiveMassKg(p)
  const steps = Math.max(1, Math.ceil(dtS / MAX_SUBSTEP_S - 1e-9))
  const h = dtS / steps
  const work = wheelPower(powerW, p) * h
  for (let i = 0; i < steps; i++) {
    // halfM·v′² + b·v′ + c = 0; take the larger root, or stop if it is negative.
    const f = force(fm, speed)
    const b = 0.5 * f * h
    const c = -(halfM * speed * speed + work - b * speed)
    const disc = b * b - 4 * halfM * c
    if (disc < 0) {
      speed = 0
      continue
    }
    const root = Math.sqrt(disc)
    // Two algebraically equal forms of the same root, chosen to avoid cancellation.
    speed = b > 0 ? Math.max(0, (-2 * c) / (b + root)) : (root - b) / (2 * halfM)
  }
  return speed
}

/** Specific gas constant of dry air, J/(kg·K). */
export const R_DRY_AIR = 287.058
/** ISA sea-level pressure, Pa. */
export const SEA_LEVEL_PA = 101_325

/**
 * International Standard Atmosphere pressure at an altitude, Pa (valid in the troposphere, below 11 km).
 * @param altitudeM altitude above sea level, m
 */
export function isaPressurePa(altitudeM: number): number {
  return SEA_LEVEL_PA * (1 - 2.25577e-5 * altitudeM) ** 5.25588
}

/**
 * Density of dry air, kg/m³: ρ = p / (R·T).
 * @param tempC air temperature, °C
 * @param pressurePa absolute local pressure, Pa. If omitted, the ISA pressure at altitudeM is used.
 * @param altitudeM altitude, m (default 0). Only used when pressurePa is omitted.
 */
export function airDensity(tempC: number, pressurePa?: number, altitudeM = 0): number {
  const p = pressurePa ?? isaPressurePa(altitudeM)
  return p / (R_DRY_AIR * (tempC + 273.15))
}

/**
 * FTMS "wind resistance coefficient", kg/m: ½·ρ·CdA, the constant that
 * multiplies air speed² in the drag force.
 * @param cda drag area, m²
 * @param rho air density, kg/m³ (default 1.225)
 */
export function cwFromCda(cda: number, rho: number = DEFAULT_BIKE.airDensity): number {
  return 0.5 * rho * cda
}
