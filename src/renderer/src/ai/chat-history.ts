// The coach chat as stored in Dexie, and how it is kept to a size the IPC
// contract (60 messages) and the providers accept.
import type { AiMessage } from '@core/ai/types'
import type { ChatHandoff } from './handoff'

/** A chat turn as stored. `shared` marks a context handoff, shown as a card rather than the raw prompt. */
export interface ChatMessage extends AiMessage {
  shared?: ChatHandoff
  /** What the rider typed, when the stored content also carries the training data. */
  asked?: string
}

export const MAX_KEPT = 40

/**
 * The chat trimmed to `max` messages. The first rider message stays (it
 * carries the training data), followed by the newest messages from a coach
 * reply on, so rider and coach still alternate after it.
 */
export function trimChat(messages: readonly ChatMessage[], max = MAX_KEPT): ChatMessage[] {
  if (messages.length <= max) return [...messages]
  const [first, ...rest] = messages
  let tail = rest.slice(-(max - 1))
  while (tail.length > 0 && tail[0]!.role === first!.role) tail = tail.slice(1)
  return [first!, ...tail]
}
