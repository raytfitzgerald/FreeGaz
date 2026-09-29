// Every metric the HUD can show. A widget reads one primitive from the live
// frame (4 Hz) and the ride store (1–4 Hz), so it re-renders only when its
// own number changes.
import type { LiveFrame } from '@shared/live'
import type { AthleteSnapshot } from '@core/ride/types'
import { COGGAN_POWER, FRIEL_HR_LTHR } from '@core/metrics/zones'
import type { rideStore } from '../stores/ride'
import { formatDuration } from '../ui/format'

export interface HudState {
  frame: LiveFrame
  ride: ReturnType<typeof rideStore.getState>
  athlete: AthleteSnapshot
  /** Epoch ms, refreshed by the frame clock. */
  wall: number
}

export type WidgetGroup = 'Power' | 'Heart rate' | 'Cadence' | 'Time' | 'Speed & distance' | 'Energy' | 'Trainer' | 'Body'

export interface WidgetDef {
  id: string
  label: string
  group: WidgetGroup
  unit?: string
  /** Series colour for the line-key (never the text). */
  accent?: string
  read: (s: HudState) => number | string | null
  /** Small caption under the number (must also be a primitive). */
  sub?: (s: HudState) => string | undefined
}

const POWER = 'var(--color-power)'
const HR = 'var(--color-hr)'
const CAD = 'var(--color-cadence)'
const SPEED = 'var(--color-speed)'
const WBAL = 'var(--color-wbal)'

const pctOf = (v: number | null, ref: number | undefined | null) => (v === null || !ref ? null : Math.round((v / ref) * 100))
const zoneName = (frac: number | null, scheme: typeof COGGAN_POWER) => {
  if (frac === null) return null
  const z = scheme.zones.find((z) => frac >= z.lo && (z.hi === null || frac < z.hi))
  return z ? `${z.short} ${z.name}` : null
}
const target = (s: HudState) => s.ride.plan?.targetW ?? s.frame.trainer.targetW
const kcal = (kj: number | null | undefined) => (kj === null || kj === undefined ? null : Math.round(kj)) // ~24 % efficiency makes kJ ≈ kcal

/** Rough carbohydrate share of energy by intensity (estimate, labelled as such). */
export function carbShare(intensity: number | null): number {
  if (intensity === null) return 0.5
  return Math.max(0.3, Math.min(0.95, 0.3 + 1.1 * (intensity - 0.5)))
}

