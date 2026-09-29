import { createHashHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { AppShell } from './AppShell'
import { HomePage } from '../features/home/HomePage'
import { PlaceholderPage } from './PlaceholderPage'

const rootRoute = createRootRoute({ component: AppShell })

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })

const page = <P extends string>(path: P, title: string, blurb: string) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => <PlaceholderPage title={title} blurb={blurb} />,
  })

const routeTree = rootRoute.addChildren([
  homeRoute,
  page('/ride', 'Ride', 'Free ride, structured workouts and routes.'),
  page('/workouts', 'Workouts', 'Your library: built-ins, imports and your own creations.'),
  page('/builder', 'Workout builder', 'Build .zwo workouts with blocks or text.'),
  page('/routes', 'Routes', 'Import GPX routes and ride them in SIM mode.'),
  page('/history', 'History', 'Every ride, every second, stored locally.'),
  page('/fitness', 'Fitness', 'FTP over time, power curve and training load.'),
  page('/devices', 'Devices', 'Trainer, heart rate and friends.'),
  page('/settings', 'Settings', 'Profile, zones, integrations and AI.'),
])

export const router = createRouter({ routeTree, history: createHashHistory(), defaultPreload: false })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
