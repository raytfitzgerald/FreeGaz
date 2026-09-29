// Claude via the official Anthropic TypeScript SDK (main process only).
//  * Claude Opus 5.5 thinks adaptively and can't disable thinking; depth is set
//    with output_config.effort (low for in-ride lines, medium for analysis).
//  * Server-side refusal fallback ("default" routing) is enabled by default.
//  * The stable system prompt carries cache_control so repeated calls
//    (quip packs, chat turns) read it from the prompt cache.
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { z } from 'zod'
import { AiError, type AiRequest, type AiResult } from '@core/ai/types'
import type { AiProvider, CallOpts, ProviderConfig } from '../provider'

const BETAS = ['server-side-fallback-2026-07-01']

export class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic' as const
  private readonly client: Anthropic

  constructor(cfg: ProviderConfig) {
    if (!cfg.apiKey) throw new AiError('Add your Anthropic API key in Settings → AI', 'not-configured')
    this.client = new Anthropic({ apiKey: cfg.apiKey, maxRetries: 1 })
  }

  async listModels(signal: AbortSignal): Promise<string[]> {
    const out: string[] = []
    for await (const m of this.client.models.list({}, { signal })) out.push(m.id)
    return out
  }

  private params(req: AiRequest, model: string) {
    return {
      model,
      max_tokens: req.maxTokens ?? 16000,
      system: [{ type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } }],
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      output_config: { effort: req.effort ?? 'medium' },
      betas: BETAS,
      fallbacks: 'default' as const,
    }
  }

  async complete(req: AiRequest, opts: CallOpts): Promise<AiResult> {
    try {
      const res = await this.client.beta.messages.create(
        { ...this.params(req, opts.model), stream: false },
        { signal: opts.signal, timeout: opts.timeoutMs },
      )
      if (res.stop_reason === 'refusal') throw new AiError('The model declined this request', 'refusal')
      return { text: textOf(res.content), model: res.model, usage: usageOf(res.usage) }
    } catch (e) {
      throw mapError(e)
    }
  }

  async stream(req: AiRequest, opts: CallOpts, onDelta: (text: string) => void): Promise<AiResult> {
    try {
      const stream = this.client.beta.messages.stream(this.params(req, opts.model), { signal: opts.signal, timeout: opts.timeoutMs })
      stream.on('text', (delta) => onDelta(delta))
      const final = await stream.finalMessage()
      if (final.stop_reason === 'refusal') throw new AiError('The model declined this request', 'refusal')
      return { text: textOf(final.content), model: final.model, usage: usageOf(final.usage) }
    } catch (e) {
      throw mapError(e)
    }
  }

  async structured(req: AiRequest, schema: z.ZodType, _name: string, opts: CallOpts) {
    try {
      const p = this.params(req, opts.model)
      const res = await this.client.beta.messages.parse(
        { ...p, output_config: { ...p.output_config, format: betaZodOutputFormat(schema) } },
        { signal: opts.signal, timeout: opts.timeoutMs },
      )
      if (res.stop_reason === 'refusal') throw new AiError('The model declined this request', 'refusal')
      if (res.stop_reason === 'max_tokens') throw new AiError('The response was cut off (max tokens)', 'invalid-output')
      return { value: res.parsed_output, raw: textOf(res.content), model: res.model }
    } catch (e) {
      throw mapError(e)
    }
  }
}

function textOf(content: readonly { type: string }[]): string {
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

function usageOf(u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null } | undefined) {
  return u ? { inputTokens: u.input_tokens ?? undefined, outputTokens: u.output_tokens ?? undefined, cacheReadTokens: u.cache_read_input_tokens ?? undefined } : undefined
}

function mapError(e: unknown): Error {
  if (e instanceof AiError) return e
  if (e instanceof Anthropic.APIUserAbortError) return new AiError('Cancelled', 'cancelled')
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new AiError('The AI provider timed out', 'timeout')
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AiError('Anthropic rejected the API key', 'auth')
  if (e instanceof Anthropic.RateLimitError) return new AiError('Anthropic rate limit reached; try again shortly', 'rate-limited')
  if (e instanceof Anthropic.APIConnectionError) return new AiError('Could not reach Anthropic', 'network')
  if (e instanceof Anthropic.APIError) return new AiError(`Anthropic error ${e.status ?? ''}: ${e.message}`, 'provider')
  return new AiError(e instanceof Error ? e.message : String(e), 'provider')
}
