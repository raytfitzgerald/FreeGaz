// Device-level types shared by drivers, the device manager and the UI.

export type DeviceRole = 'trainer' | 'hr' | 'power' | 'cadence' | 'coreTemp' | 'smo2' | 'fan'

export const ROLE_LABEL: Record<DeviceRole, string> = {
  trainer: 'Smart trainer',
  hr: 'Heart rate',
  power: 'Power meter',
  cadence: 'Cadence / speed',
  coreTemp: 'Core temperature',
  smo2: 'Muscle oxygen',
  fan: 'Fan',
}

export type DriverKind =
  | 'ftms' // Bluetooth Fitness Machine Service trainer
  | 'wahoo-legacy' // Wahoo proprietary trainer control (fallback)
  | 'hrs' // Heart Rate Service
  | 'cps' // Cycling Power Service (power meter)
  | 'csc' // Cycling Speed & Cadence
  | 'core' // CORE body temperature
  | 'moxy' // Moxy SmO2
  | 'headwind' // Wahoo KICKR Headwind

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'

export interface DeviceInfo {
  manufacturer?: string
  model?: string
  hardware?: string
  firmware?: string
  software?: string
}

/** Commands the trainer controller can issue; drivers translate them to wire protocol. */
export type TrainerCommand =
  | { kind: 'erg'; watts: number }
  | { kind: 'resistance'; /** 0-100 % of the trainer's range */ pct: number }
  | { kind: 'sim'; gradePct: number; windMps: number; crr: number; /** wind resistance coefficient kg/m (= 0.5·ρ·CdA) */ cwKgPerM: number }
  | { kind: 'idle' }

export type CommandResult = 'ok' | 'rejected' | 'not-permitted' | 'unsupported' | 'timeout' | 'disconnected'

export interface Range {
  min: number
  max: number
  step: number
}

export interface TrainerCaps {
  erg: boolean
  sim: boolean
  resistance: boolean
  spinDown: boolean
  powerRange?: Range
  resistanceRange?: Range
}

/** Persisted memory of a paired device, so it can be auto-selected next launch. */
export interface RememberedDevice {
  role: DeviceRole
  /** Id reported by the platform chooser (Electron select-bluetooth-device deviceId). */
  chooserId: string
  name: string
  lastConnectedAt: number
}
