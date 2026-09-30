import { useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Bug, Menu } from 'lucide-react'
import { Wordmark } from '../brand/Wordmark'
import { DeviceStatusBar } from '../features/devices/DeviceStatusBar'
import { openBugReport } from '../features/support/open'
import { useRide } from '../stores/ride'
import { Dialog } from '../ui/Dialog'
import { cn } from '../ui/cn'
import { NAV } from './nav'

// Phone layout (under the md breakpoint; the Mac window never gets that
// narrow): a top bar with the wordmark and device chips, and a bottom tab
// bar with Ride as the raised centre button. Tabs that don't fit go in More.

const TABS = new Set(['/', '/workouts', '/coach'])
const [left, right] = [NAV.filter((n) => TABS.has(n.to)).slice(0, 2), NAV.filter((n) => TABS.has(n.to)).slice(2)]
const MORE = NAV.filter((n) => !TABS.has(n.to))

export function MobileTopBar() {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden">
      <Link to="/" aria-label="FreeGaz home">
        <Wordmark className="h-7 w-auto text-ink" />
      </Link>
      <DeviceStatusBar />
    </header>
  )
}

const tabClass = 'flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[11px] text-ink-dim'
const tabActive = { className: 'text-ink [&>svg]:text-accent' }

function MobileRideTab() {
  const active = useRide((s) => s.active)
  return (
    <Link to="/ride" aria-label="Ride" className="-mt-5 flex flex-1 flex-col items-center gap-1 text-[11px] font-semibold text-ink">
      <span className="relative flex size-14 items-center justify-center rounded-full bg-accent font-display text-lg font-bold italic text-on-accent shadow-lg ring-4 ring-panel">
        Ride
        {active && <span className="absolute right-1 top-1 size-2.5 rounded-full bg-on-accent motion-safe:animate-pulse" aria-hidden />}
      </span>
      {active ? 'Recording' : 'Pick a ride'}
    </Link>
  )
}

export function MobileTabBar() {
  const [more, setMore] = useState(false)
  const path = useRouterState({ select: (s) => s.location.pathname })
  const inMore = MORE.some((n) => path.startsWith(n.to))
  const tab = ({ to, label, icon: Icon }: (typeof NAV)[number]) => (
    <Link key={to} to={to} activeOptions={{ exact: to === '/' }} className={tabClass} activeProps={tabActive}>
      <Icon className="size-5" aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  )
  return (
    <>
      <nav aria-label="Tabs" className="flex shrink-0 items-start border-t border-line bg-panel px-1 pb-[env(safe-area-inset-bottom)] md:hidden">
        {left.map(tab)}
        <MobileRideTab />
        {right.map(tab)}
        <button type="button" onClick={() => setMore(true)} className={cn(tabClass, inMore && 'text-ink [&>svg]:text-accent')}>
          <Menu className="size-5" aria-hidden />
          More
        </button>
      </nav>
      <Dialog open={more} onOpenChange={setMore} title="More">
        <div className="grid grid-cols-2 gap-2">
          {MORE.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMore(false)}
              className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 px-3 py-3 text-sm text-ink-dim"
              activeProps={{ className: 'border-accent text-ink' }}
            >
              <Icon className="size-4 text-accent" aria-hidden />
              {label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => {
              setMore(false)
              openBugReport()
            }}
            className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 px-3 py-3 text-sm text-ink-dim"
          >
            <Bug className="size-4" aria-hidden /> Report a bug
          </button>
        </div>
      </Dialog>
    </>
  )
}
