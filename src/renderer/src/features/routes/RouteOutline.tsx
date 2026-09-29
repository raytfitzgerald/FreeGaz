import { useEffect, useMemo, useRef, useState } from 'react'
import { isLoopRoute } from '@core/ride/route-course'
import type { Route } from '@core/routes/model'
import { fitProjection, outlineRuns, scaleBar } from '../../routes/geometry'
import { gradeVar } from '../../routes/grade'

const PAD = 16

/**
 * The route's shape, north up, coloured by grade, with a scale bar. Drawn
 * from the route itself: no map tiles, so it works offline, never tells a
 * tile server where the rider rides, and is honest for synthetic routes that
 * have no real streets under them.
 */
export function RouteOutline({
  route,
  rider,
  ghost,
  height = 220,
  title,
  testId,
}: {
  route: Route
  rider?: { lat: number; lon: number } | null
  ghost?: { lat: number; lon: number } | null
  height?: number
  title: string
  testId?: string
}) {
  const ref = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(360)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(120, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const proj = useMemo(() => fitProjection(route.bounds, width, height, PAD), [route, width, height])
  const runs = useMemo(() => outlineRuns(route.profile, proj), [route, proj])
  const whole = useMemo(() => runs.map((r) => r.points).join(' '), [runs])
  const scale = scaleBar(proj.metresPerUnit, width / 4)
  const loop = useMemo(() => isLoopRoute(route), [route])
  const first = route.profile[0]!
  const last = route.profile[route.profile.length - 1]!
  const at = (p: { lat: number; lon: number }) => ({ x: proj.x(p.lat, p.lon), y: proj.y(p.lat, p.lon) })
  const start = at(first)
  const finish = at(last)

  return (
    <div className="relative w-full" style={{ height }} data-testid={testId}>
      <svg ref={ref} role="img" aria-label={title} width="100%" height={height}>
        <polyline points={whole} fill="none" stroke="var(--color-panel)" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
        {runs.map((r, i) => (
          <polyline key={i} points={r.points} fill="none" stroke={gradeVar(r.cls)} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {!loop && <rect x={finish.x - 4} y={finish.y - 4} width={8} height={8} rx={1.5} fill="var(--color-ink)" stroke="var(--color-panel)" strokeWidth={2} aria-label="Finish" />}
        <circle cx={start.x} cy={start.y} r={5} fill="var(--color-panel)" stroke="var(--color-ink)" strokeWidth={2} aria-label={loop ? 'Start and finish' : 'Start'} />
        {ghost && (
          <circle cx={at(ghost).x} cy={at(ghost).y} r={5} fill="var(--color-panel)" stroke="var(--color-ink-dim)" strokeWidth={2} data-testid="map-ghost" />
        )}
        {rider && <circle cx={at(rider).x} cy={at(rider).y} r={6} fill="var(--color-accent)" stroke="var(--color-panel)" strokeWidth={2} data-testid="map-rider" />}
        <g transform={`translate(${PAD}, ${height - 10})`}>
          <line x1={0} x2={scale.units} y1={0} y2={0} stroke="var(--color-ink-faint)" strokeWidth={2} />
          <line x1={0} x2={0} y1={-4} y2={0} stroke="var(--color-ink-faint)" strokeWidth={1} />
          <line x1={scale.units} x2={scale.units} y1={-4} y2={0} stroke="var(--color-ink-faint)" strokeWidth={1} />
          <text x={scale.units + 6} y={3} fontSize={10} fill="var(--color-ink-faint)">
            {scale.label}
          </text>
        </g>
        <text x={width - PAD} y={PAD} textAnchor="end" fontSize={10} fill="var(--color-ink-faint)">
          N ↑
        </text>
      </svg>
    </div>
  )
}
