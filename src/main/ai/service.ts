// AiService: the only way anything in FreeGaz talks to an LLM.
//  * picks the configured provider/model; keys come from the SecretStore
//  * every call has a timeout (AbortSignal.any with the caller's signal)
//  * structured outputs are re-validated with zod, with one repair turn
//  * a circuit breaker stops hammering a failing provider mid-ride
//  * in-ride "live-line" calls are single-flight and rate-limited
import type { z } from 'zod'
import { AI_SCHEMAS, type AiSchemaId } from '@core/ai/schemas'
import { AiError, PURPOSE_DEFAULTS, type AiMessage, type AiProviderId, type AiPurpose, type AiRequest, type AiResult } from '@core/ai/types'
import type { AiProvider, ProviderConfig } from './provider'
import { DEFAULT_MODEL } from './provider'

export interface AiConfig {
  provider: AiProviderId | null
  /** Model per provider (defaults: Claude Opus 5.5; others chosen from the live list). */
  models: Partial<Record<AiProviderId, string>>
  ollamaHost?: string
}

export interface AiConfigStore {
  getConfig(): AiConfig
  setConfig(c: AiConfig): void
  getKey(p: AiProviderId): string | null
  setKey(p: AiProviderId, key: string | null): void
}

export type ProviderFactory = (id: AiProviderId, cfg: ProviderConfig) => AiProvider

const BREAKER_THRESHOLD = 3
const BREAKER_COOLDOWN_MS = 5 * 60_000
const LIVE_LINE_MIN_GAP_MS = 20_000

export class AiService {
  private failures = 0
  private openUntil = 0
  private liveInFlight = false
  private lastLiveAt = -Infinity

  constructor(
    private readonly store: AiConfigStore,
    private readonly factory: ProviderFactory,
    private readonly now: () => number = Date.now,
  ) {}

  status() {
    const c = this.store.getConfig()
    const provider = c.provider
    const keys = { anthropic: !!this.store.getKey('anthropic'), openai: !!this.store.getKey('openai') }
    const configured = provider === 'ollama' ? true : provider ? keys[provider] : false
    return {
      provider,
      configured,
      model: provider ? this.modelFor(provider) : null,
      keys,
      ollamaHost: c.ollamaHost,
      breakerOpen: this.now() < this.openUntil,
    }
  }

  configure(patch: { provider?: AiProviderId | null; model?: string; apiKey?: string | null; ollamaHost?: string }): void {
    const c = this.store.getConfig()
    const next: AiConfig = { ...c, models: { ...c.models } }
    if (patch.provider !== undefined) next.provider = patch.provider
    const target = patch.provider ?? c.provider
    if (patch.model !== undefined && target) next.models[target] = patch.model
    if (patch.ollamaHost !== undefined) next.ollamaHost = patch.ollamaHost
    this.store.setConfig(next)
    if (patch.apiKey !== undefined && target && target !== 'ollama') this.store.setKey(target, patch.apiKey)
    this.failures = 0
    this.openUntil = 0
  }

  async listModels(id: AiProviderId, signal?: AbortSignal): Promise<string[]> {
    const p = this.provider(id)
    return p.listModels(withTimeout(signal, 15_000))
  }

  async complete(purpose: AiPurpose, input: { system: string; messages: AiMessage[] }, signal?: AbortSignal): Promise<AiResult> {
    const release = this.enterLive(purpose)
    try {
      return await this.guard(() => {
        const { provider, model, req, opts } = this.prepare(purpose, input, signal)
        return provider.complete(req, { model, ...opts })
      })
    } finally {
      release()
    }
  }

  async stream(purpose: AiPurpose, input: { system: string; messages: AiMessage[] }, onDelta: (t: string) => void, signal?: AbortSignal): Promise<AiResult> {
    return this.guard(() => {
      const { provider, model, req, opts } = this.prepare(purpose, input, signal)
      return provider.stream(req, { model, ...opts }, onDelta)
    })
  }

