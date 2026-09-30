// Text-to-speech via the Web Speech API (macOS system voices; nothing leaves
// the machine). This module speaks one line; the coach's SpeechQueue decides
// which line, and when.
import type { CoachPrefs } from '@shared/settings'

let voicesCache: SpeechSynthesisVoice[] = []
/** Chromium can garbage-collect a speaking utterance, and lose its end event, unless something holds it. */
let current: SpeechSynthesisUtterance | null = null

export function listVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  const v = speechSynthesis.getVoices()
  if (v.length) voicesCache = v
  return voicesCache.filter((x) => x.lang.startsWith('en'))
}

export function onVoicesChanged(cb: () => void): () => void {
  if (typeof speechSynthesis === 'undefined') return () => undefined
  speechSynthesis.addEventListener('voiceschanged', cb)
  return () => speechSynthesis.removeEventListener('voiceschanged', cb)
}

/** A persona's voice hint: preferred voice names, rate and pitch multipliers. */
export interface VoiceHintLike {
  rate?: number
  pitch?: number
  preferVoices?: readonly string[]
}

/** The voice a line will use: the rider's pick, else the persona's preference, else the system default. */
export function resolveVoice(
  voices: readonly SpeechSynthesisVoice[],
  voiceName: string | null | undefined,
  hint?: VoiceHintLike,
): SpeechSynthesisVoice | undefined {
  const byName = (n: string | null | undefined) => (n ? (voices.find((v) => v.name === n) ?? voices.find((v) => v.name.startsWith(n))) : undefined)
  return byName(voiceName) ?? hint?.preferVoices?.map(byName).find(Boolean) ?? voices.find((v) => v.default) ?? voices[0]
}

export interface SpeakOpts {
  prefs: Pick<CoachPrefs, 'voiceName' | 'rate' | 'volume'>
  hint?: VoiceHintLike
  /** Cut off whatever is being said first. */
  interrupt?: boolean
  /** Called once when the line ends, fails or is cancelled. */
  onEnd?: () => void
  /** Called at each word, for voices that report word boundaries (the caricature's jaw keeps time). */
  onWord?: () => void
}

/** Speaks one line. Returns false when there is nothing to say or no speech engine. */
export function speak(text: string, opts: SpeakOpts): boolean {
  if (typeof speechSynthesis === 'undefined' || !text.trim()) return false
  if (opts.interrupt) speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const voice = resolveVoice(listVoices(), opts.prefs.voiceName, opts.hint)
  if (voice) u.voice = voice
  u.rate = Math.max(0.5, Math.min(2, opts.prefs.rate * (opts.hint?.rate ?? 1)))
  u.pitch = Math.max(0.5, Math.min(2, opts.hint?.pitch ?? 1))
  u.volume = Math.max(0, Math.min(1, opts.prefs.volume))
  let ended = false
  const end = () => {
    if (ended) return
    ended = true
    if (current === u) current = null
    opts.onEnd?.()
  }
  u.onend = end
  u.onerror = end
  if (opts.onWord) {
    const onWord = opts.onWord
    u.onboundary = (e) => {
      if (e.name === 'word') onWord()
    }
  }
  current = u
  speechSynthesis.speak(u)
  return true
}

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}
