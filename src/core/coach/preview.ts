// A sample line for the persona picker: what this persona would say at a
// typical moment of a ride, at the chosen spice, through the same engine and
// the same gate as a real ride.
import { CoachEngine, clampSpice } from '../persona/engine'
import { sampleVariants } from '../persona/samples'
import type { CoachLine, CoachTrigger, PersonaPack, ProfanitySetting, RideKind } from '../persona/types'
import { gateLine } from './content'

/** Moments that show a persona off: interval cues, a fade, a verdict, a record. */
export const PREVIEW_TRIGGERS: readonly CoachTrigger[] = [
  'segment_start',
  'countdown_10s',
  'halfway',
  'last_minute',
  'under_target',
  'cadence_sag',
  'segment_end_success',
  'segment_end_failed',
  'pr',
  'ride_start',
  'workout_complete',
  'idle_banter',
]

/** Fisher-Yates on a copy. */
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * One of the persona's own lines for a random moment (or `trigger`), or null
 * when it has none at this spice. Professional's fallback lines never stand
 * in for a persona's own voice.
 */
export function previewLine(
  persona: PersonaPack,
  opts: { spice: number; profanity: ProfanitySetting; rng?: () => number; trigger?: CoachTrigger; rideKinds?: readonly RideKind[]; withoutFacts?: readonly string[] },
): CoachLine | null {
  const rng = opts.rng ?? Math.random
  const engine = new CoachEngine({ persona, spice: clampSpice(opts.spice), profanity: opts.profanity, rng })
  // far apart in time, so no cooldown ever gets in the way
  let now = 0
  for (const trigger of opts.trigger ? [opts.trigger] : shuffled(PREVIEW_TRIGGERS, rng)) {
    const variants = sampleVariants(trigger).filter((v) => !opts.rideKinds || opts.rideKinds.includes(v.rideKind))
    for (const ctx of shuffled(variants, rng)) {
      now += 3_600_000
      // leaving a fact out makes the lines that need it ineligible
      const data = opts.withoutFacts ? Object.fromEntries(Object.entries(ctx.data).filter(([k]) => !opts.withoutFacts!.includes(k))) : ctx.data
      const line = engine.consider({ ...ctx, data, now })
      if (!line || line.personaId !== persona.meta.id) continue
      const gated = gateLine(line, { personaId: persona.meta.id, profanity: opts.profanity })
      if (gated) return gated
    }
  }
  return null
}