  /**
   * Structured output: provider-native JSON, then zod validation. On failure
   * the model gets one chance to repair its output; after that a typed error.
   */
  async structured<Id extends AiSchemaId>(
    purpose: AiPurpose,
    schemaId: Id,
    input: { system: string; messages: AiMessage[] },
    signal?: AbortSignal,
  ): Promise<{ value: z.infer<(typeof AI_SCHEMAS)[Id]>; model: string }> {
    const schema = AI_SCHEMAS[schemaId] as z.ZodType
    return this.guard(async () => {
      const { provider, model, req, opts } = this.prepare(purpose, input, signal)
      const first = await provider.structured(req, schema, schemaId.replace(/-/g, '_'), { model, ...opts })
      const ok = schema.safeParse(first.value)
      if (ok.success) return { value: ok.data as z.infer<(typeof AI_SCHEMAS)[Id]>, model: first.model }

      const repair: AiRequest = {
        ...req,
        messages: [
          ...req.messages,
          { role: 'assistant', content: first.raw || JSON.stringify(first.value) },
          { role: 'user', content: `That JSON did not match the required schema: ${ok.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}. Reply with corrected JSON only.` },
        ],
      }
      const second = await provider.structured(repair, schema, schemaId.replace(/-/g, '_'), { model, ...this.prepare(purpose, input, signal).opts })
      const ok2 = schema.safeParse(second.value)
      if (ok2.success) return { value: ok2.data as z.infer<(typeof AI_SCHEMAS)[Id]>, model: second.model }
      throw new AiError('The AI returned output that did not match the expected format', 'invalid-output')
    })
  }

  // ---- internals ----------------------------------------------------------

  private modelFor(id: AiProviderId): string {
    return this.store.getConfig().models[id] || DEFAULT_MODEL[id]
  }

  private provider(id: AiProviderId): AiProvider {
    const c = this.store.getConfig()
    const key = id === 'ollama' ? undefined : (this.store.getKey(id) ?? undefined)
    if (id !== 'ollama' && !key) throw new AiError(`No ${id === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key configured`, 'not-configured')
    return this.factory(id, { apiKey: key, baseUrl: id === 'ollama' ? c.ollamaHost : undefined })
  }

  private prepare(purpose: AiPurpose, input: { system: string; messages: AiMessage[] }, signal?: AbortSignal) {
    const c = this.store.getConfig()
    if (!c.provider) throw new AiError('AI is turned off. Pick a provider in Settings → AI.', 'not-configured')
    const model = this.modelFor(c.provider)
    if (!model) throw new AiError(`Choose a ${c.provider} model in Settings → AI`, 'not-configured')
    const d = PURPOSE_DEFAULTS[purpose]
    const req: AiRequest = { system: input.system, messages: input.messages, maxTokens: d.maxTokens, effort: d.effort }
    return { provider: this.provider(c.provider), model, req, opts: { signal: withTimeout(signal, d.timeoutMs), timeoutMs: d.timeoutMs } }
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    if (this.now() < this.openUntil) throw new AiError('AI is paused after repeated errors; using offline lines for a few minutes', 'circuit-open')
    try {
      const out = await fn()
      this.failures = 0
      return out
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError(e instanceof Error ? e.message : String(e), 'provider')
      if (err.code !== 'cancelled' && err.code !== 'not-configured' && err.code !== 'refusal') {
        this.failures++
        if (this.failures >= BREAKER_THRESHOLD) this.openUntil = this.now() + BREAKER_COOLDOWN_MS
      }
      throw err
    }
  }

  /** In-ride lines: one at a time, at most one every 20 s. */
  private enterLive(purpose: AiPurpose): () => void {
    if (purpose !== 'live-line') return () => undefined
    if (this.liveInFlight) throw new AiError('A live line is already being generated', 'budget')
    if (this.now() - this.lastLiveAt < LIVE_LINE_MIN_GAP_MS) throw new AiError('Too soon for another live line', 'budget')
    this.liveInFlight = true
    this.lastLiveAt = this.now()
    return () => {
      this.liveInFlight = false
    }
  }
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, t]) : t
}
