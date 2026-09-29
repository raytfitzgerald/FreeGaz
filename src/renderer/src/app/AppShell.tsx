import { Link, Outlet } from '@tanstack/react-router'
import { NAV } from './nav'
import { cn } from '../ui/cn'
import { ChooserDialog } from '../features/devices/ChooserDialog'
import { DeviceStatusBar } from '../features/devices/DeviceStatusBar'
import { RecoveryBanner } from '../features/ride/RecoveryBanner'
import { useGlobalHotkeys } from './hotkeys'

export function AppShell() {
  useGlobalHotkeys()
  return (
    <div className="flex h-full">
      <aside className="flex w-[208px] shrink-0 flex-col border-r border-line bg-panel">
        {/* traffic-light gutter + window drag area */}
        <div className="drag-region h-11" />
        <div className="px-4 pb-4">
          <Wordmark />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === '/' }}
              className={cn(
                'no-drag group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-dim transition-colors',
                'hover:bg-panel-2 hover:text-ink',
              )}
              activeProps={{ className: 'bg-panel-3 text-ink' }}
            >
              <Icon className="size-4 shrink-0 opacity-80 group-hover:opacity-100" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-3 text-[11px] leading-tight text-ink-faint">
          Not affiliated with FulGaz, Zwift, TrainerRoad, Wahoo, Garmin or Strava.
        </div>
      </aside>
      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="drag-region absolute inset-x-0 top-0 z-10 flex h-11 items-center justify-end px-4">
          <DeviceStatusBar />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <RecoveryBanner />
          <Outlet />
        </div>
      </main>
      <ChooserDialog />
    </div>
  )
}

function Wordmark() {
  return (
    <div className="flex items-baseline gap-1 font-display">
      <span className="text-xl font-black tracking-tight text-ink">Free</span>
      <span className="bg-gradient-to-r from-accent to-z5 bg-clip-text text-xl font-black tracking-tight text-transparent">
        Gaz
      </span>
    </div>
  )
}
