import { useSyncExternalStore } from 'react'
import type { AthleteSnapshot } from '@core/ride/types'
import { liveStore } from '../stores/live'
import { rideStore } from '../stores/ride'
import type { HudState, WidgetDef } from './catalog'

function subscribeBoth(onChange: () => void): () => void {
  const a = liveStore.subscribe(onChange)
  const b = rideStore.subscribe(onChange)
  return () => {
    a()
    b()
  }
}

function state(athlete: AthleteSnapshot): HudState {
  const frame = liveStore.getState()
  return { frame, ride: rideStore.getState(), athlete, wall: frame.wall }
}

/** A widget's value and caption. Both are primitives, so a tile re-renders only when they change. */
export function useWidget(def: WidgetDef, athlete: AthleteSnapshot): { value: number | string | null; sub: string | undefined } {
  const value = useSyncExternalStore(subscribeBoth, () => def.read(state(athlete)))
  const sub = useSyncExternalStore(subscribeBoth, () => def.sub?.(state(athlete)))
  return { value, sub }
}
