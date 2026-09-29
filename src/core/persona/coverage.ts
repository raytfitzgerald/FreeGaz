// How well a pack covers the triggers: used by the pack tests and by the custom
// persona builder to show what is missing. segment_start is split into hard
// segments and each easy kind, since a warmup line cannot stand in for an
// interval start.
import { isHardKind } from './template'
import {
  COACH_TRIGGERS,
  COMMON_TRIGGERS,
  HARD_SEGMENT_KINDS,
  MIN_LINES_COMMON,
  MIN_LINES_OTHER,
  SEGMENT_KINDS,
  isSegmentKind,
  type CoachLineTemplate,
  type CoachTrigger,
  type PersonaPack,
  type SegmentKind,
} from './types'

type EasyKind = Exclude<SegmentKind, 'on' | 'ramp' | 'maxeffort'>
export type CoverageKey = Exclude<CoachTrigger, 'segment_start'> | 'segment_start:hard' | `segment_start:${EasyKind}`

const EASY_KINDS = SEGMENT_KINDS.filter((k) => !HARD_SEGMENT_KINDS.includes(k)) as EasyKind[]

export const COVERAGE_KEYS: readonly CoverageKey[] = [
  ...COACH_TRIGGERS.filter((t): t is Exclude<CoachTrigger, 'segment_start'> => t !== 'segment_start'),
  'segment_start:hard',
  ...EASY_KINDS.map((k): CoverageKey => `segment_start:${k}`),
]

export function minimumLines(key: CoverageKey): number {
  if (key === 'segment_start:hard') return MIN_LINES_COMMON
  return (COMMON_TRIGGERS as readonly string[]).includes(key) ? MIN_LINES_COMMON : MIN_LINES_OTHER
}

/** Which segment_start coverage keys a line counts toward, judging by its criteria. */
function segmentKeys(line: CoachLineTemplate): CoverageKey[] {
  const easy = EASY_KINDS.map((k): CoverageKey => `segment_start:${k}`)
  const kindCriterion = line.criteria?.find((c) => c.key === 'segmentKind' && c.op === '==')
  if (kindCriterion && isSegmentKind(kindCriterion.value)) {
    const k = kindCriterion.value
    return isHardKind(k) ? ['segment_start:hard'] : [`segment_start:${k as EasyKind}`]
  }
  const hardCriterion = line.criteria?.find((c) => c.key === 'hard' && c.op === '==')
  if (hardCriterion) return hardCriterion.value === true ? ['segment_start:hard'] : easy
  return ['segment_start:hard', ...easy]
}

/** Number of lines per coverage key. */
export function packCoverage(pack: PersonaPack): Record<CoverageKey, number> {
  const counts = Object.fromEntries(COVERAGE_KEYS.map((k) => [k, 0])) as Record<CoverageKey, number>
  for (const line of pack.lines) {
    for (const t of new Set(line.triggers)) {
      const keys: CoverageKey[] = t === 'segment_start' ? segmentKeys(line) : [t]
      for (const k of keys) counts[k] += 1
    }
  }
  return counts
}

export interface CoverageGap {
  key: CoverageKey
  have: number
  need: number
}

/** Coverage keys with fewer lines than the minimum (6 for common triggers, 2 otherwise). */
export function coverageGaps(pack: PersonaPack): CoverageGap[] {
  const counts = packCoverage(pack)
  return COVERAGE_KEYS.map((key) => ({ key, have: counts[key], need: minimumLines(key) })).filter((g) => g.have < g.need)
}
