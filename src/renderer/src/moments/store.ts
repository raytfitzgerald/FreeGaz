// The ride's best moments so far, held in memory until the ride is saved.
import { createStore } from 'zustand'
import type { MomentKind } from '@core/ride/moment-picker'

export interface Moment {
  kind: MomentKind
  bytes: Uint8Array
  /** An object URL for the thumbnail. */
  url: string
  caption: string
}

export interface SavedMoment {
  kind: MomentKind
  path: string
  url: string
  caption: string
}

export const momentsStore = createStore<{ rideId: string | null; moments: Partial<Record<MomentKind, Moment>> }>(() => ({ rideId: null, moments: {} }))

/** Keeps `m` as the ride's moment of its kind, replacing (and releasing) the last one. */
export function keepMoment(rideId: string, m: Omit<Moment, 'url'>): void {
  const { rideId: current, moments } = momentsStore.getState()
  const kept = current === rideId ? moments : {}
  const old = kept[m.kind]
  if (old) URL.revokeObjectURL(old.url)
  const url = URL.createObjectURL(new Blob([m.bytes.slice()], { type: 'image/jpeg' }))
  momentsStore.setState({ rideId, moments: { ...kept, [m.kind]: { ...m, url } } })
}

/** The ride's moments, taken out of the store (their URLs now belong to the caller). */
export function takeMoments(rideId: string): Moment[] {
  const { rideId: current, moments } = momentsStore.getState()
  momentsStore.setState({ rideId: null, moments: {} })
  if (current !== rideId) return []
  return (['hard', 'coach'] as const).map((k) => moments[k]).filter((m): m is Moment => m !== undefined)
}

/** Drops a discarded ride's moments. */
export function dropMoments(): void {
  for (const m of Object.values(momentsStore.getState().moments)) URL.revokeObjectURL(m.url)
  momentsStore.setState({ rideId: null, moments: {} })
}
