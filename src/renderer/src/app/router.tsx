import { createHashHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { AppShell } from './AppShell'
import { HomePage } from '../features/home/HomePage'
import { DevicesPage } from '../features/devices/DevicesPage'
import { RidePage } from '../features/ride/RidePage'
import { WorkoutsPage } from '../features/workouts/WorkoutsPage'
import { HistoryPage } from '../features/history/HistoryPage'
import { RideDetailPage } from '../features/history/RideDetailPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { FitnessPage } from '../features/fitness/FitnessPage'
import { CoachChatPage } from '../features/ai/CoachChatPage'
import { PlaceholderPage } from './PlaceholderPage'

const rootRoute = createRootRoute({ component: AppShell })

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })

const page = <P extends string>(path: P, title: string, blurb: string) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => <PlaceholderPage title={title} blurb={blurb} />,
  })

const rideRoute = createRoute({ getParentRoute: () => rootRoute, path: '/ride', component: RidePage })
const workoutsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workouts',
  validateSearch: (s: Record<string, unknown>): { filter?: string } => (typeof s.filter === 'string' ? { filter: s.filter } : {}),
  component: WorkoutsPage,
})
const devicesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/devices', component: DevicesPage })
const historyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/history', component: HistoryPage })
const rideDetailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/history/$rideId', component: RideDetailPage })
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage })
const fitnessRoute = createRoute({ getParentRoute: () => rootRoute, path: '/fitness', component: FitnessPage })
const coachRoute = createRoute({ getParentRoute: () => rootRoute, path: '/coach', component: CoachChatPage })

const routeTree = rootRoute.addChildren([
  homeRoute,
  rideRoute,
  workoutsRoute,
  devicesRoute,
  historyRoute,
  rideDetailRoute,
  settingsRoute,
  fitnessRoute,
  coachRoute,
  page('/builder', 'Workout builder', 'Build .zwo workouts with blocks or text.'),
  page('/routes', 'Routes', 'Import GPX routes and ride them in SIM mode.'),
])

export const router = createRouter({ routeTree, history: createHashHistory(), defaultPreload: false })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
