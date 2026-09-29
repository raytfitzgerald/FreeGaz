import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { moveSegmentToGap, powerAt } from '@core/workout/edit'
import type { Segment, Workout } from '@core/workout/model'
import { formatDuration } from '../../ui/format'
import { POWER_ZONE_LABELS, zoneIndexForFraction, zoneVar } from '../../ui/zones'
import { kindLabel, powerText } from './blocks'
import { dragTo, type DragOrigin } from './drag'
import {
  autoScale,
  baseY,
  dragScale,
  dropGap,
  fracOf,
  gapTimeS,
  heightAt,
  hitTest,
  layoutSegments,
  PAD,
  powerTicks,
  timeAtX,
  timeTicks,
  xAt,
  yAt,
  type Frame,
  type Grab,
  type Hit,
  type Piece,
  type Scale,
  type SegmentBox,
} from './layout'
import { pieceShapes, type ShapeFill } from './shapes'

const HEIGHT = 300
/** Horizontal travel (px) before a press on a block's body becomes a reorder drag. */
const REORDER_THRESHOLD_PX = 4

/** Pointer-handler state (a ref: handlers read it, rendering never does). */
interface DragState {
  hit: Hit
  startX: number
  /** Set for handle drags; null while dragging a block's body. */
  origin: DragOrigin | null
  preview: Workout | null
  /** Past the reorder threshold (body drags) or changed something (handle drags). */
  active: boolean
  gap: number | null
}

/** What the drag looks like on screen. */
interface DragView {
  frozen: Scale
  index: number
  grab: Grab
  piece: Piece | null
  gap: number | null
}

export interface CanvasProps {
  workout: Workout
  selected: number | null
  ftpW: number
  onSelect: (index: number | null) => void
  /** The workout mid-drag (null when the drag ends or changes nothing). */
  onPreview: (w: Workout | null) => void
  /** One finished drag: one undo step. */
  onCommit: (w: Workout, selected: number) => void
  onDragging: (dragging: boolean) => void
}

const fillOf = (f: ShapeFill) => (f === 'free' ? 'var(--color-line-strong)' : f === 'max' ? zoneVar(6) : zoneVar(f))

const cursorFor = (g: Grab | undefined, reordering: boolean) => {
  if (reordering) return 'grabbing'
  if (!g) return 'default'
  if (g.kind === 'power') return 'ns-resize'
  if (g.kind === 'body') return 'grab'
  return 'ew-resize'
}

/**
 * The builder canvas: blocks laid out by time (width ∝ duration), height =
 * % FTP, colour = zone. Click to select; drag right edges for duration, top
 * edges for power (ramps: each end; intervals: each half), and bodies
 * sideways to reorder. Esc cancels a drag.
 */
