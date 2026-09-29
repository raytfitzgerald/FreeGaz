// Starting a route ride, and keeping what a later Challenge needs from it.
import { RoutePlan } from '@core/ride/route-plan'
import type { RideSession } from '@core/ride/session'
import type { Route } from '@core/routes/model'
import type { GhostSample, RouteMode } from '@core/routes/player'
import { athleteSnapshot } from '../db/athlete-repo'
import { getRuntime } from '../runtime/composition'
import { settingsStore } from '../stores/settings'
import { loadGhost, noteRouteRide, recordedGhost, saveRouteRideGhost } from './routes-repo'

/** The effort a Challenge races: a previous ride on the route, or the route file's own recorded pace. */
export type GhostChoice = { kind: 'ride'; rideId: string; label: string } | { kind: 'recorded' }

export interface RouteRideOptions {
  mode: RouteMode
  /** Loop routes only. */
  laps?: number
  /** Challenge only. */
  ghost?: GhostChoice
}

/** Starts recording a ride on `route` with the rider's weight and bike. Resolves once the ride is running. */
export async function startRouteRide(route: Route, opts: RouteRideOptions): Promise<RoutePlan> {
  const rt = getRuntime()
  if (rt.rides.active) throw new Error('Finish the ride in progress first.')
  const [athlete, ghost] = await Promise.all([athleteSnapshot(), opts.mode === 'challenge' ? resolveGhost(route, opts) : null])
  if (opts.mode === 'challenge' && !ghost) throw new Error('That effort has no distance recorded, so there is nothing to race.')
  const t = settingsStore.getState().trainer
  const plan = new RoutePlan(route, {
    mode: opts.mode,
    laps: opts.laps,
    rider: { riderKg: athlete.weightKg, bikeKg: t.bikeKg, cda: t.cda, crr: t.crr, ftpW: athlete.ftpW },
    ghost: ghost?.samples,
    ghostLabel: ghost?.label,
  })
  const off = rt.rides.onSessionStart((session) => {
    if (session.options.plan === plan) keepGhost(session, plan)
  })
  try {
    await rt.rides.start({ plan })
  } finally {
    off()
  }
  return plan
}

async function resolveGhost(route: Route, opts: RouteRideOptions): Promise<{ samples: GhostSample[]; label: string } | null> {
  const choice = opts.ghost
  if (!choice) return null
  if (choice.kind === 'recorded') {
    const samples = recordedGhost(route, opts.laps ?? 1)
    return samples ? { samples, label: 'The recorded pace' } : null
  }
  const samples = await loadGhost(choice.rideId)
  return samples ? { samples, label: choice.label } : null
}

/**
 * Links the ride to its route as it starts, and stores its ghost when it
 * ends. A discarded ride leaves a small index row behind that the library
 * ignores (its ride no longer exists).
 */
function keepGhost(session: RideSession, plan: RoutePlan): void {
  void noteRouteRide({ rideId: session.rideId, routeId: plan.routeId, startedAt: Date.now(), mode: plan.startMode, laps: plan.laps }).catch(() => undefined)
  const off = session.on((e) => {
    if (e.type !== 'state' || e.state !== 'finished') return
    off()
    void saveRouteRideGhost(session.rideId, session.records, { finishS: plan.finishedAtS, totalM: plan.totalM }).catch(() => undefined)
  })
}
