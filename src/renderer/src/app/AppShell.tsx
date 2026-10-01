import { Link, Outlet } from '@tanstack/react-router'
import { Wordmark } from '../brand/Wordmark'
import { NAV } from './nav'
import { RideButton } from './RideButton'
import { cn } from '../ui/cn'
import { ChooserDialog } from '../features/devices/ChooserDialog'
import { DeviceStatusBar } from '../features/devices/DeviceStatusBar'
import { RecoveryBanner } from '../features/ride/RecoveryBanner'
import { ReportBugDialog, ReportBugLink } from '../features/support/ReportBugDialog'
import { UpdateReadyLink } from '../features/updates/UpdatesField'
import { useGlobalHotkeys } from './hotkeys'
import { ToastHost } from './ToastHost'
import { MobileTabBar, MobileTopBar } from './MobileNav'

export function AppShell() {
  useGlobalHotkeys()
  return (
    <div className="flex h-full flex-col md:flex-row">
      <MobileTopBar />
      <aside className="hidden md:flex w-[208px] shrink-0 flex-col border-r border-line bg-panel">
        {/* traffic-light gutter + window drag area */}
        <div className="drag-region h-11" />
        <div className="px-5 pb-5 pt-1">
          <Wordmark className="h-9 w-auto text-ink" />
        </div>
        <RideButton />
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
              activeProps={{ className: 'bg-panel-3 text-ink [&>svg]:text-accent [&>svg]:opacity-100' }}
            >
              <Icon className="size-4 shrink-0 opacity-80 group-hover:opacity-100" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <UpdateReadyLink />
        <ReportBugLink />
      </aside>
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="drag-region absolute inset-x-0 top-0 z-10 hidden h-11 items-center justify-end px-4 md:flex">
          <DeviceStatusBar />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <RecoveryBanner />
          <Outlet />
        </div>
      </main>
      <MobileTabBar />
      <ChooserDialog />
      <ToastHost />
      <ReportBugDialog />
    </div>
  )
}

