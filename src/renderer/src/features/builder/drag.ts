// Direct manipulation: what dragging each handle does to the workout. The
// pointer is mapped through the scale frozen at pointer-down, so the grabbed
// edge tracks the pointer even while the canvas rescales around the preview.
import { durationAt, powerAt, replaceSegment, snapDuration, snapPower, withDuration, withPower } from '@core/workout/edit'
import type { Workout } from '@core/workout/model'
import { fracAtY, timeAtX, type Frame, type Grab } from './layout'

/** Highest power a drag can reach (400 % FTP; validation warns above that anyway). */
export const MAX_DRAG_FRAC = 4

export interface DragOrigin {
  index: number
  grab: Exclude<Grab, { kind: 'body' }>
  /** The workout at pointer-down; every move recomputes from it. */
  base: Workout
  /** Start of the dragged segment, seconds. */
  segmentStartS: number
  /** The frame at pointer-down. */
  frame: Frame
  /**
   * How far (px) the pointer was from the handle itself at pointer-down: the
   * edge's x, or the target's own height (a ramp end, not the slope under
   * the pointer). Subtracted on every move, so the handle moves with the
   * pointer instead of jumping onto it.
   */
  grabDx: number
  grabDy: number
}

/**
 * The workout with the handle dragged to (px, py). Durations snap to 5 s
 * (1 s when `fine`, i.e. Alt/Option held), power to 1 % FTP (whole watts for
 * absolute targets). Returns `origin.base` itself when nothing changes.
 */
export function dragTo(o: DragOrigin, px: number, py: number, fine: boolean, ftpW: number): Workout {
  const seg = o.base.segments[o.index]
  if (!seg) return o.base
  const step = fine ? 1 : 5
  const t = timeAtX(o.frame, px - o.grabDx) - o.segmentStartS
  const g = o.grab
  if (g.kind === 'duration') {
    const d = snapDuration(t, step, step)
    return d === durationAt(seg, 'duration') ? o.base : replaceSegment(o.base, o.index, withDuration(seg, 'duration', d))
  }
  if (g.kind === 'part') {
    if (seg.kind !== 'intervals') return o.base
    // The edge of rep r's half sits at r × (on + off) + on (or (r + 1) × (on + off)); solve for the new half.
    const r = g.rep
    const raw = g.part === 'on' ? (t - r * seg.off.durationS) / (r + 1) : t / (r + 1) - seg.on.durationS
    const d = snapDuration(raw, step, step)
    return d === durationAt(seg, g.part) ? o.base : replaceSegment(o.base, o.index, withDuration(seg, g.part, d))
  }
  const p = powerAt(seg, g.field)
  if (!p) return o.base
  const frac = Math.min(MAX_DRAG_FRAC, Math.max(0, fracAtY(o.frame, py - o.grabDy)))
  const value = snapPower(p, p.unit === 'ftp' ? frac : frac * ftpW).value
  return value === p.value ? o.base : replaceSegment(o.base, o.index, withPower(seg, g.field, value))
}
