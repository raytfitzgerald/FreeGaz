// validatePack: the trust boundary for user-authored persona packs (JSON from
// the custom persona builder or an imported file). The envelope is checked with
// zod; each line is then checked on its own, so one bad line costs that line,
// not the pack. Every line and the pack's name and tagline go through the same
// guardrails as the canned packs.
import { z } from 'zod'
import { detectProfanity, guardrailMatch } from './guardrails'
import { packById } from './packs'
import { bracesBalanced, placeholdersOf } from './template'
import { COACH_TRIGGERS, CRITERION_OPS, isDataKey, type CoachLineTemplate, type PersonaPack, type Spice } from './types'

export const MAX_LINE_CHARS = 200
export const MAX_PACK_LINES = 5000

const VoiceHintSchema = z.object({
  rate: z.number().min(0.1).max(10),
  pitch: z.number().min(0).max(2),
  preferVoices: z.array(z.string().trim().min(1).max(60)).max(10),
})

const MetaSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/, 'use 2–40 lowercase letters, digits and dashes'),
  name: z.string().trim().min(1).max(40),
  tagline: z.string().trim().max(140).default(''),
  parody: z.boolean().optional(),
  disclaimer: z.string().trim().min(1).max(300).optional(),
  voiceHint: VoiceHintSchema.optional(),
})

const CriterionSchema = z.object({
  key: z.string().min(1).max(40),
  op: z.enum(CRITERION_OPS),
  value: z.union([z.number(), z.string().max(80), z.boolean()]),
})

const LineSchema = z.object({
  id: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(MAX_LINE_CHARS),
  triggers: z.array(z.enum(COACH_TRIGGERS)).min(1).max(COACH_TRIGGERS.length),
  spice: z.number().int().min(1).max(5),
  profanity: z.boolean().optional(),
  criteria: z.array(CriterionSchema).max(8).optional(),
  weight: z.number().positive().max(100).optional(),
})

const EnvelopeSchema = z.object({
  meta: MetaSchema,
  lines: z.array(z.unknown()).min(1).max(MAX_PACK_LINES),
})

type ParsedLine = z.infer<typeof LineSchema>

export interface PackValidation {
  /** The pack with only its valid lines, or null if the meta is invalid or no line survived. */
  pack: PersonaPack | null
  /** One message per problem, e.g. 'lines[3] ("my-line"): text: unknown placeholder {pwoer}'. */
  errors: string[]
}

function zodMessages(prefix: string, error: z.ZodError): string[] {
  return error.issues.map((i) => `${prefix}${i.path.length > 0 ? `${i.path.join('.')}: ` : ''}${i.message}`)
}

function lineProblems(line: ParsedLine): string[] {
  const problems: string[] = []
  if (!bracesBalanced(line.text)) problems.push('text: stray { or } (placeholders look like {power})')
  for (const key of placeholdersOf(line.text)) {
    if (!isDataKey(key)) problems.push(`text: unknown placeholder {${key}}`)
  }
  for (const c of line.criteria ?? []) {
    if (!isDataKey(c.key)) problems.push(`criteria: unknown key "${c.key}"`)
    if (c.op !== '==' && c.op !== '!=' && typeof c.value !== 'number') problems.push(`criteria: "${c.op}" needs a number`)
  }
  const hit = guardrailMatch(line.text)
  if (hit) problems.push(`text: touches a banned topic (${hit.category}: "${hit.match}")`)
  if (detectProfanity(line.text) !== null && line.profanity !== true) problems.push('text: contains profanity; set "profanity": true')
  return problems
}

/** Validate a user-authored persona pack. Bad lines are dropped and reported; the rest are kept. */
export function validatePack(json: unknown): PackValidation {
  const envelope = EnvelopeSchema.safeParse(json)
  if (!envelope.success) return { pack: null, errors: zodMessages('', envelope.error) }

  const errors: string[] = []
  const meta = envelope.data.meta
  if (packById(meta.id)) errors.push(`meta.id: "${meta.id}" belongs to a built-in persona; choose another id`)
  if (meta.parody === true && meta.disclaimer === undefined) errors.push('meta.disclaimer: required when parody is true')
  for (const field of ['name', 'tagline'] as const) {
    const hit = guardrailMatch(meta[field])
    if (hit) errors.push(`meta.${field}: touches a banned topic (${hit.category}: "${hit.match}")`)
  }
  const metaOk = errors.length === 0

  const lines: CoachLineTemplate[] = []
  const seen = new Set<string>()
  envelope.data.lines.forEach((raw, i) => {
    const parsed = LineSchema.safeParse(raw)
    if (!parsed.success) {
      errors.push(...zodMessages(`lines[${i}].`, parsed.error))
      return
    }
    const line = parsed.data
    const problems = lineProblems(line)
    if (seen.has(line.id)) problems.push('duplicate id')
    if (problems.length > 0) {
      errors.push(...problems.map((p) => `lines[${i}] ("${line.id}"): ${p}`))
      return
    }
    seen.add(line.id)
    lines.push({
      id: line.id,
      text: line.text,
      triggers: [...new Set(line.triggers)],
      spice: line.spice as Spice,
      ...(line.profanity !== undefined ? { profanity: line.profanity } : {}),
      ...(line.criteria !== undefined && line.criteria.length > 0 ? { criteria: line.criteria } : {}),
      ...(line.weight !== undefined ? { weight: line.weight } : {}),
    })
  })
  if (lines.length === 0) errors.push('lines: no valid lines')

  return { pack: metaOk && lines.length > 0 ? { meta, lines } : null, errors }
}
