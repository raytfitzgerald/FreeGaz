import { describe, expect, it } from 'vitest'
import { trimChat, type ChatMessage } from './chat-history'

const chat = (n: number): ChatMessage[] => Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `m${i}` }))

describe('trimChat', () => {
  it('leaves short chats alone', () => {
    expect(trimChat(chat(10))).toHaveLength(10)
  })

  it('keeps the first message and the newest, still alternating', () => {
    const t = trimChat(chat(81), 40)
    expect(t.length).toBeLessThanOrEqual(40)
    expect(t[0]!.content).toBe('m0')
    expect(t.at(-1)!.content).toBe('m80')
    for (let i = 1; i < t.length; i++) expect(t[i]!.role).not.toBe(t[i - 1]!.role)
  })
})
