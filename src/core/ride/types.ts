// Persistent ride types (stored in IndexedDB by the renderer).

export type RideKind = 'free' | 'workout' | 'route' | 'ftp-test'

/** Athlete values snapshotted at ride start so history never gets rewritten. */
export interface AthleteSnapshot {
  ftpW: number
  weightKg: number
  lthr?: number
  maxHr?: number
  restHr?: number
  cpW?: number
  wPrimeJ?: number
}

export interface LapRow {
  index: number
  startIndex: number
  endIndex: number
  durationS: number
  label?: string
  avgPower: number | null
  maxPower: number | null
  np: number | null
  avgHr: number | null
  maxHr: number | null
  avgCadence: number | null
  maxCadence: number | null
  distanceM: number
  kj: number
  targetW: number | null
}

export interface RideSummary {
  id: string
  name: string
  kind: RideKind
  /** Simulator / time-warp rides never reach Strava, PMC or FTP auto-save. */
  simulated: boolean
  startedAt: number
  endedAt: number
  elapsedS: number
  movingS: number
  distanceM: number
  elevationGainM: number | null
  avgPower: number | null
  maxPower: number | null
  np: number | null
  intensityFactor: number | null
  tss: number | null
  kj: number
  vi: number | null
  wkg: number | null
  avgHr: number | null
  maxHr: number | null
  avgCadence: number | null
  maxCadence: number | null
  avgSpeed: number | null
  maxSpeed: number | null
  ef: number | null
  decouplingPct: number | null
  powerZonesS: number[]
  hrZonesS: number[]
  mmp: { durationS: number; watts: number }[]
  laps: LapRow[]
  athlete: AthleteSnapshot
  workoutId?: string
  workoutName?: string
  /** Copy of the workout as ridden (JSON), so history survives edits. */
  workoutJson?: string
  ftpTest?: { protocol: string; ftpW: number; basisW: number; valid: boolean; problems: string[]; applied: boolean }
  rpe?: number
  feel?: 1 | 2 | 3 | 4 | 5
  notes?: string
  /** Imported from a FIT file (Garmin, Wahoo, another app): not re-exported or uploaded. */
  imported?: { fileName: string; device?: string }
  /** AI post-ride debrief (markdown), cached once generated. */
  debrief?: string
  fit?: { fileName: string; path?: string; bytes: number }
  uploads?: {
    strava?: { status: 'queued' | 'uploading' | 'done' | 'error' | 'skipped'; activityId?: string; error?: string; at?: number }
    intervals?: { status: 'queued' | 'uploading' | 'done' | 'error' | 'skipped'; activityId?: string; error?: string; at?: number }
  }
  recovered?: boolean
  createdAt: number
  updatedAt: number
}
