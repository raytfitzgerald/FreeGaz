// One-call ride summary from aligned 1 Hz power, HR and cadence arrays.

import { aerobicDecoupling, efficiencyFactor } from './hr'
import { meanMaxPower, type MmpPoint } from './mmp'
import {
  averagePower,
  intensityFactor,
  kilojoules,
  maxPower,
  NormalizedPowerAccumulator,
  trainingStressScore,
  variabilityIndex,
  wattsPerKg,
} from './power'
import { isValidSample, maxOf, meanOf, type Sample } from './sample'
import { COGGAN_POWER, FRIEL_HR_LTHR, MAX_HR_5, TimeInZones, type ZoneScheme } from './zones'

export interface RideSummaryInput {
  /** Power per second of moving time, W (null = missing). */
  power: readonly Sample[]
  /** Heart rate per second, bpm (null = missing). */
  hr: readonly Sample[]
  /** Cadence per second, rpm (null = missing, 0 = not pedalling). */
  cadence: readonly Sample[]
  /** FTP snapshot for this ride, W. */
  ftp: number
  /** Lactate-threshold HR, bpm. When set, HR zones are Friel % LTHR. */
  lthr?: number
  /** The athlete's max HR, bpm. Used for % max HR zones when lthr is not set. */
  maxHr?: number
  /** Rider weight, kg. */
  weightKg?: number
}

export interface RideSummary {
  /** Recorded (moving) time, s: the length of the longest input array. */
  durationS: number
  /** W */
  avgPower: number | null
  /** W */
  maxPower: number | null
  /** Normalized Power, W */
  np: number | null
  /** Intensity Factor = NP / FTP */
  if: number | null
  /** Training Stress Score over the seconds that have power. */
  tss: number | null
  /** Mechanical work, kJ */
  kj: number | null
  /** Variability Index = NP / average power */
  vi: number | null
  /** Average power per kg, W/kg */
  wkg: number | null
  /** bpm */
  avgHr: number | null
  /** Highest HR in this ride, bpm (not the athlete's max HR setting). */
  maxHr: number | null
  /** Average cadence while pedalling (zeros excluded), rpm */
  avgCadence: number | null
  /** rpm */
  maxCadence: number | null
  /** Efficiency Factor = NP / average HR, W/bpm */
  ef: number | null
  /** Aerobic decoupling (Pw:HR), %. Null with < 20 min of paired data. */
  decouplingPct: number | null
  /** Seconds per COGGAN_POWER zone, or [] without a valid FTP. */
  powerZonesS: number[]
  /** Seconds per zone of hrZoneSchemeId, or [] without an HR reference. */
  hrZonesS: number[]
  /** Id of the HR zone scheme used (FRIEL_HR_LTHR or MAX_HR_5), or null. */
  hrZoneSchemeId: string | null
  /** Power-duration curve over STANDARD_DURATIONS. */
  mmp: MmpPoint[]
}

/**
 * Summarises a ride. Every metric skips missing seconds, so missing is never
 * treated as zero.
 *
 * - Power zeros (coasting) count towards averages and NP.
 * - Average cadence leaves out zeros, so it is the pedalling cadence, as in GoldenCheetah.
 * - HR ≤ 0 is treated as missing, because straps send 0 bpm when they lose contact.
 * - TSS uses the number of seconds that have power, because NP only covers those seconds.
 */
export function summarizeRide(input: RideSummaryInput): RideSummary {
  const { power, cadence, ftp } = input
  const hr = input.hr.map((v) => (isValidSample(v) && v > 0 ? v : null))

  const npAcc = new NormalizedPowerAccumulator()
  for (const w of power) npAcc.push(w)
  const np = npAcc.value()
  const avgPower = averagePower(power)
  const avgHr = meanOf(hr)

  const powerZones = ftp > 0 ? zoneSeconds(power, COGGAN_POWER, ftp) : []
  const hrScheme = hrZoneScheme(input)
  const hrZones = hrScheme ? zoneSeconds(hr, hrScheme.scheme, hrScheme.reference) : []

  return {
    durationS: Math.max(power.length, input.hr.length, cadence.length),
    avgPower,
    maxPower: maxPower(power),
    np,
    if: intensityFactor(np, ftp),
    tss: trainingStressScore(npAcc.validSeconds, np, ftp),
    kj: kilojoules(power),
    vi: variabilityIndex(np, avgPower),
    wkg: wattsPerKg(avgPower, input.weightKg ?? 0),
    avgHr,
    maxHr: maxOf(hr),
    avgCadence: meanOf(cadence, (c) => c > 0),
    maxCadence: maxOf(cadence),
    ef: efficiencyFactor(np, avgHr),
    decouplingPct: aerobicDecoupling(power, hr),
    powerZonesS: powerZones,
    hrZonesS: hrZones,
    hrZoneSchemeId: hrScheme?.scheme.id ?? null,
    mmp: meanMaxPower(power),
  }
}

function hrZoneScheme(input: RideSummaryInput): { scheme: ZoneScheme; reference: number } | null {
  if (input.lthr !== undefined && input.lthr > 0) return { scheme: FRIEL_HR_LTHR, reference: input.lthr }
  if (input.maxHr !== undefined && input.maxHr > 0) return { scheme: MAX_HR_5, reference: input.maxHr }
  return null
}

function zoneSeconds(samples: readonly Sample[], scheme: ZoneScheme, reference: number): number[] {
  const tiz = new TimeInZones(scheme, reference)
  for (const v of samples) tiz.push(v)
  return tiz.seconds()
}