export const WIDGETS: readonly WidgetDef[] = [
  // ---- power
  { id: 'power', label: 'Power', group: 'Power', unit: 'W', accent: POWER, read: (s) => s.frame.power },
  { id: 'power3s', label: 'Power · 3 s', group: 'Power', unit: 'W', accent: POWER, read: (s) => s.frame.power3s },
  { id: 'power10s', label: 'Power · 10 s', group: 'Power', unit: 'W', accent: POWER, read: (s) => s.frame.power10s },
  { id: 'power30s', label: 'Power · 30 s', group: 'Power', unit: 'W', accent: POWER, read: (s) => s.frame.power30s },
  { id: 'lapPower', label: 'Interval avg', group: 'Power', unit: 'W', accent: POWER, read: (s) => s.ride.metrics?.lap.avgPower ?? null },
  { id: 'avgPower', label: 'Ride avg', group: 'Power', unit: 'W', accent: POWER, read: (s) => s.ride.metrics?.avgPower ?? null },
  { id: 'maxPower', label: 'Max power', group: 'Power', unit: 'W', accent: POWER, read: (s) => s.ride.metrics?.maxPower ?? null },
  { id: 'np', label: 'Normalized power', group: 'Power', unit: 'W', read: (s) => s.ride.snapshot?.np ?? null },
  { id: 'if', label: 'Intensity (IF)', group: 'Power', read: (s) => (s.ride.metrics?.if === null || s.ride.metrics?.if === undefined ? null : s.ride.metrics.if.toFixed(2)) },
  { id: 'tss', label: 'TSS', group: 'Power', read: (s) => (s.ride.snapshot?.tss === null || s.ride.snapshot?.tss === undefined ? null : Math.round(s.ride.snapshot.tss)) },
  { id: 'wkg', label: 'W/kg · 3 s', group: 'Power', unit: 'W/kg', read: (s) => (s.frame.power3s === null ? null : (s.frame.power3s / s.athlete.weightKg).toFixed(2)) },
  { id: 'pctFtp', label: '% FTP · 3 s', group: 'Power', unit: '%', read: (s) => pctOf(s.frame.power3s, s.athlete.ftpW) },
  { id: 'powerZone', label: 'Power zone', group: 'Power', read: (s) => zoneName(s.frame.power3s === null ? null : s.frame.power3s / s.athlete.ftpW, COGGAN_POWER) },
  { id: 'target', label: 'Target', group: 'Power', unit: 'W', accent: POWER, read: (s) => target(s) },
  { id: 'delta', label: 'vs target · 3 s', group: 'Power', unit: 'W', read: (s) => {
    const t = target(s)
    return t === null || s.frame.power3s === null ? null : `${s.frame.power3s - t > 0 ? '+' : ''}${s.frame.power3s - t}`
  } },
  { id: 'wbal', label: 'W′ balance', group: 'Power', unit: '%', accent: WBAL, read: (s) => s.ride.snapshot?.wbalPct ?? null, sub: (s) => (s.ride.metrics ? `${(s.ride.metrics.wbalJ / 1000).toFixed(1)} kJ left` : undefined) },
  { id: 'balance', label: 'L/R balance', group: 'Power', read: (s) => (s.frame.lrBalance === null ? null : `${Math.round(s.frame.lrBalance)} / ${Math.round(100 - s.frame.lrBalance)}`) },
  // ---- heart rate
  { id: 'hr', label: 'Heart rate', group: 'Heart rate', unit: 'bpm', accent: HR, read: (s) => s.frame.hr },
  { id: 'lapHr', label: 'Interval avg HR', group: 'Heart rate', unit: 'bpm', accent: HR, read: (s) => s.ride.metrics?.lap.avgHr ?? null },
  { id: 'avgHr', label: 'Ride avg HR', group: 'Heart rate', unit: 'bpm', accent: HR, read: (s) => s.ride.metrics?.avgHr ?? null },
  { id: 'maxHr', label: 'Max HR', group: 'Heart rate', unit: 'bpm', accent: HR, read: (s) => s.ride.metrics?.maxHr ?? null },
  { id: 'pctMaxHr', label: '% max HR', group: 'Heart rate', unit: '%', read: (s) => pctOf(s.frame.hr, s.athlete.maxHr) },
  { id: 'pctLthr', label: '% LTHR', group: 'Heart rate', unit: '%', read: (s) => pctOf(s.frame.hr, s.athlete.lthr) },
  { id: 'hrZone', label: 'HR zone', group: 'Heart rate', read: (s) => (s.athlete.lthr && s.frame.hr !== null ? zoneName(s.frame.hr / s.athlete.lthr, FRIEL_HR_LTHR) : null) },
  { id: 'decoupling', label: 'Decoupling (Pa:HR)', group: 'Heart rate', unit: '%', read: (s) => (s.ride.metrics?.decouplingPct === null || s.ride.metrics?.decouplingPct === undefined ? null : s.ride.metrics.decouplingPct.toFixed(1)) },
  // ---- cadence
  { id: 'cadence', label: 'Cadence', group: 'Cadence', unit: 'rpm', accent: CAD, read: (s) => s.frame.cadence, sub: (s) => {
    const c = s.ride.plan?.cadence
    return c ? (c.low !== undefined && c.high !== undefined ? `Target ${c.low}–${c.high}` : c.rpm !== undefined ? `Target ${c.rpm}` : undefined) : undefined
  } },
  { id: 'lapCadence', label: 'Interval avg cadence', group: 'Cadence', unit: 'rpm', accent: CAD, read: (s) => s.ride.metrics?.lap.avgCadence ?? null },
  { id: 'avgCadence', label: 'Ride avg cadence', group: 'Cadence', unit: 'rpm', accent: CAD, read: (s) => s.ride.metrics?.avgCadence ?? null },
  // ---- time
  { id: 'elapsed', label: 'Elapsed', group: 'Time', read: (s) => (s.ride.snapshot ? formatDuration(s.ride.snapshot.elapsedS) : null) },
  { id: 'moving', label: 'Moving time', group: 'Time', read: (s) => (s.ride.snapshot ? formatDuration(s.ride.snapshot.movingS) : null) },
  { id: 'intervalLeft', label: 'Interval left', group: 'Time', read: (s) => (s.ride.plan?.segmentRemainingS == null ? null : formatDuration(Math.ceil(s.ride.plan.segmentRemainingS))) },
  { id: 'workoutLeft', label: 'Workout left', group: 'Time', read: (s) => (s.ride.plan?.remainingS == null ? null : formatDuration(s.ride.plan.remainingS)) },
  { id: 'lapTime', label: 'Lap time', group: 'Time', read: (s) => (s.ride.metrics ? formatDuration(s.ride.metrics.lap.seconds) : null) },
  { id: 'clock', label: 'Time of day', group: 'Time', read: (s) => new Date(s.wall).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) },
  // ---- speed & distance
  { id: 'speed', label: 'Speed', group: 'Speed & distance', unit: 'km/h', accent: SPEED, read: (s) => (s.ride.plan?.speed != null ? Math.round(s.ride.plan.speed * 36) / 10 : s.frame.speedKmh) },
  { id: 'distance', label: 'Distance', group: 'Speed & distance', unit: 'km', read: (s) => (s.ride.snapshot ? (s.ride.snapshot.distanceM / 1000).toFixed(2) : null) },
  { id: 'grade', label: 'Grade', group: 'Speed & distance', unit: '%', read: (s) => {
    const g = s.ride.plan?.grade ?? s.frame.trainer.rawGradePct
    return g === null || g === undefined ? null : g.toFixed(1)
  } },
  // ---- energy
  { id: 'kj', label: 'Work', group: 'Energy', unit: 'kJ', read: (s) => s.ride.snapshot?.kj ?? null },
  { id: 'kcal', label: 'Calories', group: 'Energy', unit: 'kcal', read: (s) => kcal(s.ride.snapshot?.kj), sub: () => 'Estimate (≈ kJ)' },
  { id: 'carbs', label: 'Carbs burned', group: 'Energy', unit: 'g', read: (s) => {
    const k = kcal(s.ride.snapshot?.kj)
    return k === null ? null : Math.round((k * carbShare(s.ride.metrics?.if ?? null)) / 4)
  }, sub: () => 'Estimate' },
  // ---- trainer
  { id: 'mode', label: 'Trainer mode', group: 'Trainer', read: (s) => ({ idle: 'Idle', erg: 'ERG', resistance: 'Level', sim: 'Slope', hr: 'HR' })[s.frame.trainer.mode] },
  { id: 'trainerTarget', label: 'Sent to trainer', group: 'Trainer', read: (s) => {
    const t = s.frame.trainer
    return t.targetW !== null ? `${t.targetW} W` : t.gradePct !== null ? `${t.gradePct.toFixed(1)} %` : t.resistancePct !== null ? `L ${Math.round(t.resistancePct)} %` : null
  } },
  { id: 'intensity', label: 'Intensity', group: 'Trainer', unit: '%', read: (s) => s.frame.trainer.intensityPct },
  // ---- body
  { id: 'coreTemp', label: 'Core temp', group: 'Body', unit: '°C', read: (s) => (s.frame.coreTemp === null ? null : s.frame.coreTemp.toFixed(1)) },
]

