// Offline coaching personas: the engine, the nine canned packs, the guardrails
// (also meant for AI output) and validation for user-authored packs.
export {
  CoachEngine,
  DEFAULT_MEMORY_SIZE,
  DEFAULT_TRIGGER_COOLDOWNS_MS,
  DISTRESS_FALLBACK,
  ENGINE_TIMING,
  clampSpice,
  criterionHolds,
  priorityOf,
  spiceAffinity,
  weightedPick,
  type CoachEngineOptions,
} from './engine'
export { COVERAGE_KEYS, coverageGaps, minimumLines, packCoverage, type CoverageGap, type CoverageKey } from './coverage'
export {
  GUARDRAILS,
  detectProfanity,
  guardrailMatch,
  languageAllowed,
  normalizeForMatching,
  violatesGuardrails,
  type GuardrailCategory,
  type GuardrailMatch,
  type GuardrailRule,
  type ProfanityLevel,
} from './guardrails'
export {
  BIBI,
  BIBI_BANNED_PATTERNS,
  DATA_NERD,
  DISAPPOINTED_DAD,
  DRILL_SERGEANT,
  HYPE_COACH,
  PACKS,
  PROFESSIONAL,
  ROAST_COMIC,
  THE_OVERLORD,
  TRUMP,
  TRUMP_BANNED_PATTERNS,
  ZEN,
  packById,
} from './packs'
export { mulberry32 } from './rng'
export { SAMPLE_DATA, SEGMENT_SAMPLES, sampleContext, sampleVariants } from './samples'
export { buildFacts, formatDuration, formatFact, placeholdersOf, renderTemplate, toSpeech, type Facts } from './template'
export * from './types'
export { MAX_LINE_CHARS, MAX_PACK_LINES, validatePack, type PackValidation } from './validate'
