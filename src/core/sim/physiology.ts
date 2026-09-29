// Deterministic building blocks for the ride simulator: a seeded PRNG, a
// heart-rate model that also emits RR intervals, and a rider model limited by
// W'. Randomness always comes from an injected () => number, never Math.random().

import { WPrimeBalance } from '../metrics/wbal'

/** Uniform random numbers in [0, 1). */
export type Rng = () => number

/**
 * Seeded PRNG, uniform in [0, 1). It uses mulberry32, Tommy Ettinger's 2017
 * public-domain generator. It is fast, has a 32-bit state and is statistically
 * fine for simulation. It is not cryptographic.
 * @param seed any number; it is truncated to 32 bits
 */
export function createRng(seed: number): Rng {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard normal deviate (mean 0, SD 1) from a uniform RNG, using Box–Muller. */
export function gaussian(rng: Rng): number {
  const u = 1 - rng() // (0, 1], so the log is finite
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}

const DEFAULT_SEED = 0x5eed

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

function finitePower(w: number): number {
  return Number.isFinite(w) ? Math.max(0, w) : 0
}

// ---------------------------------------------------------------------------
// Heart rate

export interface HeartRateModelOptions {
  /** Resting HR, bpm. */
  restHr: number
  /** Maximum HR, bpm. */
  maxHr: number
  /** FTP, W. */
  ftpW: number
  /** Lactate-threshold HR, bpm (the steady-state HR at FTP). */
  lthr: number
  rng?: Rng
}

const HR_TAU_UP_S = 30
const HR_TAU_DOWN_S = 60
const DRIFT_BPM_PER_S = 5 / 3600
const DRIFT_ABOVE_FTP = 0.6
const HR_NOISE_BPM = 1
const HR_NOISE_TAU_S = 15
// Beat-to-beat RR variability (SD / mean), from rest to max HR.
const RR_CV_REST = 0.045
const RR_CV_MAX = 0.008
// Lag-1 autocorrelation of the RR fluctuations at rest. It falls to 0 at LTHR,
// so DFA α1 drops with intensity as it does in real riders.
const RR_PHI_REST = 0.6

/**
 * Heart-rate response to power.
 *
 * - Steady state: rest + (LTHR − rest)·P/FTP + drift, capped at max HR.
 * - First-order kinetics towards the steady state, with τ = 30 s rising and
 *   60 s falling.
 * - Cardiac drift of +5 bpm per hour spent above 60 % FTP. It is not recovered.
 * - Smooth noise: an Ornstein–Uhlenbeck process with SD 1 bpm and τ = 15 s.
 * - The output is clamped to [rest, max].
 *
 * RR intervals: mean 60000/HR. The beat-to-beat fluctuation is an AR(1)
 * process. Its SD is 4.5 % of RR at rest, falling to 0.8 % at max HR, and
 * RMSSD is about 4 % at rest. Its correlation fades to 0 at LTHR.
 */
export class HeartRateModel {
  private readonly restHr: number
  private readonly maxHr: number
  private readonly ftpW: number
  private readonly lthr: number
  private readonly rng: Rng
  private base: number
  private noise = 0
  private drift = 0
  private current: number
  private rrState = 0
  private beatMs: number
  private beatElapsedMs = 0

  constructor(opts: HeartRateModelOptions) {
    const { restHr, maxHr, ftpW, lthr } = opts
    if (!(restHr > 0 && lthr > restHr && maxHr >= lthr)) {
      throw new RangeError('HeartRateModel needs 0 < restHr < lthr <= maxHr')
    }
    if (!(ftpW > 0)) throw new RangeError('HeartRateModel needs ftpW > 0')
    this.restHr = restHr
    this.maxHr = maxHr
    this.ftpW = ftpW
    this.lthr = lthr
    this.rng = opts.rng ?? createRng(DEFAULT_SEED)
    this.base = restHr
    this.current = restHr
    this.beatMs = this.drawRr()
  }

  /** Current HR, bpm. */
  get bpm(): number {
    return this.current
  }

  /** Cardiac drift accumulated so far, bpm. */
  get driftBpm(): number {
    return this.drift
  }

  /** Steady-state HR (bpm) that holding `powerW` (W) would settle at, including the drift so far. */
  steadyStateHr(powerW: number): number {
    const p = finitePower(powerW)
    return Math.min(this.maxHr, this.restHr + (this.lthr - this.restHr) * (p / this.ftpW) + this.drift)
  }

  /**
   * Advances the model by `dtS` seconds at `powerW` and returns the new HR, bpm.
   * @param powerW rider power, W
   * @param dtS time step, s
   */
  step(powerW: number, dtS: number): number {
    if (!(dtS > 0)) return this.current
    const p = finitePower(powerW)
    if (p > DRIFT_ABOVE_FTP * this.ftpW) this.drift += DRIFT_BPM_PER_S * dtS
    const target = this.steadyStateHr(p)
    const tau = target > this.base ? HR_TAU_UP_S : HR_TAU_DOWN_S
    this.base += (target - this.base) * (1 - Math.exp(-dtS / tau))
    const k = Math.exp(-dtS / HR_NOISE_TAU_S)
    this.noise = this.noise * k + HR_NOISE_BPM * Math.sqrt(1 - k * k) * gaussian(this.rng)
    this.current = clamp(this.base + this.noise, this.restHr, this.maxHr)
    return this.current
  }

  /**
   * RR intervals (ms) of the beats that completed during the last `dtS`
   * seconds, oldest first. Call once per tick, after step(). The beat phase
   * carries over between calls, so a tick can contain 0, 1 or several beats.
   * @param dtS time covered, s
   */
  rr(dtS: number): number[] {
    const out: number[] = []
    if (!(dtS > 0)) return out
    let remaining = dtS * 1000
    while (this.beatElapsedMs + remaining >= this.beatMs) {
      remaining -= this.beatMs - this.beatElapsedMs
      out.push(this.beatMs)
      this.beatElapsedMs = 0
      this.beatMs = this.drawRr()
    }
    this.beatElapsedMs += remaining
    return out
  }

  private drawRr(): number {
    const hr = this.current
    const reserve = clamp((hr - this.restHr) / (this.maxHr - this.restHr), 0, 1)
    const cv = RR_CV_MAX + (RR_CV_REST - RR_CV_MAX) * (1 - reserve) ** 2
    const phi = RR_PHI_REST * (1 - clamp((hr - this.restHr) / (this.lthr - this.restHr), 0, 1))
    this.rrState = phi * this.rrState + Math.sqrt(1 - phi * phi) * gaussian(this.rng)
    return (60000 / hr) * (1 + cv * this.rrState)
  }
}

// ---------------------------------------------------------------------------
// Rider

export interface RiderModelOptions {
  /** FTP, W. */
  ftpW: number
  /** Critical power, W (default: ftpW). */
  cpW?: number
  /** W', J (default 20 000). */
  wPrimeJ?: number
  /** Cadence the rider settles at, rpm (default 88). */
  preferredCadence?: number
  rng?: Rng
}

export type PedalInput =
  /** ERG: the trainer holds targetW; the rider just keeps pedalling. */
  | { mode: 'erg'; targetW: number; dtS: number }
  /** Resistance, SIM or free ride: the rider tries to produce desiredW. */
  | { mode: 'effort'; desiredW: number; dtS: number }
  /** Not pedalling. */
  | { mode: 'coast'; dtS: number }

export interface PedalOutput {
  /** Delivered power, W. */
  powerW: number
  /** rpm */
  cadenceRpm: number
  /** True from the moment W' is exhausted until 20 % of it has recovered. */
  fatigued: boolean
}

// A KICKR settles an ERG step in about 3 s; τ = 1.2 s puts a 50 W step within 5 W in ~2.8 s.
const ERG_TAU_S = 1.2
const EFFORT_TAU_S = 1
const CADENCE_TAU_S = 1
const POWER_NOISE = 0.01
const CADENCE_NOISE_RPM = 1.5
const CADENCE_NOISE_TAU_S = 3
const COAST_STOP_S = 2
const FATIGUED_CP_FRACTION = 0.9
const RECOVERED_WPRIME_FRACTION = 0.2
const DEFAULT_WPRIME_J = 20_000
const DEFAULT_CADENCE = 88

/**
 * A simulated rider.
 *
 * - erg: the trainer does the work. Delivered power follows targetW with a
 *   first-order lag (τ = 1.2 s) and 1 % noise, and cadence stays near the
 *   preferred value.
 * - effort: the rider aims for desiredW (τ = 1 s) and is limited by W', which
 *   is tracked with the Skiba 2015 differential model at the true CP/W'. Once
 *   W'bal reaches 0 the rider is fatigued and can hold at most 90 % of CP,
 *   until 20 % of W' has recovered.
 * - coast: 0 W, and cadence falls linearly to 0 over about 2 s.
 *
 * W'bal is tracked in every mode. In erg mode `fatigued` is informational only,
 * because the trainer still imposes the target.
 */
export class RiderModel {
  readonly ftpW: number
  readonly cpW: number
  readonly wPrimeJ: number
  private preferred: number
  private readonly rng: Rng
  private readonly wbal: WPrimeBalance
  private power = 0
  private cadence = 0
  private cadenceNoise = 0
  private tired = false

  constructor(opts: RiderModelOptions) {
    if (!(opts.ftpW > 0)) throw new RangeError('RiderModel needs ftpW > 0')
    this.ftpW = opts.ftpW
    this.cpW = opts.cpW ?? opts.ftpW
    this.wPrimeJ = opts.wPrimeJ ?? DEFAULT_WPRIME_J
    this.preferred = opts.preferredCadence ?? DEFAULT_CADENCE
    this.rng = opts.rng ?? createRng(DEFAULT_SEED + 1)
    this.wbal = new WPrimeBalance({ cp: this.cpW, wPrimeJ: this.wPrimeJ })
  }

  /** The rider's current W' balance, J. */
  get wPrimeBalJ(): number {
    return this.wbal.valueJ
  }

  /** True while the rider is exhausted (see PedalOutput.fatigued). */
  get fatigued(): boolean {
    return this.tired
  }

  /** Cadence the rider settles at, rpm. */
  get preferredCadence(): number {
    return this.preferred
  }

  /** Changes the cadence the rider settles at, rpm (for example from a script). */
  setPreferredCadence(rpm: number): void {
    if (Number.isFinite(rpm) && rpm >= 0) this.preferred = rpm
  }

  /** Advances the rider by input.dtS seconds. Returns delivered power (W), cadence (rpm) and fatigue. */
  pedal(input: PedalInput): PedalOutput {
    const dt = input.dtS
    if (!(dt > 0)) return { powerW: this.power, cadenceRpm: this.cadence, fatigued: this.tired }
    let powerW: number
    let cadenceRpm: number
    if (input.mode === 'coast') {
      this.power = 0
      this.cadenceNoise = 0
      this.cadence = Math.max(0, this.cadence - (this.preferred / COAST_STOP_S) * dt)
      powerW = 0
      cadenceRpm = this.cadence
    } else {
      const erg = input.mode === 'erg'
      const target = erg ? finitePower(input.targetW) : this.limit(input.desiredW)
      this.power += (target - this.power) * (1 - Math.exp(-dt / (erg ? ERG_TAU_S : EFFORT_TAU_S)))
      this.cadence += (this.preferred - this.cadence) * (1 - Math.exp(-dt / CADENCE_TAU_S))
      const k = Math.exp(-dt / CADENCE_NOISE_TAU_S)
      this.cadenceNoise = this.cadenceNoise * k + CADENCE_NOISE_RPM * Math.sqrt(1 - k * k) * gaussian(this.rng)
      powerW = Math.max(0, this.power * (1 + POWER_NOISE * gaussian(this.rng)))
      cadenceRpm = Math.max(0, this.cadence + this.cadenceNoise)
    }
    const bal = this.wbal.push(powerW, dt)
    if (bal <= 0) this.tired = true
    else if (this.tired && bal >= RECOVERED_WPRIME_FRACTION * this.wPrimeJ) this.tired = false
    return { powerW, cadenceRpm, fatigued: this.tired }
  }

  private limit(desiredW: number): number {
    const w = finitePower(desiredW)
    return this.tired ? Math.min(w, FATIGUED_CP_FRACTION * this.cpW) : w
  }
}

// ---------------------------------------------------------------------------
// Scripted rider events

export interface RiderScriptEvent {
  /** Seconds from the start of the ride. */
  atS: number
  /** 'stop' starts coasting, 'resume' pedals again, and 'cadence' sets the preferred cadence to `value` rpm. */
  action: 'stop' | 'resume' | 'cadence'
  value?: number
}

export type RiderScript = readonly RiderScriptEvent[]

export interface RiderScriptState {
  /** True between a 'stop' and the next 'resume'. */
  stopped: boolean
  /** Latest scripted cadence (rpm), or null if none yet. */
  cadenceRpm: number | null
}

/**
 * The scripted state at time `tS` (s). It applies every event with atS ≤ tS in
 * time order. Events at the same time keep their order in the script.
 */
export function riderScriptState(script: RiderScript, tS: number): RiderScriptState {
  let stopped = false
  let cadenceRpm: number | null = null
  for (const e of [...script].sort((a, b) => a.atS - b.atS)) {
    if (e.atS > tS) break
    if (e.action === 'stop') stopped = true
    else if (e.action === 'resume') stopped = false
    else if (e.value !== undefined) cadenceRpm = e.value
  }
  return { stopped, cadenceRpm }
}
