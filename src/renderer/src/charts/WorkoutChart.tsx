import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { POWER_ZONE_EDGES, POWER_ZONE_SHORT, zoneIndexForFraction, zoneVar } from '../ui/zones'
import { formatDuration } from '../ui/format'

/** One drawable step of a workout profile (from a compiled timeline). */
export interface ProfileBlock {
  startS: number
  endS: number
  /** Target as a fraction of FTP at start/end (equal for steady blocks). null = free ride / max effort. */
  from: number | null
  to: number | null
  kind: string
  label?: string
}

export interface WorkoutChartProps {
  blocks: ProfileBlock[]
  durationS: number
  ftpW: number
  /** Actual power per second of workout time (null = missing). */
  actual?: ArrayLike<number | null>
  cursorS?: number | null
  height?: number
  selected?: number | null
  onSelect?: (index: number) => void
  /** Accessible title. */
  title: string
}

const PAD = { top: 12, right: 12, bottom: 22, left: 40 }
const FREE_FRAC = 0.6
const MAX_FRAC = 1.5
const ROUND = 4

/**
 * Workout profile: zone-coloured target blocks (height = % FTP, colour = zone,
 * both labelled on hover), the FTP reference line, and the actual power line
 * on the same watts axis. SVG so it's crisp, themeable and hoverable.
 */
