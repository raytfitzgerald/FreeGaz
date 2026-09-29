// Text-to-speech via the Web Speech API (macOS system voices; nothing leaves
// the machine). One utterance at a time; newer high-priority lines interrupt.
import type { CoachPrefs } from '@shared/settings'

let voicesCache: SpeechSynthesisVoice[] = []

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

export interface SpeakOpts {
  prefs: Pick<CoachPrefs, 'voiceName' | 'rate' | 'volume'>
  /** Persona voice hint (preferred voice names, rate/pitch multipliers). */
  hint?: { rate?: number; pitch?: number; preferVoices?: readonly string[] }
  interrupt?: boolean
}

export function speak(text: string, opts: SpeakOpts): void {
  if (typeof speechSynthesis === 'undefined' || !text.trim()) return
  if (opts.interrupt) speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const voices = listVoices()
  const byName = (n: string | null | undefined) => (n ? voices.find((v) => v.name === n || v.name.startsWith(n)) : undefined)
  const voice = byName(opts.prefs.voiceName) ?? opts.hint?.preferVoices?.map(byName).find(Boolean) ?? voices.find((v) => v.default)
  if (voice) u.voice = voice
  u.rate = Math.max(0.5, Math.min(2, opts.prefs.rate * (opts.hint?.rate ?? 1)))
  u.pitch = Math.max(0.5, Math.min(2, opts.hint?.pitch ?? 1))
  u.volume = opts.prefs.volume
  speechSynthesis.speak(u)
}

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}
