// How the coach caricature moves: it rides in, hops when a new line starts,
// wiggles its head and flaps its jaw while talking, bobs with every pedal
// stroke, and rides off when the line is over. Pure timing maths, so the
// choreography is testable without a browser; CoachToon only draws the pose.

export interface ToonPose {
  /** Horizontal offset in viewBox units: negative is off to the left. */
  x: number
  /** Vertical offset (hops): negative is up. */
  y: number
  /** Crank angle, radians. */
  crank: number
  /** Wheel rotation, degrees. */
  wheel: number
  /** Head tilt round the neck, degrees. */
  headRot: number
  /** Head bob: negative is up. */
  headLift: number
  headScale: number
  /** 0 is closed, 1 is as open as the jaw goes. */
  jaw: number
  /** The tie streaming behind: -1..1. */
  tie: number
  opacity: number
}

/** Standing still, for reduced motion. */
export const STILL_POSE: Readonly<ToonPose> = { x: 0, y: 0, crank: 0.6, wheel: 0, headRot: 0, headLift: 0, headScale: 1, jaw: 0, tie: 0, opacity: 1 }

export const ENTER_MS = 700
export const LEAVE_MS = 650
export const HOP_MS = 320
/** How far off-stage it starts and ends, in viewBox units (the toon is 150 wide). */
export const OFFSTAGE = 180
/** Cadence when the rider's is unknown. */
export const DEFAULT_RPM = 80
/** Riding in or off, it pedals like mad. */
const DASH_RPM = 130
/** Wheel turns per crank turn: a middling gear. */
const GEAR = 2.6

/** How long a line takes to say, for when nothing is speaking it (text-only coach). */
export function talkEstimateMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.min(7000, Math.max(1200, words * 330))
}

const easeOut = (p: number) => 1 - (1 - p) ** 3
const easeIn = (p: number) => p ** 3
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const TAU = Math.PI * 2

/**
 * The toon's clock. Feed it what happens (a new line, the voice starting and
 * stopping, words, leaving) and call frame() once per animation frame: it
 * integrates the cranks and wheels and returns the pose. Times are ms on any
 * monotonic clock (performance.now() in the app).
 */
export class ToonMotion {
  /** Riding in starts on the first frame, so it never begins half-way across. */
  private enterPending: boolean
  private enterAt: number | null = null
  private lineAt: number | null = null
  private text = ''
  private busy = false
  /** The voice has spoken since the line began: stop estimating and follow it. */
  private voiced = false
  private wordAt: number | null = null
  private leaveAt: number | null = null
  private crank = STILL_POSE.crank
  private wheel = 0
  private last: number | null = null

  constructor(opts: { enter: boolean }) {
    this.enterPending = opts.enter
  }

  /** A new line started: the next head pops on, hops and starts talking. */
  line(now: number, text: string): void {
    // on its way off: come round again
    if (this.leaveAt !== null) this.enterPending = true
    this.lineAt = now
    this.text = text
    this.voiced = this.busy
    this.wordAt = null
    this.leaveAt = null
  }

  private lineKey: string | number | null = null

  /** line(), once per key: telling it about the same line again changes nothing. */
  lineFor(key: string | number, now: number, text: string): void {
    if (key === this.lineKey) return
    this.lineKey = key
    this.line(now, text)
  }

  /** The voice started or stopped. */
  speaking(busy: boolean, now: number): void {
    this.busy = busy
    if (busy && this.lineAt !== null && now >= this.lineAt) this.voiced = true
  }

  /** The voice reached a word boundary. */
  word(now: number): void {
    this.wordAt = now
  }

  leave(now: number): void {
    if (this.leaveAt === null) this.leaveAt = now
  }

  /** True once it has ridden all the way off. */
  gone(now: number): boolean {
    return this.leaveAt !== null && now - this.leaveAt >= LEAVE_MS
  }

  /** Talking right now: the voice is, or (no voice) the line would still be being said. */
  talking(now: number): boolean {
    if (this.busy) return true
    if (this.voiced || this.lineAt === null) return false
    const dt = now - this.lineAt
    return dt >= 0 && dt < talkEstimateMs(this.text)
  }

  /** When the current line's pop, wiggle and hop happen: on arrival for the line it rode in with. */
  private beatAt(): number | null {
    if (this.lineAt === null) return null
    if (this.enterAt !== null && this.lineAt - this.enterAt < ENTER_MS) return this.enterAt + ENTER_MS - 80
    return this.lineAt
  }

