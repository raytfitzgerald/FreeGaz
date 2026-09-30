// What the coach is saying right now, for the caricature: the line on screen
// (and whose it is), whether the voice is going, and a tick per spoken word so
// the jaw can keep time. Written by the coach runtime, read by the ride screen.
import { createStore, useStore } from 'zustand'

export interface TalkLine {
  /** New for every line shown, even a repeat of the same text. */
  id: number
  text: string
  /** The pack that produced it; null for the app's own notices (mute, unmute). */
  personaId: string | null
  priority: number
  /** Date.now() when it was shown. */
  at: number
}

interface CoachTalkState {
  line: TalkLine | null
  speaking: boolean
  /** Bumped at each word boundary the voice reports (not every voice does). */
  words: number
  /** The rider muted the coach for this ride (C, the phone, or the mute button). */
  muted: boolean
}

export const coachTalkStore = createStore<CoachTalkState>(() => ({ line: null, speaking: false, words: 0, muted: false }))

let nextId = 1

export function markLine(text: string, personaId: string | null, priority: number): void {
  coachTalkStore.setState({ line: { id: nextId++, text, personaId, priority, at: Date.now() } })
}

export function markSpeaking(speaking: boolean): void {
  if (coachTalkStore.getState().speaking !== speaking) coachTalkStore.setState({ speaking })
}

export function markMuted(muted: boolean): void {
  if (coachTalkStore.getState().muted !== muted) coachTalkStore.setState({ muted })
}

export function markWord(): void {
  coachTalkStore.setState((s) => ({ words: s.words + 1 }))
}

export function useCoachTalk<T>(selector: (s: CoachTalkState) => T): T {
  return useStore(coachTalkStore, selector)
}
