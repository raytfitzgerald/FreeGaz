// The 6-byte Simulation Parameter Array shared by control point op 0x11 and
// Fitness Machine Status op 0x12 (FTMS v1.0 Table 4.20). Internal: ftms.ts
// re-exports only the type.

import { type ByteReader, type ByteWriter } from './bytes'

export interface SimulationParams {
  /** Headwind positive, m/s (resolution 0.001). */
  windMps: number
  /** Grade, % (0.01). */
  gradePct: number
  /** Coefficient of rolling resistance (0.0001). */
  crr: number
  /** Wind resistance coefficient, kg/m (0.01). */
  cwKgPerM: number
}

export function writeSimulation(w: ByteWriter, p: SimulationParams): ByteWriter {
  return w
    .sint16(p.windMps * 1000, 'windMps')
    .sint16(p.gradePct * 100, 'gradePct')
    .uint8(p.crr * 10000, 'crr')
    .uint8(p.cwKgPerM * 100, 'cwKgPerM')
}

export function readSimulation(r: ByteReader): SimulationParams {
  return {
    windMps: r.sint16('wind speed') / 1000,
    gradePct: r.sint16('grade') / 100,
    crr: r.uint8('crr') / 10000,
    cwKgPerM: r.uint8('cw') / 100,
  }
}
