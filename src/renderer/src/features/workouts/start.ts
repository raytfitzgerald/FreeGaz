import { WorkoutPlan } from '@core/ride/workout-plan'
import type { Workout } from '@core/workout/model'
import { athleteSnapshot } from '../../db/athlete-repo'
import { getRuntime } from '../../runtime/composition'

/** Starts recording a ride that plays `workout` at the rider's current FTP. */
export async function startWorkout(workout: Workout): Promise<void> {
  const rt = getRuntime()
  if (rt.rides.active) throw new Error('Finish the ride in progress first.')
  const { ftpW } = await athleteSnapshot()
  await rt.rides.start({ plan: new WorkoutPlan(workout, { ftpW }) })
}