export const WIDGET_BY_ID: ReadonlyMap<string, WidgetDef> = new Map(WIDGETS.map((w) => [w.id, w]))

export type HudView = 'free' | 'workout' | 'route'

export interface HudPreset {
  id: string
  name: string
  tiles: string[]
}

export const PRESETS: readonly HudPreset[] = [
  { id: 'workout', name: 'Workout', tiles: ['hr', 'cadence', 'lapPower', 'np', 'tss', 'kj', 'wbal', 'workoutLeft'] },
  { id: 'data', name: 'Everything', tiles: ['hr', 'cadence', 'power10s', 'power30s', 'lapPower', 'avgPower', 'np', 'if', 'tss', 'kj', 'wbal', 'wkg', 'pctFtp', 'powerZone', 'hrZone', 'decoupling', 'moving', 'workoutLeft', 'speed', 'distance', 'carbs', 'balance'] },
  { id: 'ftp', name: 'FTP test', tiles: ['hr', 'cadence', 'power10s', 'power30s', 'lapPower', 'wbal', 'pctMaxHr', 'intervalLeft'] },
  { id: 'route', name: 'Route', tiles: ['hr', 'cadence', 'speed', 'distance', 'grade', 'np', 'kj', 'moving'] },
  { id: 'minimal', name: 'Minimal', tiles: ['hr', 'cadence', 'np', 'moving'] },
]

export const DEFAULT_LAYOUT: Record<HudView, string[]> = {
  free: ['cadence', 'hr', 'power10s', 'speed', 'np', 'tss', 'kj', 'moving'],
  workout: PRESETS[0]!.tiles,
  route: PRESETS[3]!.tiles,
}
