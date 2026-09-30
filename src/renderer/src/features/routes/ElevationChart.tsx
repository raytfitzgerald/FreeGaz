import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { formatKm, formatMetres } from '../../routes/format'
import type { Route } from '@core/routes/model'
import { displayElevation, distanceUnit, elevationUnit } from '@core/units'
import { useSettings } from '../../stores/settings'
import { areaPath, courseSamples, elevationRange, gradeRuns, linePath, meanGrade, ticks, type GradeRun } from '../../routes/geometry'
import { GRADE_CLASSES, formatGrade, gradeClass, gradeVar } from '../../routes/grade'

export interface ElevationChartProps {
  route: Route
  /** The chart spans the ride: length × laps, laps unwrapped. */
  laps?: number
  /** Window in ride coordinates, m (default: the whole ride). */
  fromX?: number
  toX?: number
  height?: number
  /** Where the rider is, in ride coordinates. */
  rider?: number | null
  ghost?: number | null
  /** Bins before this ride coordinate are drawn neutral: ridden already, or behind you. */
  doneBefore?: number | null
  /** X labels as km from the start, or as distance ahead of the rider. */
  axis?: 'km' | 'ahead'
  showYAxis?: boolean
  /** Least elevation span drawn, m, so small rollers aren't blown up into mountains. */
  minSpanM?: number
  title: string
  testId?: string
}

const DONE = -1

/**
 * An elevation profile coloured by grade class (sequential ramp, legend
 * beside it), with a 2px elevation line on a surface ring, one y-axis in
 * metres, hover crosshair and tooltip, and optional rider/ghost markers.
 */
