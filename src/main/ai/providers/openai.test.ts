import { describe, expect, it } from 'vitest'
import { GROK, OPENAI, OpenAiProvider } from './openai'

describe('OpenAI-compatible flavours', () => {
  it('keeps each service to its own chat models', () => {
    const ids = ['gpt-5', 'gpt-image-1', 'o4-mini', 'grok-4.7', 'grok-imagine-image', 'grok-2-vision', 'text-embedding-3']
    expect(ids.filter(OPENAI.chatModel)).toEqual(['gpt-5', 'o4-mini'])
    expect(ids.filter(GROK.chatModel)).toEqual(['grok-4.7'])
  })

  it('points Grok at xAI and names it in errors', () => {
    expect(GROK.baseURL).toBe('https://api.x.ai/v1')
    expect(new OpenAiProvider({ apiKey: 'xai-test' }, GROK).id).toBe('grok')
    expect(() => new OpenAiProvider({}, GROK)).toThrow(/xAI/)
    expect(new OpenAiProvider({ apiKey: 'sk-test' }).id).toBe('openai')
  })
})
