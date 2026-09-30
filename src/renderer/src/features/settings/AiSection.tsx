import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import type { InvokeRes } from '@shared/ipc/contract'
import { bridge } from '../../platform/bridge'
import { Button } from '../../ui/Button'
import { Field, Input, Section, Select } from '../../ui/form'

type Provider = 'anthropic' | 'openai' | 'grok' | 'ollama'
/** The providers that need an API key, with where to get one and what it looks like. */
const KEYED: Partial<Record<Provider, { placeholder: string; where: string }>> = {
  anthropic: { placeholder: 'sk-ant-…', where: 'Get one at console.anthropic.com.' },
  openai: { placeholder: 'sk-…', where: 'Get one at platform.openai.com.' },
  grok: { placeholder: 'xai-…', where: 'Get one at console.x.ai.' },
}

const PROVIDERS: { id: Provider | 'off'; name: string; blurb: string }[] = [
  { id: 'off', name: 'Off', blurb: 'No AI. Canned coaching lines still work.' },
  { id: 'anthropic', name: 'Claude (Anthropic)', blurb: 'Default model: Claude Opus 5.5. Best analysis and workout design.' },
  { id: 'openai', name: 'OpenAI', blurb: 'Any GPT model your key can use.' },
  { id: 'grok', name: 'Grok (xAI)', blurb: 'Any Grok model your key can use.' },
  { id: 'ollama', name: 'Ollama (local)', blurb: 'Free and private: runs on your Mac. Install from ollama.com.' },
]

export function AiSection() {
  const [status, setStatus] = useState<InvokeRes<'ai.status'> | null>(null)
  const [key, setKey] = useState('')
  const [modelList, setModelList] = useState<{ provider: Provider; models: string[]; error: string | null } | null>(null)
  const [host, setHost] = useState('')
  const [test, setTest] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void bridge()
      .invoke('ai.status', {})
      .then((s) => live && setStatus(s))
    return () => {
      live = false
    }
  }, [])

  const provider = status?.provider ?? null
  const configured = !!status?.configured
  const keySaved = provider !== null && provider !== 'ollama' && !!status?.keys[provider]

  // The model list is fetched live from the provider whenever it (or its key) changes.
  useEffect(() => {
    if (!provider || !configured) return
    let live = true
    void bridge()
      .invoke('ai.models', { provider })
      .then((r) => live && setModelList({ provider, models: r.models, error: r.error ?? null }))
    return () => {
      live = false
    }
  }, [provider, configured])
  const current = provider && configured && modelList?.provider === provider ? modelList : null
  const models = current?.models ?? []
  const modelsError = current?.error ?? null
  const loadingModels = !!provider && configured && !current

  const choose = async (id: Provider | 'off') => {
    setStatus(await bridge().invoke('ai.configure', { provider: id === 'off' ? null : id }))
    setTest(null)
  }

  const saveKey = async () => {
    setStatus(await bridge().invoke('ai.configure', { apiKey: key.trim() }))
    setKey('')
  }

  const runTest = async () => {
    setTest('…')
    const r = await bridge().invoke('ai.complete', { purpose: 'ride-title', input: 'Reply with a four-word motivational cycling phrase.' })
    setTest(r.ok ? `✓ ${r.model}: ${r.text}` : `✗ ${r.error}`)
  }

  return (
    <>
      <Section title="AI provider" description="Optional. Used for post-ride debriefs, plain-English workout creation, the coach chat and tailored roasts. Only rides recorded in FreeGaz are ever sent, never Strava data.">
        <Field label="Provider">
          <div className="grid grid-cols-2 gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void choose(p.id)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${(provider ?? 'off') === p.id ? 'border-accent bg-accent/10' : 'border-line bg-panel-2 hover:border-line-strong'}`}
              >
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="mt-0.5 text-xs text-ink-dim">{p.blurb}</div>
              </button>
            ))}
          </div>
        </Field>

        {provider && KEYED[provider] && (
          <Field label="API key" hint="Encrypted with your Keychain and only used from the main process.">
            <div className="flex items-center gap-2">
              <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={keySaved ? '•••••• (saved)' : KEYED[provider]!.placeholder} className="max-w-md" />
              <Button size="sm" disabled={key.trim().length < 8} onClick={() => void saveKey()}>
                Save
              </Button>
              {keySaved && <CheckCircle2 className="size-4 text-good" />}
            </div>
            <div className="mt-2 text-xs text-ink-faint">{KEYED[provider]!.where}</div>
          </Field>
        )}

        {provider === 'ollama' && (
          <Field label="Ollama host" hint="Where Ollama is listening. The default works if it runs on this Mac.">
            <div className="flex items-center gap-2">
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder={status?.ollamaHost ?? 'http://127.0.0.1:11434'} className="max-w-sm" />
              <Button size="sm" disabled={!host} onClick={() => void bridge().invoke('ai.configure', { ollamaHost: host }).then(setStatus)}>
                Save
              </Button>
            </div>
          </Field>
        )}

        {provider && status?.configured && (
          <Field label="Model">
            <div className="flex items-center gap-2">
              <Select value={status.model ?? ''} onChange={(e) => void bridge().invoke('ai.configure', { model: e.target.value }).then(setStatus)}>
                {status.model && !models.includes(status.model) && <option value={status.model}>{status.model}</option>}
                {!status.model && <option value="">Choose a model…</option>}
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
              {loadingModels && <Loader2 className="size-4 animate-spin text-ink-dim" />}
              <Button size="sm" variant="ghost" onClick={() => void runTest()} disabled={!status.model}>
                Test
              </Button>
            </div>
            {modelsError && <div className="mt-2 text-xs text-bad">{modelsError}</div>}
            {test && <div className="mt-2 text-xs text-ink-dim">{test}</div>}
            {status.breakerOpen && <div className="mt-2 text-xs text-warn">Paused after repeated errors; retrying in a few minutes.</div>}
          </Field>
        )}
      </Section>
    </>
  )
}
