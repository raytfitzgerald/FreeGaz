import { useEffect, useRef, useState } from 'react'
import { cn } from '../../ui/cn'
import { useReducedMotion } from '../../ui/use-reduced-motion'
import type { ToonHead } from './heads'
import { STILL_POSE, ToonMotion, headForLine, knee, type ToonPose } from './motion'

// A bobblehead on a little bike: the photo head sits on a spring above a
// cartoon politician in a suit, tie streaming behind. Everything is drawn in
// one viewBox; the animation writes attributes straight onto the elements
// each frame, so React renders only when the line or the head changes.

const VB = { x: 0, y: -28, w: 150, h: 170 }
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
const SHOULDER = { x: 81, y: 85 }
/** The chin sits here; the head turns round it. */
const NECK = { x: 86, y: 80 }
const ELBOW = { x: 94, y: 95 }
const HAND = { x: 103, y: 103 }
const THIGH = 22
const SHIN = 21
const HEAD = 92
/** The head image's top: its chin (just above the canvas edge) settles onto the collar. */
const HEAD_Y = NECK.y - HEAD + 4
const JAW_DROP = HEAD * 0.06

const INK = {
  outline: '#ffffff',
  suit: '#22304f',
  suitFar: '#172036',
  shoe: '#15171c',
  tire: '#2a2f3a',
  spoke: '#aab2bf',
  hub: '#cbd2dc',
  metal: '#6b7280',
  spring: '#9aa3b2',
} as const

const pt = (p: { x: number; y: number }) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`

function pedal(angle: number) {
  return { x: BB.x + CRANK * Math.cos(angle), y: BB.y + CRANK * Math.sin(angle) }
}

function legPath(angle: number): string {
  const foot = pedal(angle)
  return `M${pt(HIP)} L${pt(knee(HIP, foot, THIGH, SHIN))} L${pt(foot)}`
}

/** The cartoon suit's tie: its colour, and how far it streams behind (1 is a normal tie). */
export interface ToonTie {
  color: string
  length: number
}

export const DEFAULT_TIE: ToonTie = { color: '#2d6cdf', length: 1 }

function tiePath(flap: number, length: number): string {
  // Knot at the collar; the tail streams back and flutters. A longer tie is
  // wider too, and flies up over the rider's back, clear of the dark suit.
  const x = (d: number) => (86 - d * length).toFixed(2)
  const extra = Math.max(0, length - 1)
  const f = flap * Math.max(1, length * 0.9)
  const lift = 7 * extra
  const width = 4 * (1 + 0.35 * extra)
  const y = (v: number) => v.toFixed(2)
  return (
    `M86 84 C${x(6)} ${y(82 + f - lift * 0.3)} ${x(11)} ${y(84 - f - lift * 0.7)} ${x(19)} ${y(83 + 2.2 * f - lift)} ` +
    `L${x(17)} ${y(83 + 2.2 * f - lift + width)} C${x(10)} ${y(88 - f - lift * 0.6)} ${x(5)} ${y(87 + f * 0.5 - lift * 0.2)} 86 87 Z`
  )
}

/** The animated parts, found by data-part once the SVG is in the page. */
function parts(svg: SVGSVGElement) {
  const one = <T extends Element>(k: string) => svg.querySelector<T>(`[data-part="${k}"]`)
  const all = <T extends Element>(k: string) => [...svg.querySelectorAll<T>(`[data-part="${k}"]`)]
  return {
    root: one<SVGGElement>('root'),
    wheelRear: one<SVGGElement>('wheel-rear'),
    wheelFront: one<SVGGElement>('wheel-front'),
    legNear: all<SVGPathElement>('leg-near'),
    legFar: all<SVGPathElement>('leg-far'),
    crankNear: one<SVGLineElement>('crank-near'),
    crankFar: one<SVGLineElement>('crank-far'),
    shoeNear: one<SVGEllipseElement>('shoe-near'),
    shoeFar: one<SVGEllipseElement>('shoe-far'),
    tie: one<SVGPathElement>('tie'),
    head: one<SVGGElement>('head'),
    jaw: one<SVGImageElement>('jaw'),
  }
}
type Parts = ReturnType<typeof parts>

function apply(els: Parts, p: ToonPose, tie: ToonTie): void {
  els.root?.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`)
  els.root?.setAttribute('opacity', p.opacity.toFixed(3))
  els.wheelRear?.setAttribute('transform', `rotate(${p.wheel.toFixed(1)} ${pt(REAR)})`)
  els.wheelFront?.setAttribute('transform', `rotate(${p.wheel.toFixed(1)} ${pt(FRONT)})`)
  const near = legPath(p.crank)
  const far = legPath(p.crank + Math.PI)
  for (const el of els.legNear) el.setAttribute('d', near)
  for (const el of els.legFar) el.setAttribute('d', far)
  const pn = pedal(p.crank)
  const pf = pedal(p.crank + Math.PI)
  els.crankNear?.setAttribute('x2', pn.x.toFixed(2))
  els.crankNear?.setAttribute('y2', pn.y.toFixed(2))
  els.crankFar?.setAttribute('x2', pf.x.toFixed(2))
  els.crankFar?.setAttribute('y2', pf.y.toFixed(2))
  els.shoeNear?.setAttribute('transform', `translate(${pt(pn)})`)
  els.shoeFar?.setAttribute('transform', `translate(${pt(pf)})`)
  els.tie?.setAttribute('d', tiePath(p.tie, tie.length))
  els.head?.setAttribute(
    'transform',
    `translate(${NECK.x} ${(NECK.y + p.headLift).toFixed(2)}) rotate(${p.headRot.toFixed(2)}) scale(${p.headScale.toFixed(3)}) translate(${-NECK.x} ${-NECK.y})`,
  )
  els.jaw?.setAttribute('y', (HEAD_Y + p.jaw * JAW_DROP).toFixed(2))
}

