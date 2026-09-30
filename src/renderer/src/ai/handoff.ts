// Hands something the rider was reading (the Fitness overview) to the coach
// chat: the page sets it and navigates, the chat picks it up once on mount.
import { createStore } from 'zustand'

export interface ChatHandoff {
  /** What it is, shown on the chat's context card: "Fitness overview". */
  title: string
  text: string
}

const handoffStore = createStore<{ pending: ChatHandoff | null }>(() => ({ pending: null }))

export function handToCoach(h: ChatHandoff): void {
  handoffStore.setState({ pending: h })
}

/** The waiting handoff, if any; taking it clears it. */
export function takeHandoff(): ChatHandoff | null {
  const h = handoffStore.getState().pending
  if (h) handoffStore.setState({ pending: null })
  return h
}

/**
 * The chat message that carries a handoff. The chat prompt tells the coach to
 * take it in and answer with one short line, ready for the rider's question.
 */
export function handoffMessage(h: ChatHandoff): string {
  return [
    `[Context handoff] The rider was just reading their ${h.title.toLowerCase()} in FreeGaz and has opened the chat to ask about it. Here it is, so you know exactly what they saw:`,
    '"""',
    h.text,
    '"""',
    'Reply with one short in-character line that you have it and ask what they want to know. Answer their questions from it and the training data.',
  ].join('\n')
}
