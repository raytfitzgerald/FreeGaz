import { useEffect, useRef, type ReactNode } from 'react'
import { useReducedMotion } from '../../ui/use-reduced-motion'
import { knee } from '../toon/motion'

// A little cartoon cyclist for the ride-along: the same bike as the coach
// caricatures, with a round head instead of a photo. The legs follow a
// cadence read every frame and are written straight onto the SVG.

const GROUND = 140
const R = 14
const REAR = { x: 30, y: GROUND - R }
const FRONT = { x: 108, y: GROUND - R }
const BB = { x: 62, y: 127 }
const CRANK = 8
const SEAT = { x: 53, y: 104 }
const HT_TOP = { x: 96, y: 103 }
const HT_BOT = { x: 99, y: 112 }
const HIP = { x: 53, y: 97 }
const SHOULDER = { x: 83, y: 84 }
const ELBOW = { x: 95, y: 95 }
const HAND = { x: 103, y: 103 }
const HEAD = { x: 93, y: 70, r: 12 }
const THIGH = 22
const SHIN = 21
const CYCLIST_VIEW = { w: 140, h: 150 }

const pt = (p: { x: number; y: number }) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`
const pedal = (a: number) => ({ x: BB.x + CRANK * Math.cos(a), y: BB.y + CRANK * Math.sin(a) })
const leg = (a: number) => {
  const foot = pedal(a)
  return `M${pt(HIP)} L${pt(knee(HIP, foot, THIGH, SHIN))} L${pt(foot)}`
}

export interface CyclistProps {
  /** Jersey colour (a CSS colour or var). */
  jersey: string
  /** What sits on the shoulders: drawn centred on (0, 0), about 24 units across. */
  head: ReactNode
  /** rpm, read every frame; null or 0 coasts. */
  cadence: () => number | null
  height: number
  label: string
  testId?: string
}

export function Cyclist({ jersey, head, cadence, height, label, testId }: CyclistProps) {
  const reduced = useReducedMotion()
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    const svg = ref.current
    if (!svg || reduced) return
    const near = svg.querySelector('[data-part="leg-near"]')
    const far = svg.querySelector('[data-part="leg-far"]')
    const wheels = [...svg.querySelectorAll('[data-part="spokes"]')]
    let crank = 0.6
    let last = performance.now()
    let raf = 0
    const step = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000)
      last = t
      const rpm = cadence() ?? 0
      crank += (rpm / 60) * 2 * Math.PI * dt
      near?.setAttribute('d', leg(crank))
      far?.setAttribute('d', leg(crank + Math.PI))
      const deg = ((crank * 180) / Math.PI) * 2.2
      wheels.forEach((w, i) => w.setAttribute('transform', `rotate(${deg.toFixed(1)} ${pt(i === 0 ? REAR : FRONT)})`))
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [cadence, reduced])

  const width = (height * CYCLIST_VIEW.w) / CYCLIST_VIEW.h
  const wheel = (c: { x: number; y: number }, i: number) => (
    <g key={i}>
      <circle cx={c.x} cy={c.y} r={R} fill="none" stroke="var(--color-ink)" strokeWidth={3} />
      <g data-part="spokes" stroke="var(--color-ink-faint)" strokeWidth={0.9}>
        {[0, 60, 120].map((a) => {
          const rad = (a * Math.PI) / 180
          return <line key={a} x1={c.x - (R - 2) * Math.cos(rad)} y1={c.y - (R - 2) * Math.sin(rad)} x2={c.x + (R - 2) * Math.cos(rad)} y2={c.y + (R - 2) * Math.sin(rad)} />
        })}
      </g>
    </g>
  )
  return (
    <svg ref={ref} viewBox={`0 0 ${CYCLIST_VIEW.w} ${CYCLIST_VIEW.h}`} width={width} height={height} role="img" aria-label={label} data-testid={testId} className="overflow-visible">
      <path data-part="leg-far" d={leg(0.6 + Math.PI)} stroke="var(--color-ink-faint)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {[REAR, FRONT].map(wheel)}
      <g stroke="var(--color-ink-dim)" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d={`M${pt(REAR)} L${pt(BB)} L${pt(SEAT)} Z`} />
        <path d={`M${pt(SEAT)} L${pt(HT_TOP)} L${pt(HT_BOT)} L${pt(BB)}`} />
        <path d={`M${pt(HT_BOT)} L${pt(FRONT)}`} />
      </g>
      <path d={`M${pt(HIP)} L${pt(SHOULDER)}`} stroke={jersey} strokeWidth={13} strokeLinecap="round" fill="none" />
      <path d={`M${pt(SHOULDER)} L${pt(ELBOW)} L${pt(HAND)}`} stroke={jersey} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path data-part="leg-near" d={leg(0.6)} stroke="var(--color-ink)" strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <g transform={`translate(${HEAD.x} ${HEAD.y})`}>{head}</g>
    </svg>
  )
}
