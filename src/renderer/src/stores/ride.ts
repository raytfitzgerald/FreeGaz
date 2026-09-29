import { createStore, useStore } from 'zustand'
import type { FtpUpdateDecision } from '@core/ride/ftp-update'
import type { PlanTick, RescueOffer } from '@core/ride/plan'
import type { RideSession } from '@core/ride/session'
import type { WorkoutPlan } from '@core/ride/workout-plan'
import type { FtpTestResult } from '@core/workout/ftp-tests'
import type { FtpTestProtocol } from '@core/workout/model'
import type { SaveResult, PendingRecovery } from '../db/rides-repo'
import type { LiveRide } from '@shared/live'

export interface Toast {
  id: number
  tone: 'pr' | 'fuel' | 'info'
  title: string
  body?: string
  at: number
}

export interface FtpTestOutcome {
  rideId: string
  testName: string
  protocol: FtpTestProtocol
  simulated: boolean
  result: FtpTestResult
  decision: FtpUpdateDecision
  previousFtpW: number | null
  /** Set once the new FTP is saved (auto or by the rider): the history row, for undo. */
  savedEntryId: number | null
}

interface RideStoreState {
  /** A ride is recording (riding or paused). */
  active: boolean
  rideId: string | null
  snapshot: LiveRide | null
  metrics: ReturnType<RideSession['liveMetrics']> | null
  lastSaved: SaveResult | null
  saving: boolean
  error: string | null
  recoveries: PendingRecovery[]
  cue: { text: string; at: number } | null
  /** The player's latest tick (updated at the engine rate while a plan runs). */
  plan: PlanTick | null
  /** The workout being ridden, with its timeline revision (bumped by extend/rescue). */
  workout: { plan: WorkoutPlan; rev: number } | null
  /** Recorded power per second of workout timeline (for the chart overlay). */
  actual: (number | null)[] | null
  rescue: (RescueOffer & { at: number }) | null
  planFinished: boolean
  ftpTest: FtpTestOutcome | null
  toasts: Toast[]
}

export const rideStore = createStore<RideStoreState>(() => ({
  active: false,
  rideId: null,
  snapshot: null,
  metrics: null,
  lastSaved: null,
  saving: false,
  error: null,
  recoveries: [],
  cue: null,
  plan: null,
  workout: null,
  actual: null,
  rescue: null,
  planFinished: false,
  ftpTest: null,
  toasts: [],
}))

let toastSeq = 0
/** Shows a toast (the newest three stay on screen, each for ~8 s). */
export function pushToast(t: Omit<Toast, 'id' | 'at'>): void {
  rideStore.setState((s) => ({ toasts: [...s.toasts, { ...t, id: ++toastSeq, at: Date.now() }].slice(-3) }))
}
export function dismissToast(id: number): void {
  rideStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}

export function useRide<T>(selector: (s: RideStoreState) => T): T {
  return useStore(rideStore, selector)
}
