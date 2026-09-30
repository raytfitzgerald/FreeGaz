import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from '@tanstack/react-router'
import { Bike, ChevronLeft, ChevronRight, FlaskConical, Gauge, Mountain } from 'lucide-react'
import { db } from '../../db/db'
import { Button } from '../../ui/Button'
import { cn } from '../../ui/cn'
import { formatDurationShort } from '../../ui/format'
import { calendarMonth, loadBand, shiftMonth } from './calendar'

const KIND_ICON = { free: Bike, workout: Gauge, route: Mountain, 'ftp-test': FlaskConical } as const
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const DAY = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
/** Day shading by load (TSS): nothing, light, solid, big day. The number is always shown too. */
const BAND = ['', 'bg-accent/5', 'bg-accent/10', 'bg-accent/20'] as const
const MAX_CHIPS = 3

/** A month at a time: each day's rides as chips, shaded by the day's load, with week and month totals. */
export function RideCalendar() {
  const [[year, month], setMonth] = useState<[number, number]>(() => {
    const d = new Date()
    return [d.getFullYear(), d.getMonth()]
  })
  const navigate = useNavigate()
  // the grid reaches a few days into the months either side
  const from = new Date(year, month, -7).getTime()
  const to = new Date(year, month + 1, 8).getTime()
  const rides = useLiveQuery(() => db().rides.where('startedAt').between(from, to).toArray(), [from, to])
  const m = calendarMonth(year, month, rides ?? [])
  const now = new Date()
  const isThisMonth = year === now.getFullYear() && month === now.getMonth()

  return (
    <div className="rounded-2xl border border-line bg-panel" data-testid="ride-calendar">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-1">
          <Button size="iconSm" variant="ghost" onClick={() => setMonth(shiftMonth(year, month, -1))} aria-label="Previous month" data-testid="calendar-prev">
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="min-w-44 text-center font-display text-lg font-semibold" data-testid="calendar-month">
            {MONTH.format(new Date(year, month, 1))}
          </h2>
          <Button size="iconSm" variant="ghost" onClick={() => setMonth(shiftMonth(year, month, 1))} aria-label="Next month" data-testid="calendar-next">
            <ChevronRight className="size-4" />
          </Button>
          {!isThisMonth && (
            <Button size="sm" variant="ghost" onClick={() => setMonth([now.getFullYear(), now.getMonth()])}>
              Today
            </Button>
          )}
        </div>
        <div className="tabular text-sm text-ink-dim" data-testid="calendar-summary">
          {m.rides} ride{m.rides === 1 ? '' : 's'} · {formatDurationShort(m.movingS)} · {Math.round(m.tss)} TSS
        </div>
      </div>

      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_88px]" role="grid" aria-label={`Rides in ${MONTH.format(new Date(year, month, 1))}`}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="eyebrow border-b border-line px-2 py-1.5 text-ink-faint" role="columnheader">
            {d}
          </div>
        ))}
        <div className="eyebrow border-b border-l border-line px-2 py-1.5 text-right text-ink-faint" role="columnheader">
          Week
        </div>
        {m.weeks.map((w) => (
          <div key={w.days[0]!.date} className="contents" role="row">
            {w.days.map((d) => (
              <div
                key={d.date}
                role="gridcell"
                aria-label={`${DAY.format(d.date)}: ${d.rides.length === 0 ? 'no rides' : `${d.rides.length} ride${d.rides.length === 1 ? '' : 's'}, ${Math.round(d.tss)} TSS`}`}
                className={cn('min-h-24 border-b border-r border-line p-1.5 last-of-type:border-r-0', BAND[loadBand(d.tss)], !d.inMonth && 'opacity-45')}
                data-testid={d.rides.length > 0 ? 'calendar-ride-day' : undefined}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className={cn('grid size-6 place-items-center rounded-full text-xs tabular', d.isToday ? 'bg-accent font-bold text-on-accent' : 'text-ink-dim')}>{d.day}</span>
                  {d.tss > 0 && <span className="tabular text-[10px] text-ink-faint">{Math.round(d.tss)} TSS</span>}
                </div>
                <div className="space-y-1">
                  {d.rides.slice(0, MAX_CHIPS).map((r) => {
                    const Icon = KIND_ICON[r.kind]
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => void navigate({ to: '/history/$rideId', params: { rideId: r.id } })}
                        title={`${r.name} · ${formatDurationShort(r.movingS)}${r.tss !== null ? ` · ${Math.round(r.tss)} TSS` : ''}`}
                        className="no-drag flex w-full items-center gap-1 rounded-md border border-line bg-panel-2 px-1.5 py-1 text-left text-[11px] leading-tight hover:border-accent"
                        data-testid="calendar-ride"
                      >
                        <Icon className="size-3 shrink-0 text-accent" aria-hidden />
                        <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                      </button>
                    )
                  })}
                  {d.rides.length > MAX_CHIPS && <div className="px-1 text-[11px] text-ink-faint">+{d.rides.length - MAX_CHIPS} more</div>}
                </div>
              </div>
            ))}
            <div className="border-b border-l border-line p-2 text-right text-xs tabular text-ink-dim" role="gridcell">
              {w.rides > 0 ? (
                <>
                  <div className="font-display text-sm font-semibold text-ink">{Math.round(w.tss)}</div>
                  <div>TSS</div>
                  <div className="mt-1">{formatDurationShort(w.movingS)}</div>
                </>
              ) : (
                <span className="text-ink-faint">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
