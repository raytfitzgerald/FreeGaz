// AI quip packs for one ride, requested through main (keys never live here)
// and filtered with the same rules as every other line. Any failure, refusal
// or timeout just means the canned lines carry the ride: nothing here throws.
import { quipLinesFromPack, quipPackPrompt, type QuipRide } from '@core/coach'
import type { CoachLineTemplate, PersonaMeta, Profanity } from '@core/persona'
import { bridge } from '../platform/bridge'

export interface QuipRequest {
  persona: PersonaMeta
  spice: number
  profanity: Profanity
  ride: QuipRide
}

export type QuipSource = (req: QuipRequest) => Promise<CoachLineTemplate[]>

/** Is an AI provider configured and not paused by its circuit breaker? */
export async function aiReady(): Promise<boolean> {
  try {
    const s = await bridge().invoke('ai.status', {})
    return s.configured && s.provider !== null && !s.breakerOpen
  } catch {
    return false
  }
}

export const fetchQuipLines: QuipSource = async (req) => {
  try {
    if (!(await aiReady())) return []
    const input = quipPackPrompt(req.persona, { spice: req.spice, profanity: req.profanity }, req.ride)
    const res = await bridge().invoke('ai.structured', { purpose: 'quip-pack', input })
    if (!res.ok) return []
    return quipLinesFromPack(res.value, { persona: req.persona, spice: req.spice, profanity: req.profanity }).lines
  } catch {
    return []
  }
}
