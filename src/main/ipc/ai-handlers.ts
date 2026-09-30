import type { WebContents } from 'electron'
import { CHAT_SYSTEM, DEBRIEF_SYSTEM, FITNESS_SUMMARY_SYSTEM, LIVE_LINE_SYSTEM, QUIP_PACK_SYSTEM, RIDE_TITLE_SYSTEM, WORKOUT_SYSTEM } from '@core/ai/prompts'
import { AiError, type AiProviderId, type AiPurpose } from '@core/ai/types'
import type { SecretStore } from '../secrets/secret-store'
import { AnthropicProvider } from '../ai/providers/anthropic'
import { OllamaProvider } from '../ai/providers/ollama'
import { GROK, OpenAiProvider } from '../ai/providers/openai'
import { AiService, type AiConfig, type AiConfigStore } from '../ai/service'
import { emit, handle } from './register'

const SYSTEM: Record<AiPurpose, string> = {
  'quip-pack': QUIP_PACK_SYSTEM,
  'live-line': LIVE_LINE_SYSTEM,
  debrief: DEBRIEF_SYSTEM,
  workout: WORKOUT_SYSTEM,
  chat: CHAT_SYSTEM,
  'ride-title': RIDE_TITLE_SYSTEM,
  'fitness-summary': FITNESS_SUMMARY_SYSTEM,
}

function configStore(secrets: SecretStore): AiConfigStore {
  return {
    getConfig: () => secrets.getJson<AiConfig>('ai.config') ?? { provider: null, models: {} },
    setConfig: (c) => secrets.setJson('ai.config', c),
    getKey: (p) => secrets.get(`ai.key.${p}`),
    setKey: (p, k) => (k ? secrets.set(`ai.key.${p}`, k) : secrets.delete(`ai.key.${p}`)),
  }
}

const describe = (e: unknown) => (e instanceof AiError ? { error: e.message, code: e.code } : { error: e instanceof Error ? e.message : String(e), code: 'provider' })

export function registerAiHandlers(deps: { secrets: SecretStore }): AiService {
  const service = new AiService(configStore(deps.secrets), (id: AiProviderId, cfg) =>
    id === 'anthropic' ? new AnthropicProvider(cfg) : id === 'openai' ? new OpenAiProvider(cfg) : id === 'grok' ? new OpenAiProvider(cfg, GROK) : new OllamaProvider(cfg),
  )
  const streams = new Map<string, AbortController>()

  handle('ai.status', () => service.status())
  handle('ai.configure', (patch) => {
    service.configure(patch)
    return service.status()
  })
  handle('ai.models', async ({ provider }) => {
    try {
      return { models: await service.listModels(provider) }
    } catch (e) {
      return { models: [], error: describe(e).error }
    }
  })
  handle('ai.complete', async ({ purpose, input }) => {
    try {
      const r = await service.complete(purpose, { system: SYSTEM[purpose], messages: [{ role: 'user', content: input }] })
      return { ok: true, text: r.text.trim(), model: r.model }
    } catch (e) {
      return { ok: false, ...describe(e) }
    }
  })
  handle('ai.structured', async ({ purpose, input }) => {
    try {
      const r = await service.structured(purpose, purpose, { system: SYSTEM[purpose], messages: [{ role: 'user', content: input }] })
      return { ok: true, value: r.value, model: r.model }
    } catch (e) {
      return { ok: false, ...describe(e) }
    }
  })
  handle('ai.stream.start', ({ streamId, purpose, messages }, event) => {
    const sender: WebContents = event.sender
    streams.get(streamId)?.abort()
    const ctrl = new AbortController()
    streams.set(streamId, ctrl)
    void service
      .stream(purpose, { system: SYSTEM[purpose], messages }, (text) => emit(sender, 'ai.stream.delta', { streamId, text }), ctrl.signal)
      .then((r) => emit(sender, 'ai.stream.end', { streamId, text: r.text, error: null, code: null, model: r.model }))
      .catch((e: unknown) => {
        const d = describe(e)
        emit(sender, 'ai.stream.end', { streamId, text: null, error: d.error, code: d.code, model: null })
      })
      .finally(() => streams.delete(streamId))
    return { ok: true }
  })
  handle('ai.stream.cancel', ({ streamId }) => {
    streams.get(streamId)?.abort()
    streams.delete(streamId)
    return { ok: true }
  })
  return service
}
