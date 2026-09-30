// OpenAI via the official SDK's Responses API. xAI's Grok speaks the same
// API at its own base URL, so it is the same provider with a different flavour.
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import type { z } from 'zod'
import { AiError, type AiRequest, type AiResult } from '@core/ai/types'
import type { AiProvider, CallOpts, ProviderConfig } from '../provider'

/** An OpenAI-compatible service: who it is, where it lives, and which of its models can chat. */
export interface OpenAiFlavor {
  id: 'openai' | 'grok'
  name: string
  baseURL?: string
  chatModel(id: string): boolean
}

export const OPENAI: OpenAiFlavor = {
  id: 'openai',
  name: 'OpenAI',
  chatModel: (id) => /^(gpt-|o\d|chatgpt)/.test(id) && !/(audio|realtime|tts|transcribe|image|search|embedding)/.test(id),
}

export const GROK: OpenAiFlavor = {
  id: 'grok',
  name: 'xAI',
  baseURL: 'https://api.x.ai/v1',
  chatModel: (id) => /^grok/.test(id) && !/(image|imagine|vision|video|embed|tts|voice)/.test(id),
}

export class OpenAiProvider implements AiProvider {
  readonly id: 'openai' | 'grok'
  private readonly client: OpenAI
  private readonly flavor: OpenAiFlavor

  constructor(cfg: ProviderConfig, flavor: OpenAiFlavor = OPENAI) {
    if (!cfg.apiKey) throw new AiError(`Add your ${flavor.name} API key in Settings → AI`, 'not-configured')
    this.id = flavor.id
    this.flavor = flavor
    this.client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl || flavor.baseURL, maxRetries: 1 })
  }

  async listModels(signal: AbortSignal): Promise<string[]> {
    const out: string[] = []
    for await (const m of this.client.models.list({ signal })) out.push(m.id)
    // Chat-capable text models only.
    return out.filter((id) => this.flavor.chatModel(id)).sort()
  }

  private body(req: AiRequest, model: string) {
    return {
      model,
      instructions: req.system,
      input: req.messages.map((m) => ({ role: m.role, content: m.content })),
      max_output_tokens: req.maxTokens ?? 16000,
    }
  }

  async complete(req: AiRequest, opts: CallOpts): Promise<AiResult> {
    try {
      const r = await this.client.responses.create({ ...this.body(req, opts.model), stream: false }, { signal: opts.signal, timeout: opts.timeoutMs })
      return { text: r.output_text, model: r.model, usage: { inputTokens: r.usage?.input_tokens, outputTokens: r.usage?.output_tokens } }
    } catch (e) {
      throw mapError(e, this.flavor.name)
    }
  }

  async stream(req: AiRequest, opts: CallOpts, onDelta: (text: string) => void): Promise<AiResult> {
    try {
      const s = await this.client.responses.create({ ...this.body(req, opts.model), stream: true }, { signal: opts.signal, timeout: opts.timeoutMs })
      let text = ''
      let model = opts.model
      for await (const ev of s) {
        if (ev.type === 'response.output_text.delta') {
          text += ev.delta
          onDelta(ev.delta)
        } else if (ev.type === 'response.completed') {
          model = ev.response.model
        } else if (ev.type === 'error') {
          throw new AiError(ev.message, 'provider')
        }
      }
      return { text, model }
    } catch (e) {
      throw mapError(e, this.flavor.name)
    }
  }

  async structured(req: AiRequest, schema: z.ZodType, schemaName: string, opts: CallOpts) {
    try {
      const r = await this.client.responses.parse(
        { ...this.body(req, opts.model), text: { format: zodTextFormat(schema, schemaName) } },
        { signal: opts.signal, timeout: opts.timeoutMs },
      )
      return { value: r.output_parsed, raw: r.output_text, model: r.model }
    } catch (e) {
      throw mapError(e, this.flavor.name)
    }
  }
}

function mapError(e: unknown, name: string): Error {
  if (e instanceof AiError) return e
  if (e instanceof OpenAI.APIUserAbortError) return new AiError('Cancelled', 'cancelled')
  if (e instanceof OpenAI.APIConnectionTimeoutError) return new AiError(`${name} timed out`, 'timeout')
  if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError) return new AiError(`${name} rejected the API key`, 'auth')
  if (e instanceof OpenAI.RateLimitError) return new AiError(`${name} rate limit reached; try again shortly`, 'rate-limited')
  if (e instanceof OpenAI.APIConnectionError) return new AiError(`Could not reach ${name}`, 'network')
  if (e instanceof OpenAI.APIError) return new AiError(`${name} error ${e.status ?? ''}: ${e.message}`, 'provider')
  return new AiError(e instanceof Error ? e.message : String(e), 'provider')
}
