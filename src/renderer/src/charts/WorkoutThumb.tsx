import { useMemo } from 'react'
import { zoneIndexForFraction, zoneVar } from '../ui/zones'
import type { ProfileBlock } from './WorkoutChart'

const FREE = 0.6
const MAX = 1.5

/** A small, axis-free workout profile for library cards (decorative: the card text carries the numbers). */
export function WorkoutThumb({ blocks, durationS, height = 44 }: { blocks: ProfileBlock[]; durationS: number; height?: number }) {
  const W = 300
  const top = useMemo(() => Math.max(1.2, ...blocks.map((b) => Math.max(b.from ?? (b.kind === 'maxeffort' ? MAX : FREE), b.to ?? 0))) * 1.05, [blocks])
  const x = (s: number) => (durationS > 0 ? (s / durationS) * W : 0)
  const y = (f: number) => height - (f / top) * height
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden="true">
      {blocks.map((b, i) => {
        const x0 = x(b.startS)
        const x1 = Math.max(x0 + 0.6, x(b.endS) - 0.6)
        if (b.from === null || b.to === null) {
          const f = b.kind === 'maxeffort' ? MAX : FREE
          return <rect key={i} x={x0} y={y(f)} width={x1 - x0} height={height - y(f)} fill={b.kind === 'maxeffort' ? zoneVar(6) : 'var(--color-panel-3)'} />
        }
        const zone = zoneIndexForFraction((b.from + b.to) / 2)
        return <path key={i} d={`M${x0},${height} L${x0},${y(b.from)} L${x1},${y(b.to)} L${x1},${height} Z`} fill={zoneVar(zone)} />
      })}
    </svg>
  )
}
