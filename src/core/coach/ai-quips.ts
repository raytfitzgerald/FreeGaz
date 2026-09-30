// AI quip packs: the request for one (the user message; the system prompt
// lives in main with the rest of the prompts) and the filter every returned
// line must pass before it may join the canned lines for one ride. Topic
// bans do not apply here. What remains is shape (trigger, length,
// placeholders), the rider's profanity setting, and a few TTS checks.
// Distress lines are never AI-written.
import { personaInstruction } from '../ai/prompts'
import { QuipPackSchema } from '../ai/schemas'
import { clampSpice } from '../persona/engine'
import { detectProfanity, languageAllowed } from '../persona/guardrails'
import { bracesBalanced, formatDuration, placeholdersOf } from '../persona/template'
import { isDataKey, toProfanity, type CoachLineTemplate, type ProfanitySetting, type CoachTrigger, type PersonaMeta, type RideKind } from '../persona/types'
import { MAX_LINE_CHARS } from '../persona/validate'
import type { CoachSegment } from './segments'

/** The triggers QUIP_PACK_SYSTEM asks for. Anything else in a reply is dropped. */
export const QUIP_TRIGGERS = [
  'ride_start',
  'segment_start',
  'countdown_10s',
  'halfway',
  'last_minute',
  'segment_end_success',
  'segment_end_failed',
  'under_target',
  'cadence_sag',
  'stopped_pedaling',
  'skipped_interval',
  'intensity_down',
  'wbal_low',
  'pr',
  'workout_complete',
  'ride_bailed',
  'fueling_reminder',
  'idle_banter',
] as const satisfies readonly CoachTrigger[]

export const MAX_AI_LINES = 80
/** Fresh lines get a little more weight than canned lines of the same specificity. */
export const AI_LINE_WEIGHT = 2

const QUIP_TRIGGER_SET: ReadonlySet<string> = new Set(QUIP_TRIGGERS)
/** Spoken aloud, so no links and no emoji (TTS reads their names). */
const UNSPEAKABLE = /https?:\/\/|www\.|@\w+\.\w+|\p{Extended_Pictographic}/u

export interface QuipRide {
  kind: RideKind
  name: string | null
  durationS: number | null
  /** The main work in a few words (workoutStructure). */
  structure: string | null
}

const KIND_LABEL: Record<RideKind, string> = {
  free: 'a free ride with no plan',
  workout: 'a structured workout',
  route: 'a route ride',
  'ftp-test': 'an FTP test',
}

/** The user message for an 'ai.structured' quip-pack request. */
export function quipPackPrompt(meta: PersonaMeta, opts: { spice: number; profanity: ProfanitySetting }, ride: QuipRide): string {
  const name = ride.name ? ride.name.slice(0, 60) : null
  const minutes = ride.durationS !== null && ride.durationS > 0 ? Math.round(ride.durationS / 60) : null
  return [
    personaInstruction({ name: meta.name, tagline: meta.tagline, spice: clampSpice(opts.spice), profanity: toProfanity(opts.profanity) }),
    `Ride: ${KIND_LABEL[ride.kind]}${name ? ` called "${name}"` : ''}${minutes ? `, ${minutes} minutes` : ''}.`,
    ride.structure ? `Main work: ${ride.structure}.` : '',
    'Write two or three lines for every trigger, 40 to 55 lines in all.',
  ]
    .filter(Boolean)
    .join('\n')
}

/** "5 × 4:00 at 115 % FTP; 6 × 15 seconds all-out", from the hard steps in order of appearance. */
export function workoutStructure(segments: readonly CoachSegment[], maxGroups = 4): string | null {
  const groups: { key: string; count: number; text: string }[] = []
  for (const s of segments) {
    if (!s.hard) continue
    const len = formatDuration(s.durationS)
    const what = s.ftpEffort ? 'test effort' : s.fraction === null ? 'all-out' : `at ${Math.round(s.fraction * 100)} % FTP`
    const key = `${Math.round(s.durationS)}|${what}`
    const last = groups.at(-1)
    if (last && last.key === key) last.count++
    else groups.push({ key, count: 1, text: `${len} ${what}` })
  }
  if (groups.length === 0) return null
  return groups
    .slice(0, maxGroups)
    .map((g) => (g.count > 1 ? `${g.count} × ${g.text}` : g.text))
    .join('; ')
}

export type QuipRejection = 'trigger' | 'length' | 'placeholder' | 'profanity' | 'unspeakable' | 'duplicate' | 'limit'

export interface QuipFilterResult {
  lines: CoachLineTemplate[]
  rejected: { text: string; reason: QuipRejection }[]
}

function rejection(trigger: string, text: string, language: 'clean' | 'mild' | 'unhinged'): QuipRejection | null {
  if (!QUIP_TRIGGER_SET.has(trigger)) return 'trigger'
  if (text.length < 3 || text.length > MAX_LINE_CHARS) return 'length'
  if (!bracesBalanced(text) || placeholdersOf(text).some((k) => !isDataKey(k))) return 'placeholder'
  if (UNSPEAKABLE.test(text)) return 'unspeakable'
  if (!languageAllowed(text, language)) return 'profanity'
  return null
}

/**
 * The lines of an AI quip pack that may be used, as canned-style templates at
 * the ride's spice level. Topic bans do not apply; the profanity setting does,
 * and it covers strong language as well as mild.
 */
export function quipLinesFromPack(value: unknown, opts: { persona: PersonaMeta; spice: number; profanity: ProfanitySetting }): QuipFilterResult {
  const parsed = QuipPackSchema.safeParse(value)
  if (!parsed.success) return { lines: [], rejected: [] }
  const language = toProfanity(opts.profanity)
  const spice = clampSpice(opts.spice)
  const lines: CoachLineTemplate[] = []
  const rejected: QuipFilterResult['rejected'] = []
  const seen = new Set<string>()
  const counts = new Map<string, number>()
  for (const raw of parsed.data.lines) {
    const trigger = raw.trigger.trim().toLowerCase()
    const text = raw.text.replace(/\s+/g, ' ').trim()
    const dedupe = text.toLowerCase()
    const reason = lines.length >= MAX_AI_LINES ? 'limit' : seen.has(dedupe) ? 'duplicate' : rejection(trigger, text, language)
    if (reason) {
      rejected.push({ text, reason })
      continue
    }
    seen.add(dedupe)
    const n = (counts.get(trigger) ?? 0) + 1
    counts.set(trigger, n)
    lines.push({
      id: `ai.${trigger}.${n}`,
      text,
      triggers: [trigger as CoachTrigger],
      spice,
      ...(detectProfanity(text) !== null ? { profanity: true } : {}),
      // the prompt's segment_start means an interval start; never read one out at a warmup or recovery
      ...(trigger === 'segment_start' ? { criteria: [{ key: 'hard', op: '==', value: true }] as const } : {}),
      weight: AI_LINE_WEIGHT,
    })
  }
  return { lines, rejected }
}
