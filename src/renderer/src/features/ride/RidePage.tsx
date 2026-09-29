import { isRouteTick } from '@core/ride/route-plan'
import { useRide } from '../../stores/ride'
import { FreeRidePage } from './FreeRidePage'
import { RouteRideView } from './RouteRideView'
import { WorkoutRideView } from './WorkoutRideView'

/** /ride: the workout HUD while a workout plays, otherwise "just ride". */
export function RidePage() {
  const workout = useRide((s) => s.workout !== null)
  const route = useRide((s) => isRouteTick(s.plan))
  return workout ? <WorkoutRideView /> : route ? <RouteRideView /> : <FreeRidePage />
}
