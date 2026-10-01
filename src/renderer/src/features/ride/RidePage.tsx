import { useEffect } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { isRouteTick } from '@core/ride/route-plan'
import { TIME_RIDE_ID } from '@core/workout/time-ride'
import { useRide } from '../../stores/ride'
import { FreeRidePage } from './FreeRidePage'
import { RideLauncher } from './RideLauncher'
import { RouteRideView } from './RouteRideView'
import { WorkoutRideView } from './WorkoutRideView'
import { useRideMoments } from '../../moments/useRideMoments'
import { chooseRide, isRideChoice, useRideChoice, type RideChoice } from './setup'

/**
 * /ride: the ride that is on (workout, route or free ride), or, with none,
 * the picker for what kind of ride to set up. A free ride chosen there stays
 * on the Just ride screen, where sensors still show live before recording.
 */
export function RidePage() {
  const active = useRide((s) => s.active)
  const workout = useRide((s) => s.workout !== null)
  const route = useRide((s) => isRouteTick(s.plan))
  const kind = useRide<RideChoice | null>((s) => (!s.active ? null : s.workout ? (s.workout.plan.workoutId === TIME_RIDE_ID ? 'time' : 'workout') : isRouteTick(s.plan) ? 'route' : 'free'))
  const choice = useRideChoice()
  const { choose } = useSearch({ from: '/ride' })
  const navigate = useNavigate()
  useRideMoments()

  // a link can pick the kind (Home's "Just ride" goes straight to a free ride)
  useEffect(() => {
    if (!isRideChoice(choose)) return
    chooseRide(choose)
    void navigate({ to: '/ride', search: {}, replace: true })
  }, [choose, navigate])
  // whatever ride is on decides the kind, so its saved card lands on the matching screen afterwards
  useEffect(() => {
    if (kind) chooseRide(kind)
  }, [kind])

  if (workout) return <WorkoutRideView />
  if (route) return <RouteRideView />
  if (active || choice === 'free') return <FreeRidePage />
  return <RideLauncher choice={choice} />
}
