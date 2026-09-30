// The coach's voice for the AI text features (chat, debrief, fitness overview):
// the persona, spice and language settings, plus a handful of the persona's
// own canned lines as style examples, so the model sounds like the coach the
// rider picked rather than a generic assistant. Sent in the user message, so
// the system prompts stay byte-stable for caching.
import { personaInstruction } from '../ai/prompts'
import { clampSpice } from '../persona/engine'
import { detectProfanity, languageAllowed } from '../persona/guardrails'
import { PROFESSIONAL } from '../persona/packs/professional'
import { placeholdersOf } from '../persona/template'
import { toProfanity, type CoachLineTemplate, type PersonaPack, type ProfanitySetting } from '../persona/types'
import { personaBannedPatterns, textAllowed } from './content'

export const VOICE_EXAMPLES = 6

/** Topics a persona's canned lines stay off, said to the model too. */
const OFF_LIMITS: Readonly<Record<string, string>> = {
  bibi: 'religion, ethnicity, land claims, war, hostages and trial allegations',
  trump: 'religion, race, immigration and borders, war and violence, elections and parties, courts and cases, women, age, health, looks, and other real people',
}

/** Always sent, whatever the spice or language: the coach roasts the effort, never the person. */
const HOUSE_RULES =
  "House rules, whatever the persona: roast effort, choices, excuses and numbers, never the rider's body, weight, looks or health. If the rider sounds unwell, hurt or distressed, drop the act and answer plainly and kindly."

/**
 * Up to `max` of the persona's lines that fit the settings: no placeholders
 * (they read oddly out of context), one per trigger for variety, the spiciest
 * allowed first. On Unhinged the sweariest lead, so the model sees the
 * register it's meant to use.
 */
export function voiceExamples(pack: PersonaPack, opts: { spice: number; profanity: ProfanitySetting }, max = VOICE_EXAMPLES): string[] {
  const level = toProfanity(opts.profanity)
  const spice = pack === PROFESSIONAL ? 5 : clampSpice(opts.spice)
  const banned = level === 'unhinged' ? [] : personaBannedPatterns(pack.meta.id)
  const fits = (l: CoachLineTemplate) =>
    l.spice <= spice && placeholdersOf(l.text).length === 0 && !l.triggers.includes('distress') && languageAllowed(l.text, level) && textAllowed(l.text, banned, level)
  const swearing = { strong: 20, mild: 10 } as const
  const rank = (l: CoachLineTemplate) => {
    const found = level === 'unhinged' ? detectProfanity(l.text) : null
    return (found ? swearing[found] : 0) + l.spice
  }
  const pool = pack.lines.filter(fits).sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id))
  const out: string[] = []
  const triggers = new Set<string>()
  for (const l of pool) {
    if (out.length >= max) break
    const t = l.triggers[0]!
    if (triggers.has(t)) continue
    triggers.add(t)
    out.push(l.text)
  }
  return out
}

/** The block put in front of a message so the AI answers as the rider's coach. */
export function coachVoice(pack: PersonaPack, opts: { spice: number; profanity: ProfanitySetting }): string {
  const meta = pack.meta
  const level = toProfanity(opts.profanity)
  const professional = pack === PROFESSIONAL
  const lines = [
    '[Coach settings]',
    personaInstruction({ name: meta.name, tagline: meta.tagline, spice: professional ? 1 : clampSpice(opts.spice), profanity: professional ? 'clean' : level }),
  ]
  if (professional) lines.push('Plain, professional coaching: no jokes, no roasting.')
  const off = OFF_LIMITS[meta.id]
  if (off) lines.push(`Copy the speaking style only, and keep to cycling and training. Never touch ${off}.`)
  const examples = voiceExamples(pack, opts)
  if (examples.length > 0) lines.push(`How ${meta.name} talks (style examples, not facts): ${examples.map((e) => `"${e}"`).join(' ')}`)
  lines.push(HOUSE_RULES, '[/Coach settings]')
  return lines.join('\n')
}
