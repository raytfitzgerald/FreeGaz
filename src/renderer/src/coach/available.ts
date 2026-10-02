// Which coaches this build offers. The App Store build leaves out the two
// parodies of real politicians (The Donald, Bibi) for now: App Review can
// reject caricatures of real people. The Mac app and the web app keep them.
import { PACKS, type PersonaPack } from '@core/persona'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/settings'
import { isNative } from '../platform/native'

export const HIDDEN_ON_PHONE: ReadonlySet<string> = new Set(['trump', 'bibi'])

export const personaHidden = (id: string): boolean => isNative() && HIDDEN_ON_PHONE.has(id)

export const availablePacks = (): readonly PersonaPack[] => PACKS.filter((p) => !personaHidden(p.meta.id))

/** The settings with a coach this build offers: a hidden one becomes the default coach. */
export function withAvailableCoach(s: AppSettings): AppSettings {
  return personaHidden(s.coach.personaId) ? { ...s, coach: { ...s.coach, personaId: DEFAULT_SETTINGS.coach.personaId } } : s
}