export function WorkoutChart({ blocks, durationS, ftpW, actual, cursorS, height = 180, selected, onSelect, title }: WorkoutChartProps) {
  const ref = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(900)
  const [hover, setHover] = useState<{ x: number; s: number } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(200, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const maxFrac = useMemo(() => {
    let m = 1.2
    for (const b of blocks) m = Math.max(m, b.from ?? (b.kind === 'maxeffort' ? MAX_FRAC : FREE_FRAC), b.to ?? 0)
    if (actual) for (let i = 0; i < actual.length; i++) {
      const v = actual[i]
      if (v !== null && v !== undefined) m = Math.max(m, v / ftpW)
    }
    return Math.min(2.6, m * 1.08)
  }, [blocks, actual, ftpW])

  const innerW = width - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const x = (s: number) => PAD.left + (durationS > 0 ? (s / durationS) * innerW : 0)
  const y = (frac: number) => PAD.top + innerH - (frac / maxFrac) * innerH
  const baseY = y(0)

  const shapes = useMemo(() => {
    const out: { d: string; zone: number; index: number }[] = []
    blocks.forEach((b, index) => {
      const x0 = x(b.startS) + 1
      const x1 = Math.max(x0 + 0.5, x(b.endS) - 1)
      if (b.from === null || b.to === null) {
        const f = b.kind === 'maxeffort' ? MAX_FRAC : FREE_FRAC
        out.push({ d: roundedTop(x0, x1, y(f), baseY), zone: b.kind === 'maxeffort' ? 6 : -1, index })
        return
      }
      if (b.from === b.to) {
        out.push({ d: roundedTop(x0, x1, y(b.from), baseY), zone: zoneIndexForFraction(b.from), index })
        return
      }
      // Ramp: split at zone boundaries so each piece is one solid zone colour.
      const cuts = [0, 1]
      for (const e of POWER_ZONE_EDGES) {
        if (!Number.isFinite(e)) continue
        const t = (e - b.from) / (b.to - b.from)
        if (t > 0 && t < 1) cuts.push(t)
      }
      cuts.sort((a, c) => a - c)
      for (let i = 0; i < cuts.length - 1; i++) {
        const t0 = cuts[i]!
        const t1 = cuts[i + 1]!
        const f0 = b.from + (b.to - b.from) * t0
        const f1 = b.from + (b.to - b.from) * t1
        const px0 = x0 + (x1 - x0) * t0
        const px1 = x0 + (x1 - x0) * t1
        out.push({ d: `M${px0},${baseY} L${px0},${y(f0)} L${px1},${y(f1)} L${px1},${baseY} Z`, zone: zoneIndexForFraction((f0 + f1) / 2), index })
      }
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, width, height, maxFrac, durationS])

  const actualPath = useMemo(() => {
    if (!actual || actual.length === 0) return ''
    let d = ''
    let pen = false
    for (let i = 0; i < actual.length; i++) {
      const v = actual[i]
      if (v === null || v === undefined) {
        pen = false
        continue
      }
      d += `${pen ? 'L' : 'M'}${x(i + 0.5).toFixed(1)},${y(v / ftpW).toFixed(1)}`
      pen = true
    }
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual, actual?.length, width, height, maxFrac, durationS, ftpW])

  const ticks = useMemo(() => timeTicks(durationS), [durationS])
  const blockAt = (s: number) => blocks.findIndex((b) => s >= b.startS && s < b.endS)

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const s = Math.max(0, Math.min(durationS, ((px - PAD.left) / innerW) * durationS))
    setHover({ x: x(s), s })
  }

  const hb = hover ? blocks[blockAt(hover.s)] : undefined
  const hFrac = hb && hb.from !== null && hb.to !== null ? hb.from + (hb.to - hb.from) * ((hover!.s - hb.startS) / Math.max(1, hb.endS - hb.startS)) : null
  const hActual = hover && actual ? actual[Math.floor(hover.s)] : undefined

  return (
    <div className="relative w-full select-none" style={{ height }}>
      <svg
        ref={ref}
        role="img"
        aria-label={title}
        width="100%"
        height={height}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onClick={() => {
          if (hover && onSelect) {
            const i = blockAt(hover.s)
            if (i >= 0) onSelect(i)
          }
        }}
        className={onSelect ? 'cursor-pointer' : undefined}
      >
        {/* recessive hairline grid at 50 / 100 / 150 % FTP */}
        {[0.5, 1, 1.5].filter((f) => f < maxFrac).map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(f)} y2={y(f)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(f) + 3} textAnchor="end" fontSize={10} fill="var(--color-ink-faint)">
              {f === 1 ? 'FTP' : `${Math.round(f * 100)}%`}
            </text>
          </g>
        ))}
        {shapes.map((sh, i) => (
          <path
            key={i}
            d={sh.d}
            fill={sh.zone < 0 ? 'var(--color-panel-3)' : zoneVar(sh.zone)}
            opacity={selected !== null && selected !== undefined && selected !== sh.index ? 0.45 : 0.92}
          />
        ))}
        {selected !== null && selected !== undefined && blocks[selected] && (
          <rect x={x(blocks[selected].startS)} y={PAD.top} width={Math.max(1, x(blocks[selected].endS) - x(blocks[selected].startS))} height={innerH} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} rx={4} />
        )}
        {actualPath && (
          <>
            <path d={actualPath} fill="none" stroke="var(--color-panel)" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
            <path d={actualPath} fill="none" stroke="var(--color-ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" data-testid="actual-power-line" />
          </>
        )}
        <line x1={PAD.left} x2={width - PAD.right} y1={baseY} y2={baseY} stroke="var(--color-line-strong)" strokeWidth={1} />
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--color-ink-faint)">
            {formatDuration(t)}
          </text>
        ))}
        {cursorS !== null && cursorS !== undefined && (
          <line x1={x(cursorS)} x2={x(cursorS)} y1={PAD.top} y2={baseY} stroke="var(--color-accent)" strokeWidth={2} data-testid="workout-cursor" />
        )}
        {hover && <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={baseY} stroke="var(--color-ink-dim)" strokeWidth={1} />}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-lg border border-line-strong bg-panel-2/95 px-3 py-2 text-xs shadow-xl"
          style={{ left: Math.min(Math.max(hover.x + 10, 0), width - 170) }}
        >
          <div className="text-ink-faint">{formatDuration(hover.s)}{hb?.label ? ` · ${hb.label}` : ''}</div>
          {hFrac !== null ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: zoneVar(zoneIndexForFraction(hFrac)) }} />
              <span className="tabular font-semibold text-ink">{Math.round(hFrac * ftpW)} W</span>
              <span className="text-ink-dim">
                {Math.round(hFrac * 100)}% · {POWER_ZONE_SHORT[zoneIndexForFraction(hFrac)]}
              </span>
            </div>
          ) : (
            hb && <div className="mt-1 text-ink-dim">{hb.kind === 'maxeffort' ? 'All-out, ERG off' : 'Free ride, ERG off'}</div>
          )}
          {hActual !== undefined && (
            <div className="mt-1 flex items-center gap-2">
              <span className="h-0.5 w-3 rounded bg-ink" />
              <span className="tabular font-semibold text-ink">{hActual === null ? '—' : `${Math.round(hActual)} W`}</span>
              <span className="text-ink-dim">actual</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function roundedTop(x0: number, x1: number, top: number, base: number): string {
  const r = Math.min(ROUND, (x1 - x0) / 2, Math.max(0, base - top))
  return `M${x0},${base} L${x0},${top + r} Q${x0},${top} ${x0 + r},${top} L${x1 - r},${top} Q${x1},${top} ${x1},${top + r} L${x1},${base} Z`
}

function timeTicks(durationS: number): number[] {
  if (durationS <= 0) return []
  const steps = [60, 120, 300, 600, 900, 1200, 1800, 3600]
  const step = steps.find((s) => durationS / s <= 8) ?? 3600
  const out: number[] = []
  for (let t = 0; t <= durationS; t += step) out.push(t)
  return out
}
