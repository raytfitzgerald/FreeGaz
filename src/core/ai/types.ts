// Provider-neutral AI request types. Providers live in the main process
// (src/main/ai/providers); API keys never reach the renderer.

export type AiProviderId = 'anthropic' | 'openai' | 'grok' | 'ollama'

/** What the call is for; drives model choice, effort, timeout and budget. */
export type AiPurpose = 'quip-pack' | 'live-line' | 'debrief' | 'workout' | 'chat' | 'ride-title' | 'fitness-summary'

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiRequest {
  /** Stable instructions (cached by providers that support prompt caching). */
  system: string
  messages: AiMessage[]
  maxTokens?: number
  effort?: 'low' | 'medium' | 'high'
}

export interface AiUsage {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
}

export interface AiResult {
  text: string
  usage?: AiUsage
  model: string
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly code: 'not-configured' | 'timeout' | 'cancelled' | 'refusal' | 'invalid-output' | 'rate-limited' | 'auth' | 'network' | 'circuit-open' | 'budget' | 'provider',
  ) {
    super(message)
    this.name = 'AiError'
  }
}

/** Defaults per purpose: tight limits for in-ride calls, generous ones for analysis. */
export const PURPOSE_DEFAULTS: Record<AiPurpose, { timeoutMs: number; maxTokens: number; effort: 'low' | 'medium' | 'high' }> = {
  'quip-pack': { timeoutMs: 45_000, maxTokens: 8000, effort: 'low' },
  'live-line': { timeoutMs: 8_000, maxTokens: 1500, effort: 'low' },
  debrief: { timeoutMs: 180_000, maxTokens: 16_000, effort: 'medium' },
  workout: { timeoutMs: 120_000, maxTokens: 16_000, effort: 'medium' },
  chat: { timeoutMs: 180_000, maxTokens: 16_000, effort: 'medium' },
  'ride-title': { timeoutMs: 20_000, maxTokens: 1500, effort: 'low' },
  'fitness-summary': { timeoutMs: 90_000, maxTokens: 4000, effort: 'low' },
}
