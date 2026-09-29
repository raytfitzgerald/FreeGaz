import { useMemo } from 'react'
import { RoutePlan } from '@core/ride/route-plan'
import { getRuntime } from '../runtime/composition'
import { useRide } from '../stores/ride'

/** The RoutePlan of the ride `rideId`, if that ride is running and is a route ride. */
export function activeRoutePlan(rideId: string | null): RoutePlan | null {
  if (!rideId) return null
  const session = getRuntime().rides.session
  const plan = session?.rideId === rideId ? session.options.plan : null
  return plan instanceof RoutePlan ? plan : null
}

/** The running route ride's plan (for its static route and the Reactive/Steady switch); live values come from the ride store's tick. */
export function useActiveRoutePlan(): RoutePlan | null {
  const rideId = useRide((s) => s.rideId)
  return useMemo(() => activeRoutePlan(rideId), [rideId])
}