export function Canvas({ workout, selected, ftpW, onSelect, onPreview, onCommit, onDragging }: CanvasProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  const [hover, setHover] = useState<{ px: number; py: number; hit: Hit | null } | null>(null)
  const [view, setView] = useState<DragView | null>(null)
  const drag = useRef<DragState | null>(null)
  const hatch = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(320, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const boxes = useMemo(() => layoutSegments(workout, ftpW), [workout, ftpW])
  const frame: Frame = { width, height: HEIGHT, scale: view ? dragScale(view.frozen, boxes) : autoScale(boxes) }
  const x = (s: number) => xAt(frame, s)
  const y = (f: number) => yAt(frame, f)
  const base = baseY(frame)

  const local = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { px: e.clientX - r.left, py: e.clientY - r.top }
  }

  const end = (commit: boolean) => {
    const d = drag.current
    drag.current = null
    setView(null)
    if (!d) return
    if (d.active) onDragging(false)
    if (d.origin) {
      onPreview(null)
      if (commit && d.preview && d.preview !== d.origin.base) onCommit(d.preview, d.origin.index)
    } else if (commit && d.active && d.gap !== null) {
      const moved = moveSegmentToGap(workout, d.hit.index, d.gap)
      if (moved.workout !== workout) onCommit(moved.workout, moved.index)
    }
  }

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    // Commit whatever the inspector is editing before the selection moves.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    const { px, py } = local(e)
    const hit = hitTest(frame, boxes, px, py)
    if (!hit) {
      onSelect(null)
      return
    }
    onSelect(hit.index)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // A pointer that is already gone (or a synthetic one) can't be captured; the drag still works inside the canvas.
    }
    const origin: DragOrigin | null = hit.grab.kind === 'body' ? null : dragOrigin(hit, hit.grab, workout, boxes, frame, px, py, ftpW)
    drag.current = { hit, startX: px, origin, preview: null, active: false, gap: null }
    setView({ frozen: frame.scale, index: hit.index, grab: hit.grab, piece: hit.piece, gap: null })
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const { px, py } = local(e)
    const d = drag.current
    if (!d) {
      setHover({ px, py, hit: hitTest(frame, boxes, px, py) })
      return
    }
    setHover({ px, py, hit: d.hit })
    if (d.origin) {
      const next = dragTo(d.origin, px, py, e.altKey, ftpW)
      if (next === (d.preview ?? d.origin.base)) return
      d.preview = next
      if (!d.active) {
        d.active = true
        onDragging(true)
      }
      onPreview(next === d.origin.base ? null : next)
      return
    }
    if (!d.active && Math.abs(px - d.startX) < REORDER_THRESHOLD_PX) return
    if (!d.active) {
      d.active = true
      onDragging(true)
    }
    const gap = dropGap(boxes, timeAtX(frame, px))
    if (gap !== d.gap) {
      d.gap = gap
      setView((v) => (v ? { ...v, gap } : v))
    }
  }

  const onEscape = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !drag.current) return
    e.preventDefault()
    end(false)
  })
  const dragging = view !== null
  useEffect(() => {
    if (!dragging) return
    const onKey = (e: KeyboardEvent) => onEscape(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dragging])

  const reordering = view?.grab.kind === 'body' && view.gap !== null
  const gapMoves = reordering && view.gap !== view.index && view.gap !== view.index + 1
  const shown = view ? { index: view.index, piece: livePiece(boxes, view) } : hover?.hit ? { index: hover.hit.index, piece: hover.hit.piece } : null
  const hoverIndex = shown?.index ?? null
  const selBox = selected === null ? undefined : boxes[selected]
  const selSeg = selected === null ? undefined : workout.segments[selected]
  const tipSeg = shown && !reordering ? workout.segments[shown.index] : undefined
  const tipBox = shown ? boxes[shown.index] : undefined

  return (
    <div ref={wrap} className="relative w-full select-none" style={{ height: HEIGHT }}>
      <svg
        role="application"
        tabIndex={0}
        aria-label={`Workout canvas, ${boxes.length} block${boxes.length === 1 ? '' : 's'}. Arrow keys select, Option-arrows move.`}
        width="100%"
        height={HEIGHT}
        data-testid="builder-canvas"
        style={{ cursor: cursorFor(view?.grab ?? hover?.hit?.grab, reordering) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => end(true)}
        onPointerCancel={() => end(false)}
        onLostPointerCapture={() => drag.current && end(true)}
        onPointerLeave={() => !drag.current && setHover(null)}
      >
        <defs>
          <pattern id={hatch} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--color-ink)" strokeOpacity="0.22" strokeWidth="2.5" />
          </pattern>
        </defs>

        {powerTicks(frame.scale.topFrac).map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(f)} y2={y(f)} stroke="var(--color-line)" strokeWidth={1} strokeDasharray={f === 1 ? undefined : '2 4'} />
            <text x={PAD.left - 6} y={y(f) + 3} textAnchor="end" fontSize={10} fill="var(--color-ink-faint)">
              {f === 1 ? 'FTP' : `${Math.round(f * 100)}%`}
            </text>
          </g>
        ))}

        {boxes.map((b) => (
          <Block
            key={b.index}
            box={b}
            seg={workout.segments[b.index]}
            x={x}
            y={y}
            base={base}
            hatch={hatch}
            selected={b.index === selected}
            hovered={b.index === hoverIndex}
            lifted={reordering && view.index === b.index}
          />
        ))}

        {selBox && selSeg && selBox.pieces.length > 0 && (
          <g pointerEvents="none">
            <rect
              x={x(selBox.startS) - 1}
              y={y(selBox.top) - 4}
              width={Math.max(3, x(selBox.endS) - x(selBox.startS) + 2)}
              height={base - y(selBox.top) + 4}
              rx={4}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={2}
              data-testid="builder-selection"
            />
            {!reordering && <Handles box={selBox} seg={selSeg} x={x} y={y} base={base} />}
          </g>
        )}

        {gapMoves && (
          <g pointerEvents="none" data-testid="builder-drop">
            <line x1={x(gapTimeS(boxes, view.gap ?? 0))} x2={x(gapTimeS(boxes, view.gap ?? 0))} y1={PAD.top - 4} y2={base} stroke="var(--color-accent)" strokeWidth={2} />
            <path
              d={`M${x(gapTimeS(boxes, view.gap ?? 0)) - 5},${PAD.top - 11} l10,0 l-5,7 Z`}
              fill="var(--color-accent)"
            />
          </g>
        )}

        <line x1={PAD.left} x2={width - PAD.right} y1={base} y2={base} stroke="var(--color-line-strong)" strokeWidth={1} />
        {timeTicks(frame.scale.spanS).map((t) => (
          <text key={t} x={x(t)} y={HEIGHT - 7} textAnchor="middle" fontSize={10} fill="var(--color-ink-faint)">
            {formatDuration(t)}
          </text>
        ))}

        {boxes.length === 0 && (
          <text x={PAD.left + (width - PAD.left - PAD.right) / 2} y={PAD.top + (base - PAD.top) / 2} textAnchor="middle" fontSize={13} fill="var(--color-ink-faint)">
            Add blocks from the palette, or switch to Text and type the workout.
          </text>
        )}
      </svg>
      {hover && shown && tipSeg && tipBox && (
        <div
          className="pointer-events-none absolute top-1 z-10 w-64 rounded-lg border border-line-strong bg-panel-2/95 px-3 py-2 text-xs shadow-xl"
          style={{ left: Math.max(0, Math.min(hover.px + 14, width - 260)) }}
          data-testid="builder-tooltip"
        >
          <Tooltip seg={tipSeg} box={tipBox} piece={shown.piece} atS={timeAtX(frame, hover.px)} ftpW={ftpW} />
        </div>
      )}
    </div>
  )
}

