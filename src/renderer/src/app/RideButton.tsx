import { Link } from '@tanstack/react-router'
import { useRide } from '../stores/ride'
import { cn } from '../ui/cn'
import { formatDuration } from '../ui/format'
import { useReducedMotion } from '../ui/use-reduced-motion'

// The Ride button: the one big thing at the top of the sidebar, above Home.
// A Stayer Blue (by day) / Côte d'Azur (at night) tile with the velodrome
// from above; while a ride records, a rider laps the track and the button
// shows the moving time next to a pulsing dot, so it's also the way back to
// the ride.

const OVAL = 'M16 4 H34 A12 12 0 0 1 34 28 H16 A12 12 0 0 1 16 4 Z'

function Track({ riding, moving }: { riding: boolean; moving: boolean }) {
  return (
    <svg viewBox="0 0 50 32" className="h-7 w-11 shrink-0" aria-hidden>
      <path d="M16 9 H34 A7 7 0 0 1 34 23 H16 A7 7 0 0 1 16 9 Z" fill="currentColor" opacity={0.18} />
      <path d={OVAL} fill="none" stroke="currentColor" strokeWidth={3} />
      <circle r={3.4} fill="currentColor" cx={riding && moving ? 0 : 38} cy={riding && moving ? 0 : 5.5}>
        {riding && moving && <animateMotion dur="2.8s" repeatCount="indefinite" path={OVAL} />}
      </circle>
    </svg>
  )
}

export function RideButton() {
  const active = useRide((s) => s.active)
  const state = useRide((s) => s.snapshot?.state ?? 'idle')
  const movingS = useRide((s) => s.snapshot?.movingS ?? 0)
  const reduced = useReducedMotion()
  const paused = state === 'paused'
  const status = !active ? 'Pick a ride' : `${paused ? 'Paused ' : ''}${formatDuration(movingS)}`
  return (
    <Link
      to="/ride"
      aria-label="Ride"
      aria-describedby="ride-button-status"
      data-testid="ride-button"
      data-recording={active || undefined}
      className={cn(
        'no-drag mx-2 mb-4 flex items-center gap-2.5 rounded-xl bg-accent px-3 py-3 text-on-accent shadow-sm transition-colors',
        'hover:bg-accent/90 active:bg-accent-dim',
      )}
      activeProps={{ className: 'ring-2 ring-accent ring-offset-2 ring-offset-panel' }}
    >
      <Track riding={active} moving={!paused && !reduced} />
      <span className="min-w-0">
        <span className="block font-display text-2xl font-bold italic leading-none tracking-wide">Ride</span>
        <span id="ride-button-status" className="mt-1 flex items-center gap-1.5 text-xs font-semibold leading-none">
          {active && <span className={cn('size-2 shrink-0 rounded-full bg-on-accent', !paused && !reduced && 'animate-pulse')} aria-hidden />}
          {active && !paused && <span className="sr-only">Recording, </span>}
          <span className="truncate tabular">{status}</span>
        </span>
      </span>
    </Link>
  )
}
