// A compact way to write persona packs: group lines by trigger, give each
// group shared criteria, and let ids number themselves (`pack.trigger.n`).
// Append new lines at the end of a group's trigger to keep existing ids stable.
import type { CoachLineTemplate, CoachTrigger, Criterion, SegmentKind, Spice } from '../types'

export interface LineOpts {
  profanity?: boolean
  weight?: number
  criteria?: readonly Criterion[]
  /** More triggers this line also serves. */
  also?: readonly CoachTrigger[]
}

/** [spice, text, options?] */
export type LineSpec = readonly [Spice, string, LineOpts?]

export class PackBuilder {
  private readonly lines: CoachLineTemplate[] = []
  private readonly counters = new Map<CoachTrigger, number>()

  constructor(private readonly packId: string) {}

  /** Adds lines for one trigger; `criteria` apply to every line in the group. */
  add(trigger: CoachTrigger, specs: readonly LineSpec[], criteria: readonly Criterion[] = []): this {
    for (const [spice, text, opts] of specs) {
      const n = (this.counters.get(trigger) ?? 0) + 1
      this.counters.set(trigger, n)
      const all = [...criteria, ...(opts?.criteria ?? [])]
      this.lines.push({
        id: `${this.packId}.${trigger}.${n}`,
        text,
        triggers: opts?.also ? [trigger, ...opts.also] : [trigger],
        spice,
        ...(opts?.profanity ? { profanity: true } : {}),
        ...(all.length > 0 ? { criteria: all } : {}),
        ...(opts?.weight !== undefined ? { weight: opts.weight } : {}),
      })
    }
    return this
  }

  build(): readonly CoachLineTemplate[] {
    return this.lines
  }
}

export const eq = (key: string, value: number | string | boolean): Criterion => ({ key, op: '==', value })
export const ne = (key: string, value: number | string | boolean): Criterion => ({ key, op: '!=', value })
export const gt = (key: string, value: number): Criterion => ({ key, op: '>', value })
export const gte = (key: string, value: number): Criterion => ({ key, op: '>=', value })
export const lt = (key: string, value: number): Criterion => ({ key, op: '<', value })
export const lte = (key: string, value: number): Criterion => ({ key, op: '<=', value })

/** The segment is a hard effort. */
export const HARD = eq('hard', true)
export const kind = (k: SegmentKind): Criterion => eq('segmentKind', k)
/** The last repetition of an interval set. */
export const LAST_REP = eq('repsLeft', 0)
export const rideKind = (k: 'free' | 'workout' | 'route' | 'ftp-test'): Criterion => eq('rideKind', k)

/** Line options: profanity. */
export const P: LineOpts = { profanity: true }
/** Line options: extra criteria. */
export const when = (...criteria: Criterion[]): LineOpts => ({ criteria })
/** Line options: extra criteria, with profanity. */
export const whenP = (...criteria: Criterion[]): LineOpts => ({ criteria, profanity: true })
