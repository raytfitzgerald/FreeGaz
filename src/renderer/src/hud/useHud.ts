import { useSyncExternalStore } from 'react'
import type { AthleteSnapshot } from '@core/ride/types'
import { liveStore } from '../stores/live'
import { rideStore } from '../stores/ride'
import { settingsStore } from '../stores/settings'
import type { HudState, WidgetDef } from './catalog'

function subscribeBoth(onChange: () => void): () => void {
  const a = liveStore.subscribe(onChange)
  const b = rideStore.subscribe(onChange)
  const c = settingsStore.subscribe(onChange)
  return () => {
    a()
    b()
    c()
  }
}

function state(athlete: AthleteSnapshot): HudState {
  const frame = liveStore.getState()
  const { units, speedUnit } = settingsStore.getState()
  return { frame, ride: rideStore.getState(), athlete, wall: frame.wall, units, speedUnit }
}

function unitOf(def: WidgetDef, athlete: AthleteSnapshot): string | undefined {
  const u = def.unit
  return typeof u === 'function' ? u(state(athlete)) : u
}

/** A widget's value and caption. Both are primitives, so a tile re-renders only when they change. */
export function useWidget(def: WidgetDef, athlete: AthleteSnapshot): { value: number | string | null; sub: string | undefined; unit: string | undefined } {
  const value = useSyncExternalStore(subscribeBoth, () => def.read(state(athlete)))
  const sub = useSyncExternalStore(subscribeBoth, () => def.sub?.(state(athlete)))
  const unit = useSyncExternalStore(subscribeBoth, () => unitOf(def, athlete))
  return { value, sub, unit }
}
