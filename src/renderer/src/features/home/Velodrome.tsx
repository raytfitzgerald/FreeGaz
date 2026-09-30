import { useEffect, useRef, type ReactNode } from 'react'
import { useReducedMotion } from '../../ui/use-reduced-motion'
import { CX1, CX2, CY, lanePoint, oval, type TrackRider } from './track'

// The velodrome from above (the brand mark's own geometry and colours), with
// one rider on the boards for every ride this week (with the rider's own
// face, if they added one). Harder rides lap faster. The coach stands in the
// infield with a megaphone. With nothing ridden yet, a dashed ghost waits on
// the line.

const LANES = [128, 150, 172]

export function Velodrome({ riders, head, coach, className }: { riders: readonly TrackRider[]; head: ReactNode; coach?: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const els = [...svg.querySelectorAll<SVGGElement>('[data-rider]')]
    const place = (now: number) =>
      els.forEach((el, i) => {
        const rider = riders[i]
        if (!rider) return
        // spread the pack out, then let each ride lap at its own pace
        const t = i / Math.max(1, riders.length) + (reduced ? 0 : now / 1000 / rider.lapS)
        const p = lanePoint(t, LANES[i % LANES.length]!)
        el.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`)
      })
    place(0)
    if (reduced) return
    let raf = 0
    const step = (now: number) => {
      place(now)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [riders, reduced])

  const start = lanePoint(0, 150)
  return (
    <svg ref={ref} viewBox="158 286 708 452" className={className} role="img" aria-label={riders.length === 0 ? 'The velodrome, empty' : `The velodrome, with ${riders.length} rider${riders.length === 1 ? '' : 's'}: one for each ride this week`}>
      <path d={`M${CX1} 413 L${CX2} 413 A99 99 0 0 1 ${CX2} 611 L${CX1} 611 A99 99 0 0 1 ${CX1} 413 Z`} fill="var(--color-stayer)" />
      <path d={oval(150)} fill="none" stroke="var(--color-board)" strokeWidth={104} />
      <path d={oval(114)} fill="none" stroke="var(--color-azure)" strokeWidth={20} />
      <path d={oval(136)} fill="none" stroke="var(--color-night)" strokeWidth={6} />
      <path d={oval(156)} fill="none" stroke="var(--color-sprinter)" strokeWidth={9} />
      <path d={oval(182)} fill="none" stroke="var(--color-stayer)" strokeWidth={9} />
      {/* the finish line across the home straight */}
      <line x1={512} y1={CY - 204} x2={512} y2={CY - 96} stroke="var(--color-night)" strokeWidth={5} />
      {coach && (
        <g transform={`translate(${(CX1 + CX2) / 2} ${CY})`} data-testid="velodrome-coach">
          {/* the megaphone, pointed at the track */}
          <path d="M40 -8 L78 -30 L78 18 L40 4 Z" fill="var(--color-board)" stroke="var(--color-night)" strokeWidth={4} strokeLinejoin="round" />
          <path d="M88 -26 Q98 -6 88 14 M100 -34 Q114 -6 100 22" fill="none" stroke="var(--color-board)" strokeWidth={5} strokeLinecap="round" />
          <circle r={50} fill="var(--color-board)" stroke="var(--color-night)" strokeWidth={4} />
          <g transform="scale(3.8)">{coach}</g>
        </g>
      )}
      {riders.length === 0 ? (
        <g transform={`translate(${start.x + 90} ${start.y})`} data-testid="velodrome-ghost">
          <circle r={22} fill="none" stroke="var(--color-night)" strokeWidth={5} strokeDasharray="8 7" opacity={0.6} />
        </g>
      ) : (
        riders.map((r) => (
          <g key={r.id} data-rider data-testid="velodrome-rider">
            <title>{r.label}</title>
            <circle r={26} fill="var(--color-board)" stroke="var(--color-night)" strokeWidth={4} />
            <g transform="scale(1.8)">{head}</g>
          </g>
        ))
      )}
    </svg>
  )
}
