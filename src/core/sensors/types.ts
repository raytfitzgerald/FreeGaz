// Normalized sensor data flowing from device drivers into the SensorHub.

/** Scalar metrics a device can report. Units are fixed per metric. */
export type Metric =
  | 'power' // W
  | 'cadence' // rpm
  | 'speed' // m/s (trainer-reported wheel speed, not virtual speed)
  | 'hr' // bpm
  | 'lrBalance' // % left leg (0-100)
  | 'torqueEffectivenessL' // %
  | 'torqueEffectivenessR' // %
  | 'pedalSmoothnessL' // %
  | 'pedalSmoothnessR' // %
  | 'coreTemp' // °C
  | 'skinTemp' // °C
  | 'heatStrain' // index 0-10
  | 'smo2' // %
  | 'thb' // g/dL
  | 'resistanceLevel' // trainer-reported level (device units)
  | 'battery' // %

export const METRIC_UNITS: Record<Metric, string> = {
  power: 'W',
  cadence: 'rpm',
  speed: 'm/s',
  hr: 'bpm',
  lrBalance: '%',
  torqueEffectivenessL: '%',
  torqueEffectivenessR: '%',
  pedalSmoothnessL: '%',
  pedalSmoothnessR: '%',
  coreTemp: '°C',
  skinTemp: '°C',
  heatStrain: '',
  smo2: '%',
  thb: 'g/dL',
  resistanceLevel: '',
  battery: '%',
}

/** One measurement from one source at one instant (monotonic clock ms). */
export interface SensorSample {
  metric: Metric
  value: number
  tMono: number
  /** Stable id of the device/driver that produced it, e.g. "trainer:ftms". */
  sourceId: string
}

/** Beat-to-beat intervals from a HR strap, oldest first. */
export interface RrBatch {
  rrMs: number[]
  tMono: number
  sourceId: string
}
