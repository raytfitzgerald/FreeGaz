// GeneratedWorkout (the AI's structured output, see ../ai/schemas) → Workout.
//
// - Powers arrive as fractions of FTP and stay that way.
// - Cues arrive on absolute seconds. Each one moves onto the segment it falls
//   in, with its offset relative to that segment (for intervals, the whole
//   expanded block), which is what the model and the compiler expect. Cues at
//   or past the end, and cues with a blank message, are dropped.
// - Labels and names are whitespace-normalized; blank ones are omitted.
// - Tags become lowercase slugs ("Sweet Spot" → "sweet-spot"), deduplicated,
//   matching the library's built-in tags.
//
// The input is assumed to have passed GeneratedWorkoutSchema. The result is
// not validated here: callers run validateWorkout/workoutIssues on it.

import type { GeneratedWorkout } from '../ai/schemas'
import { segmentDurationS } from './edit'
import { slugify } from './ids'
import { normalizeText } from './labels'
import type { PowerTarget, Segment, Workout } from './model'

export interface FromGeneratedOptions {
  id: string
}

type GeneratedSegment = GeneratedWorkout['segments'][number]

/** The fallback name when the model's name is blank after normalizing. */
export const GENERATED_FALLBACK_NAME = 'AI workout'

export function workoutFromGenerated(g: GeneratedWorkout, opts: FromGeneratedOptions): Workout {
  const segments = g.segments.map(toSegment)
  placeCues(segments, g.cues)
  const w: Workout = {
    id: opts.id,
    name: normalizeText(g.name) ?? GENERATED_FALLBACK_NAME,
    tags: cleanTags(g.tags),
    sportType: 'bike',
    segments,
    source: 'ai',
  }
  const description = g.description.trim()
  if (description) w.description = description
  return w
}

const ftp = (value: number): PowerTarget => ({ unit: 'ftp', value })

function toSegment(g: GeneratedSegment): Segment {
  const label = normalizeText(g.label)
  const labelled = <S extends Segment>(seg: S): S => (label ? { ...seg, label } : seg)
  switch (g.kind) {
    case 'steady':
      return labelled({ kind: 'steady', durationS: g.durationS, power: ftp(g.power), ...(g.cadence ? { cadence: { rpm: g.cadence } } : {}) })
    case 'ramp':
      return labelled({ kind: 'ramp', role: g.role, durationS: g.durationS, from: ftp(g.from), to: ftp(g.to) })
    case 'intervals':
      return labelled({
        kind: 'intervals',
        repeat: g.repeat,
        on: { durationS: g.onS, power: ftp(g.onPower), ...(g.onCadence ? { cadence: { rpm: g.onCadence } } : {}) },
        off: { durationS: g.offS, power: ftp(g.offPower) },
      })
    case 'freeride':
      return labelled({ kind: 'freeride', durationS: g.durationS })
    case 'maxeffort':
      return labelled({ kind: 'maxeffort', durationS: g.durationS })
  }
}

/** Attaches absolute-time cues to the segments they fall in (mutates the fresh segments). */
function placeCues(segments: Segment[], cues: GeneratedWorkout['cues']): void {
  const starts: number[] = []
  let t = 0
  for (const seg of segments) {
    starts.push(t)
    t += segmentDurationS(seg)
  }
  const sorted = [...cues].sort((a, b) => a.atS - b.atS)
  for (const cue of sorted) {
    const message = normalizeText(cue.message)
    if (message === undefined) continue
    const i = segments.findIndex((seg, k) => cue.atS >= (starts[k] ?? 0) && cue.atS < (starts[k] ?? 0) + segmentDurationS(seg))
    const seg = segments[i]
    if (!seg) continue
    seg.text = [...(seg.text ?? []), { offsetS: cue.atS - (starts[i] ?? 0), message }]
  }
}

function cleanTags(tags: string[]): string[] {
  const out: string[] = []
  for (const t of tags) {
    const slug = slugify(t)
    if (slug && !out.includes(slug)) out.push(slug)
  }
  return out
}
