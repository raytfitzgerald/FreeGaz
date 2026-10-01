// The developer's bike fund: optional tip links. FreeGaz stays free; these
// only open the tip page in the browser. A service with no handle is hidden,
// so the whole thing disappears until at least one handle is set.

export const BIKE_FUND_TITLE = "Contribute to the developer's bike fund"
export const BIKE_FUND_BLURB =
  "FreeGaz is free and always will be. If it saved you a subscription, you can put a little toward the developer's next bike. Totally optional, and it unlocks nothing."

export type TipService = 'venmo' | 'buymeacoffee' | 'kofi'

/** The handles to tip. Set one to show its button; leave '' to hide it. */
export const BIKE_FUND_HANDLES: Readonly<Record<TipService, string>> = {
  venmo: 'raymond-fitzgerald',
  buymeacoffee: 'raytfitzgeo',
  kofi: '',
}

const SERVICES: readonly { service: TipService; label: string; url: (handle: string) => string }[] = [
  { service: 'venmo', label: 'Venmo', url: (h) => `https://venmo.com/u/${h}` },
  { service: 'buymeacoffee', label: 'Buy Me a Coffee', url: (h) => `https://buymeacoffee.com/${h}` },
  { service: 'kofi', label: 'Ko-fi', url: (h) => `https://ko-fi.com/${h}` },
]

/** Hosts the tip links open on, for the main process's external-link allowlist. */
export const BIKE_FUND_HOSTS = ['venmo.com', 'buymeacoffee.com', 'ko-fi.com'] as const

export interface TipLink {
  service: TipService
  label: string
  url: string
}

/** The tip links that have a handle, in display order. */
export function bikeFundLinks(handles: Readonly<Record<TipService, string>> = BIKE_FUND_HANDLES): TipLink[] {
  return SERVICES.flatMap(({ service, label, url }) => {
    const handle = handles[service].trim().replace(/^@/, '')
    return /^[\w-]{1,50}$/.test(handle) ? [{ service, label, url: url(encodeURIComponent(handle)) }] : []
  })
}

/** Whether any tip link is set, so the bike fund shows at all. */
export function hasBikeFund(): boolean {
  return bikeFundLinks().length > 0
}