  frame(now: number, rpm: number | null): ToonPose {
    if (this.enterPending) {
      this.enterPending = false
      this.enterAt = now
    }
    const dtS = this.last === null ? 0 : Math.min(0.1, Math.max(0, (now - this.last) / 1000))
    this.last = now
    const T = now / 1000

    // it wanders a little, pedalling at the rider's cadence (0 coasts)
    let x = 3 * Math.sin((T * TAU) / 3.4)
    let pedal = rpm ?? DEFAULT_RPM
    let opacity = 1
    if (this.enterAt !== null && now - this.enterAt < ENTER_MS) {
      x = -OFFSTAGE * (1 - easeOut(clamp01((now - this.enterAt) / ENTER_MS)))
      pedal = DASH_RPM
    }
    if (this.leaveAt !== null) {
      const p = clamp01((now - this.leaveAt) / LEAVE_MS)
      x = OFFSTAGE * easeIn(p)
      opacity = 1 - p
      pedal = DASH_RPM
    }
    this.crank = (this.crank + (pedal / 60) * TAU * dtS) % TAU
    this.wheel = (this.wheel + (pedal / 60) * GEAR * 360 * dtS) % 360

    // bob with each pedal stroke
    let headRot = 1.5 * Math.sin(this.crank)
    let headLift = 0.8 * Math.sin(this.crank * 2)
    let headScale = 1
    let jaw = 0
    let y = 0

    const beat = this.beatAt()
    if (beat !== null && now >= beat) {
      const dt = (now - beat) / 1000
      // the new head pops on, overshoots a touch and settles, wiggling on its spring
      headScale = 1 - 0.18 * Math.exp(-dt / 0.15) * Math.cos(dt * 18)
      headRot += 14 * Math.exp(-dt / 0.55) * Math.sin(dt * TAU * 2.4)
      if (now - beat < HOP_MS) y = -9 * Math.sin((Math.PI * (now - beat)) / HOP_MS)
    }

    if (this.talking(now)) {
      headRot += 5 * Math.sin(T * TAU * 1.3) + 2.5 * Math.sin(T * TAU * 3.1 + 0.7)
      headLift -= 1.2 * Math.abs(Math.sin(T * TAU * 2.6))
      // syllables: a fast flap, with a slower swell so it isn't metronomic
      const flap = Math.abs(Math.sin(T * Math.PI * 9.2)) ** 0.8 * (0.55 + 0.45 * Math.abs(Math.sin(T * Math.PI * 1.3 + 1)))
      jaw = flap
      if (this.wordAt !== null) {
        const w = (now - this.wordAt) / 1000
        if (w >= 0 && w < 0.7) {
          // the voice reports words: open on each one, with a nod
          const pulse = w < 0.3 ? Math.min(1, w / 0.03) * Math.exp(-w / 0.09) : 0
          jaw = 0.35 * flap + pulse
          headRot += 2 * pulse
          headLift += 1.5 * pulse
        }
      }
    }

    const tie = Math.sin(T * TAU * (pedal / 60) * 2.2)
    return { x, y, crank: this.crank, wheel: this.wheel, headRot, headLift, headScale, jaw: clamp01(jaw), tie, opacity }
  }
}

/** Which head each set is on, and for which line, so every line gets the next head (and asking twice doesn't skip one). */
const assigned = new Map<string, { line: string | number; index: number }>()

/** The head for a line: round robin through the set, one step per new line. Idempotent per line. */
export function headForLine(setKey: string, line: string | number | null, count: number): number {
  if (count <= 0) return 0
  const a = assigned.get(setKey)
  if (line === null) return (a?.index ?? 0) % count
  if (a && a.line === line) return a.index % count
  // the set starts on its first head, so even the first line brings a new face
  const index = ((a?.index ?? 0) + 1) % count
  assigned.set(setKey, { line, index })
  return index
}

/** For tests. */
export function resetHeadCycles(): void {
  assigned.clear()
}

/** Two-bone leg: the knee for a hip and foot, bending forward (towards +x). SVG coordinates, y down. */
export function knee(hip: { x: number; y: number }, foot: { x: number; y: number }, thigh: number, shin: number): { x: number; y: number } {
  const dx = foot.x - hip.x
  const dy = foot.y - hip.y
  const d = Math.min(Math.hypot(dx, dy), thigh + shin - 1e-6)
  const a = Math.atan2(dy, dx)
  const cos = (thigh * thigh + d * d - shin * shin) / (2 * thigh * Math.max(d, 1e-6))
  const alpha = Math.acos(Math.min(1, Math.max(-1, cos)))
  return { x: hip.x + thigh * Math.cos(a - alpha), y: hip.y + thigh * Math.sin(a - alpha) }
}
