// Output schemas for structured AI calls. Providers enforce them natively
// (JSON schema / structured outputs) and we ALWAYS re-validate with zod,
// because providers may drop constraints such as min/max.
import { z } from 'zod'

const power = z.number().min(0.2).max(3).describe('Fraction of FTP, e.g. 0.88 for 88 %')
const duration = z.number().int().min(5).max(4 * 3600).describe('Seconds')
const cadence = z.number().int().min(50).max(130).optional().describe('Target rpm, optional')

export const GeneratedSegmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('steady'), durationS: duration, power, cadence, label: z.string().max(60).optional() }),
  z.object({
    kind: z.literal('ramp'),
    role: z.enum(['warmup', 'cooldown', 'ramp']),
    durationS: duration,
    from: power,
    to: power,
    label: z.string().max(60).optional(),
  }),
  z.object({
    kind: z.literal('intervals'),
    repeat: z.number().int().min(1).max(50),
    onS: duration,
    onPower: power,
    offS: duration,
    offPower: power,
    onCadence: cadence,
    label: z.string().max(60).optional(),
  }),
  z.object({ kind: z.literal('freeride'), durationS: duration, label: z.string().max(60).optional() }),
  z.object({ kind: z.literal('maxeffort'), durationS: z.number().int().min(5).max(600), label: z.string().max(60).optional() }),
])

export const GeneratedWorkoutSchema = z.object({
  name: z.string().min(3).max(80),
  description: z.string().max(600),
  tags: z.array(z.string().max(30)).max(8),
  segments: z.array(GeneratedSegmentSchema).min(1).max(120),
  cues: z
    .array(z.object({ atS: z.number().int().min(0), message: z.string().max(140) }))
    .max(40)
    .describe('Optional on-screen coaching cues at absolute seconds'),
})
export type GeneratedWorkout = z.infer<typeof GeneratedWorkoutSchema>

export const QuipPackSchema = z.object({
  lines: z
    .array(
      z.object({
        trigger: z.string().max(40),
        text: z.string().min(3).max(220),
      }),
    )
    .min(5)
    .max(80),
})
export type QuipPack = z.infer<typeof QuipPackSchema>

export const RideTitleSchema = z.object({
  title: z.string().min(3).max(60),
  description: z.string().max(600),
})
export type RideTitle = z.infer<typeof RideTitleSchema>

export const AI_SCHEMAS = {
  workout: GeneratedWorkoutSchema,
  'quip-pack': QuipPackSchema,
  'ride-title': RideTitleSchema,
} as const
export type AiSchemaId = keyof typeof AI_SCHEMAS
