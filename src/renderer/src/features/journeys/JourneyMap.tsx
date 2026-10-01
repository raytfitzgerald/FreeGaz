import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import type { JourneyCourse } from '@core/journeys/course'
import { mapFrame } from '@core/journeys/map'
import type { JourneyTick } from '@core/journeys/types'
import { distanceUnit, formatLongDistance } from '@core/units'
import { useRide } from '../../stores/ride'
import { useSettings } from '../../stores/settings'
import { Segmented } from '../../ui/Segmented'

// The mini map on the ride screen: the journey's road drawn as a line (no
// tiles, so nothing is fetched and it works offline), today's trail, the dot,
// and what's coming up. "Today" follows the dot; "Journey" shows the whole road.

const H = 150
type Zoom = 'today' | 'journey'

/** The element's width in CSS pixels, so the map draws at its real size (text stays text-sized). */
function useWidth<T extends HTMLElement>(fallback: number): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(200, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export function JourneyMap() {
  const course = useRide((s) => s.journeyCourse)
  const tick = useRide((s) => s.plan?.journey ?? null)
  if (!course || !tick) return null
  return <JourneyMapCard course={course} tick={tick} />
}

function JourneyMapCard({ course, tick }: { course: JourneyCourse; tick: JourneyTick }) {
  const [zoom, setZoom] = useState<Zoom>('today')
  const [box, W] = useWidth<HTMLDivElement>(640)
  const units = useSettings((s) => s.units)
  const pts = course.route.points
  const L = course.lengthM
  const pos = tick.positionM
  // today: a little road behind, more ahead; recomputed every 500 m so the frame doesn't swim
  const bucket = Math.floor(pos / 500)
  const [fromM, toM] = zoom === 'journey' ? [0, L] : [Math.max(0, bucket * 500 - 2_000), Math.min(L, bucket * 500 + 8_000)]
  const frame = useMemo(() => mapFrame(pts, fromM, toM, W, H), [pts, fromM, toM, W])
  const road = useMemo(() => frame.path(fromM, toM), [frame, fromM, toM])
  const done = useMemo(() => frame.path(fromM, Math.min(toM, Math.max(fromM, tick.progressM))), [frame, fromM, toM, tick.progressM])
  const trailFrom = Math.max(fromM, Math.min(tick.startM, pos))
  const trail = frame.path(trailFrom, Math.max(trailFrom, Math.min(toM, tick.reversed ? tick.progressM : pos)))
  const [x, y] = frame.project(tick.lat, tick.lon)
  const milestones = zoom === 'journey' ? course.milestones.filter((m) => m.kind !== 'halfway') : course.milestones.filter((m) => m.atM >= fromM && m.atM <= toM)
  const dist = (m: number) => `${formatLongDistance(m, units)} ${distanceUnit(units)}`

  return (
    <section className="rounded-2xl border border-line bg-panel px-4 pb-3 pt-2" aria-label="Journey map" data-testid="journey-map" data-snap>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="eyebrow text-ink-faint">Journey</span>
          <span className="truncate text-sm font-semibold" data-testid="journey-name">
            {course.name}
          </span>
          <span className="tabular text-sm text-ink-dim" data-testid="journey-progress">
            {course.kind === 'drop' ? `${dist(tick.rideM)} ridden` : `${dist(tick.progressM)} of ${dist(L)}`}
          </span>
        </div>
        <div data-snap-hide>
          <Segmented
            ariaLabel="Map zoom"
            value={zoom}
            onChange={setZoom}
            options={[
              { value: 'today', label: 'Today' },
              { value: 'journey', label: 'Journey' },
            ]}
          />
        </div>
      </div>
      <div ref={box} className="mt-1 w-full">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={`Map of ${course.name}, ${dist(tick.progressM)} along`}>
          <polyline points={road} fill="none" stroke="var(--color-line-strong)" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={done} fill="none" stroke="var(--color-accent)" strokeOpacity={0.35} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={trail} fill="none" stroke="var(--color-accent)" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" data-testid="journey-trail" />
          {milestones.map((m) => {
            const p = frame.path(m.atM, m.atM).split(' ')[0]?.split(',').map(Number)
            if (!p || p.length < 2 || !Number.isFinite(p[0])) return null
            return (
              <g key={`${m.kind}-${m.atM}`}>
                <circle cx={p[0]} cy={p[1]} r={3.5} fill="var(--color-panel)" stroke="var(--color-ink-dim)" strokeWidth={1.5} />
                {zoom === 'today' && (
                  <text x={p[0]! + 7} y={p[1]! - 6} fontSize={11} fill="var(--color-ink-dim)">
                    {m.name}
                  </text>
                )}
              </g>
            )
          })}
          <circle cx={x} cy={y} r={7} fill="var(--color-accent)" stroke="var(--color-panel)" strokeWidth={2.5} data-testid="journey-dot" />
          <text x={W - 4} y={H - 4} textAnchor="end" fontSize={9} fill="var(--color-ink-faint)">
            © OpenStreetMap contributors
          </text>
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 text-xs text-ink-dim">
        <span className="flex items-center gap-1.5" data-testid="journey-next">
          <MapPin className="size-3.5 text-accent" aria-hidden />
          {tick.next ? `${tick.next.name} in ${dist(tick.next.inM)}` : tick.finished ? `Arrived at ${course.end}. Riding on.` : `Heading back toward ${course.start}`}
        </span>
        <span className="tabular">
          {tick.gradePct !== 0 && `${tick.gradePct > 0 ? '+' : ''}${tick.gradePct.toFixed(1)} % · `}
          {Math.round(tick.ele)} m
        </span>
      </div>
    </section>
  )
}
