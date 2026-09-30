// Which kind of ride the Ride tab is set up for. Nothing is chosen when the
// app opens, so the tab starts on the picker; a ride that starts (from here,
// the Workouts page or a route) sets it, so its saved-ride card shows on the
// right screen afterwards.
import { createStore, useStore } from 'zustand'

export type RideChoice = 'time' | 'free' | 'route' | 'workout'

export const RIDE_CHOICES: readonly RideChoice[] = ['time', 'free', 'route', 'workout']

export const rideSetupStore = createStore<{ choice: RideChoice | null }>(() => ({ choice: null }))

export function useRideChoice(): RideChoice | null {
  return useStore(rideSetupStore, (s) => s.choice)
}

export function chooseRide(choice: RideChoice | null): void {
  if (rideSetupStore.getState().choice !== choice) rideSetupStore.setState({ choice })
}

export function isRideChoice(v: unknown): v is RideChoice {
  return typeof v === 'string' && (RIDE_CHOICES as readonly string[]).includes(v)
}
