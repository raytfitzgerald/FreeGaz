// The last gate before anything is shown or spoken. The engine already checks
// rendered canned lines against the global guardrails; this module adds what
// it does not know about: persona-specific bans (the Bibi parody's list)
// applied to the facts that get rendered into lines, and a final check of
// every canned line. AI-written lines (lineId "ai.*") skip the topic bans.
//
// Facts matter because workout files are user data: a Bibi line like
// "Today's program is {workoutName}" must never render "Battle of the Bulge".
// Dropping the fact makes that one line ineligible, so the engine simply picks
// another one and no cue is lost.
import { detectProfanity, normalizeForMatching, violatesGuardrails } from '../persona/guardrails'
import { BIBI_BANNED_PATTERNS } from '../persona/packs/bibi'
import { PRIORITY, type CoachData, type CoachLine } from '../persona/types'

const BANNED_BY_PERSONA: Readonly<Record<string, readonly RegExp[]>> = {
  bibi: BIBI_BANNED_PATTERNS,
}

/** Extra patterns a persona's lines must never match, on top of the global guardrails. */
export function personaBannedPatterns(personaId: string): readonly RegExp[] {
  return BANNED_BY_PERSONA[personaId] ?? []
}

/** Matches raw and normalized text, so "B@ttle" and accents do not slip through. */
export function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  if (patterns.length === 0) return false
  const norm = normalizeForMatching(text)
  return patterns.some((p) => p.test(text) || p.test(norm))
}

/** Is this text allowed for a persona. Profanity on means no language restrictions. */
export function textAllowed(text: string, patterns: readonly RegExp[], profanity: boolean): boolean {
  if (profanity) return true
  if (violatesGuardrails(text) !== null) return false
  if (detectProfanity(text) !== null) return false
  return !matchesAny(text, patterns)
}

/**
 * The data with every string fact that touches a banned topic removed
 * (missing, not blanked: lines that need it become ineligible).
 */
export function sanitizeFacts(data: CoachData, patterns: readonly RegExp[]): CoachData {
  let out: CoachData | null = null
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== 'string') continue
    if (violatesGuardrails(v) === null && !matchesAny(v, patterns)) continue
    out ??= { ...data }
    delete out[k]
  }
  return out ?? data
}

/** Said when a safety line somehow fails the gate: safety is never dropped. */
export const SAFETY_FALLBACK_TEXT = 'Ease right off and take a breather. Stop if anything feels wrong.'

/**
 * The line as it may be shown and spoken, or null when it must be dropped.
 * With profanity on, the line passes through. Otherwise persona bans apply to
 * lines from that persona; while the supportive tone is forced, lines come
 * from Professional and only the global rules apply.
 */
export function gateLine(line: CoachLine, opts: { personaId: string; profanity: boolean }): CoachLine | null {
  if (opts.profanity) return line
  // AI-written lines skip topic bans. Swearing still waits for the profanity setting.
  if (line.lineId.startsWith('ai.')) {
    if (detectProfanity(line.text) !== null) {
      if (line.priority === PRIORITY.safety) return { ...line, text: SAFETY_FALLBACK_TEXT, speech: SAFETY_FALLBACK_TEXT }
      return null
    }
    return line
  }
  const patterns = line.personaId === opts.personaId ? personaBannedPatterns(opts.personaId) : []
  if (textAllowed(line.text, patterns, opts.profanity)) return line
  if (line.priority === PRIORITY.safety) return { ...line, text: SAFETY_FALLBACK_TEXT, speech: SAFETY_FALLBACK_TEXT }
  return null
}
