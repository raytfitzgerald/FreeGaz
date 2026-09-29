import { useRide } from '../../stores/ride'
import { FreeRidePage } from './FreeRidePage'
import { WorkoutRideView } from './WorkoutRideView'

/** /ride: the workout HUD while a workout plays, otherwise "just ride". */
export function RidePage() {
  const workout = useRide((s) => s.workout !== null)
  return workout ? <WorkoutRideView /> : <FreeRidePage />
}
