// IndexedDB (via Dexie). The main window is the only connection owner, so
// schema upgrades never block on another open tab/window.
import Dexie, { type EntityTable } from 'dexie'
import type { RideStreams } from '@core/ride/streams'
import type { RideSummary } from '@core/ride/types'
import type { Workout } from '@core/workout/model'

export interface StoredWorkout {
  id: string
  name: string
  source: Workout['source']
  tags: string[]
  durationS: number
  tss: number | null
  favorite: boolean
  json: Workout
  createdAt: number
  updatedAt: number
}

export interface FtpEntry {
  id?: number
  /** Epoch ms the FTP became effective. */
  date: number
  ftpW: number
  source: 'test-20min' | 'test-ramp' | 'test-8min' | 'test-kolie' | 'manual' | 'estimate'
  rideId?: string
  basisW?: number
  weightKg?: number
  notes?: string
}

export interface ProfileEntry {
  id?: number
  /** Effective from (epoch ms). The latest entry at or before a date applies. */
  from: number
  weightKg: number
  lthr?: number
  maxHr?: number
  restHr?: number
  cpW?: number
  wPrimeJ?: number
  heightCm?: number
  birthYear?: number
}

export interface KvEntry {
  key: string
  value: unknown
}

export class FreeGazDb extends Dexie {
  rides!: EntityTable<RideSummary, 'id'>
  rideStreams!: EntityTable<RideStreams, 'rideId'>
  workouts!: EntityTable<StoredWorkout, 'id'>
  ftpHistory!: EntityTable<FtpEntry, 'id'>
  profile!: EntityTable<ProfileEntry, 'id'>
  kv!: EntityTable<KvEntry, 'key'>

  constructor(name = 'freegaz') {
    super(name)
    this.version(1).stores({
      rides: 'id, startedAt, kind, simulated, workoutId',
      rideStreams: 'rideId',
      workouts: 'id, name, source, updatedAt, favorite, *tags',
      ftpHistory: '++id, date, source',
      profile: '++id, from',
      kv: 'key',
    })
  }
}

let instance: FreeGazDb | null = null

export function db(): FreeGazDb {
  instance ??= new FreeGazDb()
  return instance
}

/** Ask Chromium not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
