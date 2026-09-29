import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { AiError, type AiProviderId, type AiRequest } from '@core/ai/types'
import type { AiProvider, CallOpts } from './provider'
import { AiService, type AiConfig, type AiConfigStore } from './service'

function memoryStore(init: Partial<AiConfig> = {}): AiConfigStore & { keys: Record<string, string | null> } {
  let cfg: AiConfig = { provider: 'anthropic', models: {}, ...init }
  const keys: Record<string, string | null> = { anthropic: 'sk-ant-test', openai: null }
  return {
    keys,
    getConfig: () => cfg,
    setConfig: (c) => {
      cfg = c
    },
    getKey: (p) => keys[p] ?? null,
    setKey: (p, k) => {
      keys[p] = k
    },
  }
}

class FakeProvider implements AiProvider {
  readonly id: AiProviderId = 'anthropic'
  calls: { req: AiRequest; opts: CallOpts }[] = []
  structuredOutputs: unknown[] = []
  failWith: Error | null = null
  hang = false
  async listModels() {
    return ['claude-opus-5-5']
  }
  private async maybeHang(opts: CallOpts) {
    if (!this.hang) return
    await new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(new AiError('Cancelled', 'timeout'))))
  }
  async complete(req: AiRequest, opts: CallOpts) {
    this.calls.push({ req, opts })
    await this.maybeHang(opts)
    if (this.failWith) throw this.failWith
    return { text: 'Pedal, you coward.', model: opts.model }
  }
  async stream(req: AiRequest, opts: CallOpts, onDelta: (t: string) => void) {
    this.calls.push({ req, opts })
    for (const t of ['Nice ', 'ride.']) {
      if (opts.signal.aborted) throw new AiError('Cancelled', 'cancelled')
      onDelta(t)
      await new Promise((r) => setTimeout(r, 5))
    }
    return { text: 'Nice ride.', model: opts.model }
  }
  async structured(req: AiRequest, _schema: z.ZodType, _name: string, opts: CallOpts) {
    this.calls.push({ req, opts })
    const v = this.structuredOutputs.shift()
    return { value: v, raw: JSON.stringify(v), model: opts.model }
  }
}

const input = { system: 'sys', messages: [{ role: 'user' as const, content: 'hi' }] }
const validWorkout = {
  name: 'Sweet spot 3x12',
  description: 'Hold steady.',
  tags: ['sweet-spot'],
  segments: [
    { kind: 'ramp', role: 'warmup', durationS: 600, from: 0.5, to: 0.7 },
    { kind: 'intervals', repeat: 3, onS: 720, onPower: 0.9, offS: 300, offPower: 0.55 },
    { kind: 'ramp', role: 'cooldown', durationS: 300, from: 0.6, to: 0.4 },
  ],
  cues: [],
}

describe('AiService', () => {
  it('defaults to Claude Opus 5.5 with low effort for live lines', async () => {
    const fake = new FakeProvider()
    const svc = new AiService(memoryStore(), () => fake)
    const res = await svc.complete('live-line', input)
    expect(res.text).toBe('Pedal, you coward.')
    expect(fake.calls[0]!.opts.model).toBe('claude-opus-5-5')
    expect(fake.calls[0]!.req.effort).toBe('low')
  })

  it('reports not-configured without a key or provider', async () => {
    const store = memoryStore({ provider: 'openai' })
    const svc = new AiService(store, () => new FakeProvider())
    await expect(svc.complete('debrief', input)).rejects.toMatchObject({ code: 'not-configured' })
    store.setConfig({ provider: null, models: {} })
    await expect(svc.complete('debrief', input)).rejects.toMatchObject({ code: 'not-configured' })
  })

  it('validates structured output and repairs once', async () => {
    const fake = new FakeProvider()
    fake.structuredOutputs = [{ name: 'x', segments: [] }, validWorkout]
    const svc = new AiService(memoryStore(), () => fake)
    const res = await svc.structured('workout', 'workout', input)
    expect(res.value.segments).toHaveLength(3)
    expect(fake.calls).toHaveLength(2)
    expect(fake.calls[1]!.req.messages.at(-1)!.content).toMatch(/did not match the required schema/)
  })

  it('gives up with a typed error after the repair also fails', async () => {
    const fake = new FakeProvider()
    fake.structuredOutputs = [{ nope: 1 }, { still: 'bad' }]
    const svc = new AiService(memoryStore(), () => fake)
    await expect(svc.structured('workout', 'workout', input)).rejects.toMatchObject({ code: 'invalid-output' })
  })

  it('times out a hanging provider (never blocks the ride)', async () => {
    const fake = new FakeProvider()
    fake.hang = true
    const svc = new AiService(memoryStore(), () => fake)
    const ctrl = new AbortController()
    const t0 = Date.now()
    setTimeout(() => ctrl.abort(), 50)
    await expect(svc.complete('debrief', input, ctrl.signal)).rejects.toBeInstanceOf(AiError)
    expect(Date.now() - t0).toBeLessThan(1000)
  })

  it('streams deltas and cancels promptly', async () => {
    const fake = new FakeProvider()
    const svc = new AiService(memoryStore(), () => fake)
    const deltas: string[] = []
    const res = await svc.stream('debrief', input, (d) => deltas.push(d))
    expect(deltas.join('')).toBe('Nice ride.')
    expect(res.text).toBe('Nice ride.')
    const ctrl = new AbortController()
    const p = svc.stream('debrief', input, () => ctrl.abort(), ctrl.signal)
    const t0 = Date.now()
    await expect(p).rejects.toMatchObject({ code: 'cancelled' })
    expect(Date.now() - t0).toBeLessThan(100)
  })

  it('opens the circuit breaker after repeated failures', async () => {
    const fake = new FakeProvider()
    fake.failWith = new AiError('boom', 'provider')
    let now = 0
    const svc = new AiService(memoryStore(), () => fake, () => now)
    for (let i = 0; i < 3; i++) {
      now += 30_000
      await expect(svc.complete('debrief', input)).rejects.toMatchObject({ code: 'provider' })
    }
    await expect(svc.complete('debrief', input)).rejects.toMatchObject({ code: 'circuit-open' })
    now += 6 * 60_000
    fake.failWith = null
    await expect(svc.complete('debrief', input)).resolves.toMatchObject({ text: 'Pedal, you coward.' })
  })

  it('rate-limits live lines to one every 20 s', async () => {
    let now = 100_000
    const svc = new AiService(memoryStore(), () => new FakeProvider(), () => now)
    await svc.complete('live-line', input)
    await expect(svc.complete('live-line', input)).rejects.toMatchObject({ code: 'budget' })
    now += 21_000
    await expect(svc.complete('live-line', input)).resolves.toBeTruthy()
  })

  it('stores keys per provider and switches provider', () => {
    const store = memoryStore()
    const svc = new AiService(store, () => new FakeProvider())
    svc.configure({ provider: 'openai', apiKey: 'sk-proj-x', model: 'gpt-5' })
    expect(store.keys.openai).toBe('sk-proj-x')
    expect(svc.status()).toMatchObject({ provider: 'openai', configured: true, model: 'gpt-5' })
    svc.configure({ provider: 'ollama', model: 'llama3.3' })
    expect(svc.status()).toMatchObject({ provider: 'ollama', configured: true, model: 'llama3.3' })
  })
})