export function ElevationChart({
  route,
  laps = 1,
  fromX = 0,
  toX,
  height = 180,
  rider,
  ghost,
  doneBefore,
  axis = 'km',
  showYAxis = true,
  minSpanM = 30,
  title,
  testId,
}: ElevationChartProps) {
  const units = useSettings((s) => s.units)
  const ref = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(800)
  /** Pointer offset from the plot's left edge, px: kept in pixels so a moving window (the HUD strip) keeps the tooltip under the pointer. */
  const [hoverPx, setHoverPx] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(160, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const L = route.distanceM
  const end = toX ?? L * laps
  const pad = { top: 12, right: 12, bottom: 20, left: showYAxis ? (units === 'imperial' ? 52 : 44) : 10 }
  const innerW = Math.max(10, width - pad.left - pad.right)
  const innerH = Math.max(10, height - pad.top - pad.bottom)
  const bins = Math.max(20, Math.min(600, Math.round(innerW / 3)))

  const samples = useMemo(() => courseSamples(route.profile, L, fromX, end, bins), [route, L, fromX, end, bins])
  const [lo, hi] = useMemo(() => elevationRange(samples.ele, minSpanM), [samples, minSpanM])
  const span = end - fromX
  const sx = (x: number) => pad.left + (span > 0 ? ((x - fromX) / span) * innerW : 0)
  const sy = (e: number) => pad.top + innerH - ((e - lo) / (hi - lo || 1)) * innerH
  const baseY = pad.top + innerH

  const runs = useMemo(() => {
    const all = gradeRuns(samples.grade)
    if (doneBefore === null || doneBefore === undefined) return all
    // Split at doneBefore: the part behind is one neutral run.
    const out: GradeRun[] = []
    for (const r of all) {
      for (let i = r.from; i < r.to; i++) {
        const cls = samples.x[i + 1]! <= doneBefore + 1e-6 ? DONE : r.cls
        const last = out[out.length - 1]
        if (last && last.cls === cls) last.to = i + 1
        else out.push({ from: i, to: i + 1, cls })
      }
    }
    return out
  }, [samples, doneBefore])

  const yTicks = useMemo(() => ticks(lo, hi, Math.max(2, Math.floor(innerH / 40))), [lo, hi, innerH])
  const xTicks = useMemo(() => {
    if (axis === 'ahead') {
      const origin = rider ?? fromX
      return ticks(0, end - origin, Math.max(2, Math.floor(innerW / 90))).map((v) => ({ x: origin + v, label: v === 0 ? 'now' : `+${formatMetres(v, units)}` }))
    }
    return ticks(fromX, end, Math.max(2, Math.floor(innerW / 80))).map((v) => ({ x: v, label: `${formatKm(v, 1, units)}${v === 0 ? '' : ` ${distanceUnit(units)}`}` }))
  }, [axis, rider, fromX, end, innerW, units])

  const eleAt = (x: number) => {
    const i = Math.max(0, Math.min(samples.x.length - 2, Math.floor(((x - fromX) / (span || 1)) * bins)))
    const x0 = samples.x[i]!
    const x1 = samples.x[i + 1]!
    const f = x1 > x0 ? (x - x0) / (x1 - x0) : 0
    return samples.ele[i]! + (samples.ele[i + 1]! - samples.ele[i]!) * Math.max(0, Math.min(1, f))
  }

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    setHoverPx(px < pad.left || px > pad.left + innerW ? null : px - pad.left)
  }

  const hover = hoverPx === null ? null : fromX + (Math.min(hoverPx, innerW) / innerW) * span

  const hoverGrade = hover === null ? null : meanGrade(route.profile, L, Math.max(fromX, hover - 25), Math.min(end, hover + 25))
  const inRange = (x: number | null | undefined): x is number => x !== null && x !== undefined && x >= fromX - 1e-6 && x <= end + 1e-6

  return (
    <div className="relative w-full select-none" style={{ height }} data-testid={testId}>
      <svg ref={ref} role="img" aria-label={title} width="100%" height={height} onPointerMove={onMove} onPointerLeave={() => setHoverPx(null)}>
        {showYAxis &&
          yTicks.map((v) => (
            <g key={v}>
              <line x1={pad.left} x2={pad.left + innerW} y1={sy(v)} y2={sy(v)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={pad.left - 6} y={sy(v) + 3} textAnchor="end" fontSize={10} fill="var(--color-ink-faint)">
                {Math.round(displayElevation(v, units))} {elevationUnit(units)}
              </text>
            </g>
          ))}
        {runs.map((r) => (
          <path key={`${r.from}-${r.cls}`} d={areaPath(samples, r, sx, sy, baseY)} fill={r.cls === DONE ? 'var(--color-panel-3)' : gradeVar(r.cls)} />
        ))}
        <path d={linePath(samples, sx, sy)} fill="none" stroke="var(--color-panel)" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        <path d={linePath(samples, sx, sy)} fill="none" stroke="var(--color-ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <line x1={pad.left} x2={pad.left + innerW} y1={baseY} y2={baseY} stroke="var(--color-line-strong)" strokeWidth={1} />
        {xTicks.map((t) => (
          <text key={t.x} x={sx(t.x)} y={height - 5} textAnchor="middle" fontSize={10} fill="var(--color-ink-faint)">
            {t.label}
          </text>
        ))}
        {inRange(ghost) && (
          <g data-testid="profile-ghost">
            <line x1={sx(ghost)} x2={sx(ghost)} y1={pad.top} y2={baseY} stroke="var(--color-ink-dim)" strokeWidth={1} />
            <circle cx={sx(ghost)} cy={sy(eleAt(ghost))} r={5} fill="var(--color-panel)" stroke="var(--color-ink)" strokeWidth={2} />
            <text x={sx(ghost)} y={pad.top - 2} textAnchor="middle" fontSize={10} fill="var(--color-ink-dim)">
              Ghost
            </text>
          </g>
        )}
        {inRange(rider) && (
          <g data-testid="profile-rider">
            <line x1={sx(rider)} x2={sx(rider)} y1={pad.top} y2={baseY} stroke="var(--color-accent)" strokeWidth={2} />
            <circle cx={sx(rider)} cy={sy(eleAt(rider))} r={6} fill="var(--color-accent)" stroke="var(--color-panel)" strokeWidth={2} />
          </g>
        )}
        {hover !== null && <line x1={sx(hover)} x2={sx(hover)} y1={pad.top} y2={baseY} stroke="var(--color-ink-dim)" strokeWidth={1} />}
      </svg>
      {hover !== null && hoverGrade !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-lg border border-line-strong bg-panel-2/95 px-3 py-2 text-xs shadow-xl"
          style={{ left: Math.min(Math.max(sx(hover) + 10, 0), width - 170) }}
        >
          <div className="text-ink-faint">
            {axis === 'ahead' && rider !== null && rider !== undefined ? `${hover >= rider ? '+' : '−'}${formatMetres(Math.abs(hover - rider), units)} from you` : `${formatKm(hover, 2, units)} ${distanceUnit(units)}`}
            {laps > 1 && ` · lap ${Math.min(laps, Math.floor(hover / L) + 1)}`}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: gradeVar(gradeClass(hoverGrade)) }} />
            <span className="tabular font-semibold text-ink">{formatGrade(hoverGrade)}</span>
            <span className="text-ink-dim">{GRADE_CLASSES[gradeClass(hoverGrade)]!.name.toLowerCase()}</span>
          </div>
          <div className="tabular mt-1 text-ink-dim">{Math.round(displayElevation(eleAt(hover), units))} {elevationUnit(units)} elevation</div>
        </div>
      )}
    </div>
  )
}
