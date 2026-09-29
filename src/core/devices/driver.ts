// Driver contracts. A driver speaks one GATT protocol (FTMS, HRS, CPS...) on
// top of a GattSession and pushes normalized samples into the SensorHub via
// its DriverContext. Drivers are re-attached with a fresh session after every
// reconnect, so attach() must be idempotent and (re)subscribe everything.
import type { GattSession, Uuid } from '../ble/transport'
import type { Metric } from '../sensors/types'
import type { CommandResult, DeviceRole, DriverKind, TrainerCaps, TrainerCommand } from './types'

export interface CaptureEntry {
  tMono: number
  sourceId: string
  dir: 'rx' | 'tx'
  service: Uuid
  characteristic: Uuid
  hex: string
}

export interface DriverContext {
  /** e.g. "trainer:ftms" — the SensorHub source id for this driver. */
  readonly sourceId: string
  now(): number
  emit(metric: Metric, value: number, tMono?: number): void
  emitRr(rrMs: number[], tMono?: number): void
  capture(entry: Omit<CaptureEntry, 'tMono' | 'sourceId'>): void
  warn(message: string): void
}

export interface Driver {
  readonly kind: DriverKind
  readonly role: DeviceRole
  attach(session: GattSession, ctx: DriverContext): Promise<void>
  /** Stop timers/subscriptions. The session may already be gone. */
  detach(): void
}

export interface TrainerDriver extends Driver {
  readonly caps: TrainerCaps
  send(cmd: TrainerCommand): Promise<CommandResult>
  /** Another client (Zwift, Wahoo app, head unit) took control of the trainer. */
  onControlLost(listener: () => void): () => void
}

export interface FanDriver extends Driver {
  setSpeed(pct: number): Promise<CommandResult>
}

export const isTrainerDriver = (d: Driver): d is TrainerDriver => 'send' in d && 'caps' in d
export const isFanDriver = (d: Driver): d is FanDriver => 'setSpeed' in d

/** Chooses and constructs the right driver(s) for a freshly connected device. */
export type DriverFactory = (session: GattSession, role: DeviceRole) => Promise<Driver[]>

export const sourceIdFor = (role: DeviceRole, kind: DriverKind): string => `${role}:${kind}`
