import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import type { JourneyCourse } from '@core/journeys/course'
import { gridLines, mapFrame, niceStepM, pointsBetween, type MapFrame } from '@core/journeys/map'
import { sampleAt } from '@core/routes/lookup'
import type { JourneyTick } from '@core/journeys/types'
import { distanceUnit, formatElevation, formatLongDistance, formatSpan, scaleSteps } from '@core/units'
import { useRide } from '../../stores/ride'
import { useSettings } from '../../stores/settings'
import { Segmented } from '../../ui/Segmented'

// The mini map on the ride screen: the journey's road drawn as a line (no
// tiles, so nothing is fetched and it works offline), today's trail, the dot,
// and what's coming up. "Today" follows the dot; "Journey" shows the whole road.

const H = 190
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
  const at = (m: number): [number, number] => {
    const p = sampleAt(course.route.profile, m)
    return frame.project(p.lat, p.lon)
  }
  const start = pts[0] ? frame.project(pts[0].lat, pts[0].lon) : null
  const shown = zoom === 'journey' ? course.milestones.filter((m) => m.kind !== 'halfway') : course.milestones.filter((m) => m.atM >= fromM && m.atM <= toM)
  // on the whole-journey view, name only what fits: borders, summits and the finish when it's crowded
  const crowded = zoom === 'journey' && shown.length > 10
  const labels = shown.map((m) => {
    const [mx, my] = at(m.atM)
    return { ...m, x: mx, y: my, label: !crowded || m.kind !== 'place' }
  })
  const terrain = useMemo(() => terrainBands(course, fromM, toM, frame), [course, fromM, toM, frame])
  const grid = useMemo(() => gridLines(frame, W, H, niceStepM(frame.metersPerPx, 90)), [frame, W])
  const scaleBar = useMemo(() => {
    const steps = scaleSteps(units)
    const m = [...steps].reverse().find((s) => s / frame.metersPerPx <= 110) ?? steps[0]!
    return { px: m / frame.metersPerPx, label: formatSpan(m, units) }
  }, [frame, units])
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
          <defs>
            <clipPath id="journey-map-clip">
              <rect width={W} height={H} rx={12} />
            </clipPath>
          </defs>
          <g clipPath="url(#journey-map-clip)">
            {/* the land, and a grid anchored to the ground so it slides by as you ride */}
            <rect width={W} height={H} fill="var(--color-panel-2)" />
            {grid.xs.map((gx) => (
              <line key={`x${gx.toFixed(1)}`} x1={gx} x2={gx} y1={0} y2={H} stroke="var(--color-line)" strokeWidth={1} />
            ))}
            {grid.ys.map((gy) => (
              <line key={`y${gy.toFixed(1)}`} x1={0} x2={W} y1={gy} y2={gy} stroke="var(--color-line)" strokeWidth={1} />
            ))}
            {/* the valley and the mountains around the road: darker is higher */}
            {terrain.map((t, i) => (
              <polyline key={i} points={t.points} fill="none" stroke="var(--color-ink)" strokeOpacity={t.opacity} strokeWidth={34} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {/* the road, drawn like one: a casing and a lighter fill */}
            <polyline points={road} fill="none" stroke="var(--color-line-strong)" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
            <polyline points={road} fill="none" stroke="var(--color-panel)" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
            <polyline points={done} fill="none" stroke="var(--color-accent)" strokeOpacity={0.4} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
            <polyline points={trail} fill="none" stroke="var(--color-accent)" strokeWidth={4.5} strokeLinejoin="round" strokeLinecap="round" data-testid="journey-trail" />
            {zoom === 'journey' && start && <circle cx={start[0]} cy={start[1]} r={5} fill="var(--color-panel)" stroke="var(--color-ink)" strokeWidth={2} aria-label="Start" />}
            {labels.map((m) => (
              <g key={`${m.kind}-${m.atM}`}>
                {m.kind === 'finish' ? (
                  <rect x={m.x - 5} y={m.y - 5} width={10} height={10} rx={2} fill="var(--color-ink)" stroke="var(--color-panel)" strokeWidth={2} />
                ) : (
                  <circle cx={m.x} cy={m.y} r={m.kind === 'border' ? 3 : 4} fill="var(--color-panel)" stroke="var(--color-ink-dim)" strokeWidth={1.5} />
                )}
                {m.label && (
                  <text x={m.x + 8} y={m.y - 6} fontSize={11} fontWeight={600} fill="var(--color-ink-dim)" stroke="var(--color-panel-2)" strokeWidth={3} paintOrder="stroke">
                    {m.kind === 'summit' ? `▲ ${m.name}` : m.name}
                  </text>
                )}
              </g>
            ))}
            <circle cx={x} cy={y} r={7} fill="var(--color-accent)" stroke="var(--color-panel)" strokeWidth={2.5} data-testid="journey-dot" />
            {/* north arrow and scale bar */}
            <g transform="translate(16 14)" aria-hidden>
              <path d="M0 14 L5 0 L10 14 L5 10 Z" fill="var(--color-ink-dim)" />
              <text x={5} y={26} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--color-ink-dim)">
                N
              </text>
            </g>
            <g transform={`translate(16 ${H - 14})`} aria-hidden>
              <line x1={0} x2={scaleBar.px} y1={0} y2={0} stroke="var(--color-ink-dim)" strokeWidth={2} />
              <line x1={0} x2={0} y1={-4} y2={0} stroke="var(--color-ink-dim)" strokeWidth={1.5} />
              <line x1={scaleBar.px} x2={scaleBar.px} y1={-4} y2={0} stroke="var(--color-ink-dim)" strokeWidth={1.5} />
              <text x={scaleBar.px + 6} y={3} fontSize={10} fill="var(--color-ink-dim)" stroke="var(--color-panel-2)" strokeWidth={3} paintOrder="stroke">
                {scaleBar.label}
              </text>
            </g>
            <text x={W - 8} y={H - 8} textAnchor="end" fontSize={9} fill="var(--color-ink-faint)" stroke="var(--color-panel-2)" strokeWidth={3} paintOrder="stroke">
              © OpenStreetMap contributors
            </text>
          </g>
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 text-xs text-ink-dim">
        <span className="flex items-center gap-1.5" data-testid="journey-next">
          <MapPin className="size-3.5 text-accent" aria-hidden />
          {tick.next ? `${tick.next.name} in ${dist(tick.next.inM)}` : tick.finished ? `Arrived at ${course.end}. Riding on.` : `Heading back toward ${course.start}`}
        </span>
        <span className="tabular">
          {tick.gradePct !== 0 && `${tick.gradePct > 0 ? '+' : ''}${tick.gradePct.toFixed(1)} % · `}
          {formatElevation(tick.ele, units)}
        </span>
      </div>
    </section>
  )
}

/**
 * Shading along the road for the terrain it crosses, in short stretches:
 * the higher the stretch (against the whole course), the darker. It reads
 * as valleys and mountains without any elevation tiles.
 */
function terrainBands(course: JourneyCourse, fromM: number, toM: number, frame: MapFrame): { points: string; opacity: number }[] {
  const pts = pointsBetween(course.route.points, fromM, toM, 240)
  if (pts.length < 2) return []
  const eles = course.route.profile.map((p) => p.ele)
  const lo = Math.min(...eles)
  const hi = Math.max(...eles)
  const span = Math.max(150, hi - lo)
  const out: { points: string; opacity: number }[] = []
  const per = 6
  for (let i = 0; i < pts.length - 1; i += per) {
    const chunk = pts.slice(i, Math.min(pts.length, i + per + 1))
    const ele = chunk.reduce((a, p) => a + (p.ele ?? lo), 0) / chunk.length
    out.push({
      points: chunk.map((p) => frame.project(p.lat, p.lon).map((v) => v.toFixed(1)).join(',')).join(' '),
      opacity: Math.round((0.03 + 0.13 * ((ele - lo) / span)) * 1000) / 1000,
    })
  }
  return out
}