export interface CoachToonProps {
  heads: readonly ToonHead[]
  /** Which rotation the heads belong to (the persona id): each set keeps its own place. */
  setKey: string
  /** The suit's tie. */
  tie?: ToonTie
  /** Changes with every new line: the next head pops on, hops and wiggles. Null: no line yet. */
  lineKey: string | number | null
  /** The line being said, to time the jaw when nothing speaks it. */
  text: string
  /** The voice is speaking. */
  speaking: boolean
  /** Bumps at each spoken word, for voices that report them. */
  words?: number
  /** Ride in from the left when it first appears. */
  enter?: boolean
  /** Ride off to the right and fade. */
  leaving?: boolean
  /** The rider's cadence, read every frame; 0 coasts, null means unknown. */
  cadence?: () => number | null
  /** Height in CSS px; the width follows. */
  height?: number
  label: string
  className?: string
}

/** The coach caricature: a photo bobblehead riding a little bike, talking along with its lines. */
export function CoachToon({ heads, setKey, tie = DEFAULT_TIE, lineKey, text, speaking, words = 0, enter = false, leaving = false, cadence, height = 96, label, className }: CoachToonProps) {
  const reduced = useReducedMotion()
  const [motion] = useState(() => new ToonMotion({ enter }))
  const svgRef = useRef<SVGSVGElement>(null)
  const headIndex = headForLine(setKey, lineKey, heads.length)
  const head = heads[headIndex] ?? heads[0]

  useEffect(() => {
    if (lineKey !== null) motion.lineFor(lineKey, performance.now(), text)
  }, [motion, lineKey, text])
  useEffect(() => motion.speaking(speaking, performance.now()), [motion, speaking])
  useEffect(() => {
    if (words > 0) motion.word(performance.now())
  }, [motion, words])
  useEffect(() => {
    if (leaving) motion.leave(performance.now())
  }, [motion, leaving])

  // every head ready before its turn, so a swap never flashes empty
  useEffect(() => {
    for (const h of heads) {
      new Image().src = h.head
      new Image().src = h.jaw
    }
  }, [heads])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const els = parts(svg)
    if (reduced) {
      apply(els, STILL_POSE, tie)
      return
    }
    let raf = 0
    const step = (t: number) => {
      apply(els, motion.frame(t, cadence ? cadence() : null), tie)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [motion, reduced, cadence, tie])

  const width = (height * VB.w) / VB.h
  const still = STILL_POSE
  const stillNear = legPath(still.crank)
  const stillFar = legPath(still.crank + Math.PI)
  const pn = pedal(still.crank)
  const pf = pedal(still.crank + Math.PI)
  const frame = (w: number, color: string) => (
    <g stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d={`M${pt(REAR)} L${pt(BB)} L${pt(SEAT)} Z`} />
      <path d={`M${pt(SEAT)} L${pt(HT_TOP)} L${pt(HT_BOT)} L${pt(BB)}`} />
      <path d={`M${pt(HT_BOT)} L${pt(FRONT)}`} />
      <path d={`M${pt(SEAT)} L53 100`} />
      <path d={`M${pt(HT_TOP)} L99 99 L104 101 L103 108`} />
    </g>
  )
  const wheel = (c: { x: number; y: number }, i: number) => (
    <g key={i}>
      <circle cx={c.x} cy={c.y} r={R} fill="none" stroke={INK.outline} strokeWidth={6.5} />
      <circle cx={c.x} cy={c.y} r={R} fill="none" stroke={INK.tire} strokeWidth={3.5} />
      <g data-part={i === 0 ? 'wheel-rear' : 'wheel-front'} stroke={INK.spoke} strokeWidth={0.9}>
        {[0, 60, 120].map((a) => {
          const rad = (a * Math.PI) / 180
          const dx = (R - 2) * Math.cos(rad)
          const dy = (R - 2) * Math.sin(rad)
          return <line key={a} x1={c.x - dx} y1={c.y - dy} x2={c.x + dx} y2={c.y + dy} />
        })}
      </g>
      <circle cx={c.x} cy={c.y} r={1.8} fill={INK.hub} />
    </g>
  )

  return (
    <div className={cn('relative shrink-0 select-none', className)} style={{ width, height }} role="img" aria-label={label} data-testid="coach-toon" data-head={headIndex}>
      <svg ref={svgRef} viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} width={width} height={height} className="overflow-visible drop-shadow-[0_1px_1.5px_rgb(0_0_0/0.35)]" aria-hidden>
        <g data-part="root">
          {/* the far leg, behind the bike */}
          <path data-part="leg-far" d={stillFar} stroke={INK.outline} strokeWidth={10.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path data-part="leg-far" d={stillFar} stroke={INK.suitFar} strokeWidth={7.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <line data-part="crank-far" x1={BB.x} y1={BB.y} x2={pf.x} y2={pf.y} stroke={INK.metal} strokeWidth={2.4} strokeLinecap="round" />
          <ellipse data-part="shoe-far" transform={`translate(${pt(pf)})`} rx={5} ry={2.6} fill={INK.shoe} stroke={INK.outline} strokeWidth={1.5} />

          {[REAR, FRONT].map(wheel)}
          {frame(6.2, INK.outline)}
          {frame(3.2, 'var(--color-accent)')}
          <path d="M45 100.5 Q52 97.5 60 99.5" stroke={INK.outline} strokeWidth={6} strokeLinecap="round" fill="none" />
          <path d="M45 100.5 Q52 97.5 60 99.5" stroke={INK.shoe} strokeWidth={3.2} strokeLinecap="round" fill="none" />

          {/* torso and arm, outline first so the joins stay clean */}
          <g stroke={INK.outline} strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d={`M${pt(HIP)} L${pt(SHOULDER)}`} strokeWidth={16} />
            <path d={`M${pt(SHOULDER)} L${pt(ELBOW)} L${pt(HAND)}`} strokeWidth={9} />
          </g>
          <path d={`M${pt(HIP)} L${pt(SHOULDER)}`} stroke={INK.suit} strokeWidth={13} strokeLinecap="round" fill="none" />

          {/* the near crank and leg */}
          <circle cx={BB.x} cy={BB.y} r={5.5} fill="none" stroke={INK.metal} strokeWidth={1.6} />
          <line data-part="crank-near" x1={BB.x} y1={BB.y} x2={pn.x} y2={pn.y} stroke={INK.metal} strokeWidth={2.4} strokeLinecap="round" />
          <path data-part="leg-near" d={stillNear} stroke={INK.outline} strokeWidth={10.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path data-part="leg-near" d={stillNear} stroke={INK.suit} strokeWidth={7.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <ellipse data-part="shoe-near" transform={`translate(${pt(pn)})`} rx={5} ry={2.6} fill={INK.shoe} stroke={INK.outline} strokeWidth={1.5} />

          <path d={`M${pt(SHOULDER)} L${pt(ELBOW)} L${pt(HAND)}`} stroke={INK.suit} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <circle cx={HAND.x} cy={HAND.y} r={3} fill={INK.shoe} />

          {/* collar, the tie streaming back, and the spring the head bobbles on */}
          <path data-part="tie" d={tiePath(0, tie.length)} fill={tie.color} stroke={INK.outline} strokeWidth={1.2} strokeLinejoin="round" />
          <path d="M81 81 L91 81 L86 87.5 Z" fill="#ffffff" stroke={INK.outline} strokeWidth={1} strokeLinejoin="round" />
          <path d={`M${NECK.x} 84 l-3 -1.6 l6 -1.6 l-6 -1.6 l6 -1.6 l-3 -1.6`} stroke={INK.spring} strokeWidth={1.4} fill="none" strokeLinejoin="round" />

          <g data-part="head">
            {head && (
              <>
                <image href={head.head} x={NECK.x - HEAD / 2} y={HEAD_Y} width={HEAD} height={HEAD} />
                <image
                  data-part="jaw"
                  href={head.jaw}
                  x={NECK.x - HEAD / 2}
                  y={HEAD_Y}
                  width={HEAD}
                  height={HEAD}
                />
              </>
            )}
          </g>
        </g>
      </svg>
    </div>
  )
}
