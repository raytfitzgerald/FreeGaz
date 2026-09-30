// The velodrome's geometry (the brand mark's, in its own viewBox) and this
// week's rides as riders on it.
import type { ReactNode } from 'react'
import type { RideSummary } from '@core/ride/types'
import { formatDurationShort } from '../../ui/format'

export const CX1 = 384
export const CX2 = 640
export const CY = 512
const STRAIGHT = CX2 - CX1

export const oval = (r: number) => `M${CX1} ${CY - r} L${CX2} ${CY - r} A${r} ${r} 0 0 1 ${CX2} ${CY + r} L${CX1} ${CY + r} A${r} ${r} 0 0 1 ${CX1} ${CY - r} Z`

/** A point `t` (0-1) of the way round the lane of radius r, anticlockwise as riders race, starting on the home straight. */
export function lanePoint(t: number, r: number): { x: number; y: number } {
  const arc = Math.PI * r
  const total = 2 * STRAIGHT + 2 * arc
  let s = (((1 - t) % 1) + 1) % 1 * total
  if (s < STRAIGHT) return { x: CX1 + s, y: CY - r }
  s -= STRAIGHT
  if (s < arc) {
    const a = -Math.PI / 2 + s / r
    return { x: CX2 + r * Math.cos(a), y: CY + r * Math.sin(a) }
  }
  s -= arc
  if (s < STRAIGHT) return { x: CX2 - s, y: CY + r }
  s -= STRAIGHT
  const a = Math.PI / 2 + s / r
  return { x: CX1 + r * Math.cos(a), y: CY + r * Math.sin(a) }
}

export interface TrackRider {
  id: string
  /** Tooltip: "Tuesday · Sweet Spot 3×12". */
  label: string
  /** Seconds per lap on screen. */
  lapS: number
  /** Someone else's head (the rival coach); the rider's own otherwise. */
  head?: ReactNode
}

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'long' })

/** Monday 00:00 local, this week. */
function weekStart(now: number): number {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime()
}

/** One rider per ride this week: harder rides lap faster (6 s flat out, 12 s for a recovery spin). */
export function weekRiders(rides: readonly RideSummary[], now: number): TrackRider[] {
  const from = weekStart(now)
  return rides
    .filter((r) => !r.simulated && r.startedAt >= from && r.startedAt <= now)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((r) => {
      const intensity = Math.min(1.1, Math.max(0.5, r.intensityFactor ?? 0.7))
      return { id: r.id, label: `${WEEKDAY.format(r.startedAt)} · ${r.name} · ${formatDurationShort(r.movingS)}`, lapS: 12 - ((intensity - 0.5) / 0.6) * 6 }
    })
}

