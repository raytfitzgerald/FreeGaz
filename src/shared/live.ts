import { z } from 'zod'

// The live frame: a display-ready snapshot of everything happening right now,
// published ~4x per second by the ride engine. The main window's widgets,
// the mini-HUD and the phone remote all render from this one shape.

export type TrainerMode = 'idle' | 'erg' | 'resistance' | 'sim' | 'hr'
export type TrainerGuard = 'none' | 'soft-start' | 'spiral' | 'paused'

export interface LiveTrainer {
  /** What the rider asked for. */
  mode: TrainerMode
  /** ERG target after intensity scaling (W), or null. */
  targetW: number | null
  /** SIM grade actually sent to the trainer (after slope scaling). */
  gradePct: number | null
  /** Route/manual grade before scaling. */
  rawGradePct: number | null
  resistancePct: number | null
  targetHr: number | null
  intensityPct: number
  guard: TrainerGuard
  /** Another app/head unit has taken control of the trainer. */
  controlLost: boolean
  connected: boolean
}

export interface LiveFrame {
  /** Monotonic ms on the engine clock. */
  t: number
  /** Wall-clock epoch ms. */
  wall: number
  power: number | null
  power3s: number | null
  power10s: number | null
  cadence: number | null
  hr: number | null
  /** Trainer-reported speed, km/h. */
  speedKmh: number | null
  trainer: LiveTrainer
  sources: { power: string | null; cadence: string | null; hr: string | null }
  simulated: boolean
}

export const EMPTY_FRAME: LiveFrame = {
  t: 0,
  wall: 0,
  power: null,
  power3s: null,
  power10s: null,
  cadence: null,
  hr: null,
  speedKmh: null,
  trainer: {
    mode: 'idle',
    targetW: null,
    gradePct: null,
    rawGradePct: null,
    resistancePct: null,
    targetHr: null,
    intensityPct: 100,
    guard: 'none',
    controlLost: false,
    connected: false,
  },
  sources: { power: null, cadence: null, hr: null },
  simulated: false,
}

// ---- commands -----------------------------------------------------------------
// Every input (keyboard, on-screen buttons, mini-HUD, phone remote) becomes a
// RideCommand handled by one dispatcher in the main window's renderer.

export const RideCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('togglePause') }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('skip') }),
  z.object({ type: z.literal('back') }),
  z.object({ type: z.literal('extend'), seconds: z.number().int().min(5).max(600) }),
  z.object({ type: z.literal('lap') }),
  z.object({ type: z.literal('intensity'), deltaPct: z.number().int().min(-20).max(20) }),
  z.object({ type: z.literal('nudge'), delta: z.number().min(-100).max(100) }),
  z.object({ type: z.literal('mode'), mode: z.enum(['erg', 'resistance', 'sim', 'hr']) }),
  z.object({ type: z.literal('muteCoach') }),
  // Interval rescue answer: 5 % easier, a 30-s breather, or "I've got this".
  z.object({ type: z.literal('rescue'), choice: z.enum(['easier', 'rest', 'dismiss']) }),
])
export type RideCommand = z.infer<typeof RideCommandSchema>

/** Extra ride state shown by the mini-HUD / phone (null when not riding). */
export interface LiveRide {
  state: 'idle' | 'riding' | 'paused' | 'finished'
  name: string
  elapsedS: number
  movingS: number
  segmentLabel: string | null
  segmentRemainingS: number | null
  nextLabel: string | null
  workoutRemainingS: number | null
  targetW: number | null
  np: number | null
  tss: number | null
  kj: number
  wbalPct: number | null
  distanceM: number
  coachLine: string | null
}

export interface LiveBroadcast {
  frame: LiveFrame
  ride: LiveRide | null
}
