import type { z } from 'zod'
import type { AiProviderId, AiRequest, AiResult } from '@core/ai/types'

export interface CallOpts {
  model: string
  signal: AbortSignal
  timeoutMs: number
}

export interface AiProvider {
  readonly id: AiProviderId
  listModels(signal: AbortSignal): Promise<string[]>
  complete(req: AiRequest, opts: CallOpts): Promise<AiResult>
  stream(req: AiRequest, opts: CallOpts, onDelta: (text: string) => void): Promise<AiResult>
  /** Provider-native structured output. The service re-validates with zod regardless. */
  structured(req: AiRequest, schema: z.ZodType, schemaName: string, opts: CallOpts): Promise<{ value: unknown; raw: string; model: string }>
}

export interface ProviderConfig {
  apiKey?: string
  baseUrl?: string
}

/** Sensible default model per provider. Anthropic per current guidance; others resolved live. */
export const DEFAULT_MODEL: Record<AiProviderId, string> = {
  anthropic: 'claude-opus-5-5',
  openai: '',
  ollama: '',
}