function Block({
  box,
  seg,
  x,
  y,
  base,
  hatch,
  selected,
  hovered,
  lifted,
}: {
  box: SegmentBox
  seg: Segment | undefined
  x: (s: number) => number
  y: (f: number) => number
  base: number
  hatch: string
  selected: boolean
  hovered: boolean
  lifted: boolean
}) {
  if (!seg) return null
  const ergOff = seg.kind === 'freeride' || seg.kind === 'maxeffort'
  const w = x(box.endS) - x(box.startS)
  const label = seg.label?.trim() || (seg.kind === 'freeride' ? 'Free ride' : seg.kind === 'maxeffort' ? 'MAX' : '')
  const maxChars = Math.floor((w - 8) / 6)
  return (
    <g
      data-testid="builder-block"
      data-index={box.index}
      data-kind={seg.kind}
      data-selected={selected || undefined}
      opacity={lifted ? 0.35 : selected || hovered ? 1 : 0.86}
    >
      {/* The whole column, invisible: element-level targeting never falls into the gaps between reps. */}
      <rect x={x(box.startS)} y={PAD.top} width={Math.max(0, w)} height={Math.max(0, base - PAD.top)} fill="transparent" />
      {box.pieces.map((p, k) =>
        pieceShapes(p, x, y, base).map((sh, j) => (
          <g key={`${k}.${j}`}>
            <path d={sh.d} fill={fillOf(sh.fill)} />
            {ergOff && <path d={sh.d} fill={`url(#${hatch})`} />}
          </g>
        )),
      )}
      {ergOff && box.pieces[0] && (
        <line
          x1={x(box.startS) + 1}
          x2={x(box.endS) - 1}
          y1={y(box.top)}
          y2={y(box.top)}
          stroke="var(--color-ink)"
          strokeOpacity={0.5}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}
      {label && maxChars >= 3 && (
        <text x={(x(box.startS) + x(box.endS)) / 2} y={base - 7} textAnchor="middle" fontSize={10} fill="var(--color-ink)" opacity={0.85} pointerEvents="none">
          {label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label}
        </text>
      )}
    </g>
  )
}

/** Grips on the selected block, where its drag handles are. */
function Handles({ box, seg, x, y, base }: { box: SegmentBox; seg: Segment; x: (s: number) => number; y: (f: number) => number; base: number }) {
  const grips: { key: string; cx: number; cy: number; horizontal: boolean }[] = []
  const edge = (p: Piece, key: string) => grips.push({ key, cx: x(p.endS), cy: (y(p.to) + base) / 2, horizontal: false })
  const top = (p: Piece, key: string) => grips.push({ key, cx: (x(p.startS) + x(p.endS)) / 2, cy: y(p.from), horizontal: true })
  const first = box.pieces[0]
  if (!first) return null
  const ends: { cx: number; cy: number }[] = []
  if (seg.kind === 'intervals') {
    const [on, off] = box.pieces
    if (on) {
      top(on, 'on-top')
      edge(on, 'on-edge')
    }
    if (off) {
      top(off, 'off-top')
      edge(off, 'off-edge')
    }
  } else {
    edge(first, 'edge')
    if (seg.kind === 'steady') top(first, 'top')
    if (seg.kind === 'ramp') ends.push({ cx: x(first.startS) + 4, cy: y(first.from) }, { cx: x(first.endS) - 4, cy: y(first.to) })
  }
  return (
    <>
      {grips.map((g) => (
        <rect
          key={g.key}
          x={g.cx - (g.horizontal ? 9 : 2.5)}
          y={g.cy - (g.horizontal ? 2.5 : 9)}
          width={g.horizontal ? 18 : 5}
          height={g.horizontal ? 5 : 18}
          rx={2.5}
          fill="var(--color-ink)"
          stroke="var(--color-panel)"
          strokeWidth={1.5}
        />
      ))}
      {ends.map((c, i) => (
        <circle key={i} cx={c.cx} cy={c.cy} r={4.5} fill="var(--color-ink)" stroke="var(--color-panel)" strokeWidth={1.5} />
      ))}
    </>
  )
}

/** Where a handle drag starts: the frozen frame, and how far the pointer is from the handle itself. */
function dragOrigin(hit: Hit, grab: DragOrigin['grab'], w: Workout, boxes: SegmentBox[], frame: Frame, px: number, py: number, ftpW: number): DragOrigin {
  const seg = w.segments[hit.index]
  const target = seg && grab.kind === 'power' ? powerAt(seg, grab.field) : null
  return {
    index: hit.index,
    grab,
    base: w,
    segmentStartS: boxes[hit.index]?.startS ?? 0,
    frame,
    grabDx: grab.kind !== 'power' && hit.piece ? px - xAt(frame, hit.piece.endS) : 0,
    grabDy: target ? py - yAt(frame, fracOf(target, ftpW)) : 0,
  }
}

/** The dragged piece in the live layout (interval halves keep their rep). */
function livePiece(boxes: SegmentBox[], v: DragView): Piece | null {
  const pieces = boxes[v.index]?.pieces ?? []
  return pieces.find((p) => p.kind === v.piece?.kind && p.rep === v.piece.rep) ?? pieces[0] ?? null
}

/** Hover (or live drag) details: start, duration, % FTP and watts. */
function Tooltip({ seg, box, piece, atS, ftpW }: { seg: Segment; box: SegmentBox; piece: Piece | null; atS: number; ftpW: number }) {
  const ergOff = seg.kind === 'freeride' || seg.kind === 'maxeffort'
  const frac = piece && !ergOff ? heightAt(piece, Math.min(piece.endS, Math.max(piece.startS, atS))) : null
  const swatch = seg.kind === 'freeride' ? 'var(--color-line-strong)' : seg.kind === 'maxeffort' ? zoneVar(6) : zoneVar(zoneIndexForFraction(frac ?? box.top))
  const label = seg.label?.trim()
  return (
    <>
      <div className="flex items-center gap-2 font-medium text-ink">
        <span className="size-2.5 shrink-0 rounded-sm" style={{ background: swatch }} aria-hidden />
        <span className="truncate">
          {kindLabel(seg)}
          {label ? ` · ${label}` : ''}
        </span>
      </div>
      <div className="tabular mt-1 text-ink-dim">
        Starts {formatDuration(box.startS)} · lasts {formatDuration(box.endS - box.startS)}
      </div>
      <div className="tabular mt-0.5 text-ink">{targetLine(seg, piece, ftpW)}</div>
      {frac !== null && <div className="mt-0.5 text-ink-faint">{POWER_ZONE_LABELS[zoneIndexForFraction(frac)]}</div>}
    </>
  )
}

function targetLine(seg: Segment, piece: Piece | null, ftpW: number): string {
  switch (seg.kind) {
    case 'steady':
      return powerText(seg.power, ftpW)
    case 'ramp':
      return `${powerText(seg.from, ftpW)} → ${powerText(seg.to, ftpW)}`
    case 'intervals': {
      const part = piece?.kind === 'off' ? seg.off : seg.on
      const name = piece?.kind === 'off' ? 'Off' : 'On'
      return `Rep ${(piece?.rep ?? 0) + 1} of ${seg.repeat} · ${name} ${formatDuration(part.durationS)} at ${powerText(part.power, ftpW)}`
    }
    case 'freeride':
      return 'ERG off: ride by feel'
    case 'maxeffort':
      return 'ERG off: all-out'
  }
}
