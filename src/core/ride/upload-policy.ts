// Whether a saved ride goes to Strava automatically, and if not, why: the
// saved-ride card says so instead of leaving the rider to guess.

/** Rides shorter than this (moving time) are never auto-uploaded. */
export const MIN_UPLOAD_S = 60

export type UploadSkip = 'simulated' | 'no-file' | 'short' | 'off' | 'not-connected'

export function uploadSkipReason(r: { simulated: boolean; movingS: number; hasFit: boolean; autoOn: boolean; connected: boolean }): UploadSkip | null {
  if (r.simulated) return 'simulated'
  if (!r.hasFit) return 'no-file'
  if (r.movingS < MIN_UPLOAD_S) return 'short'
  if (!r.autoOn) return 'off'
  if (!r.connected) return 'not-connected'
  return null
}

const SKIP_TEXT: Record<Exclude<UploadSkip, 'simulated'>, string> = {
  'no-file': 'No FIT file was written, so nothing went to Strava.',
  short: 'Under a minute of riding, so it wasn’t sent to Strava.',
  off: 'Auto-upload to Strava is off (Settings → Strava & sync).',
  'not-connected': 'Not sent to Strava: it isn’t connected (Settings → Strava & sync).',
}

/** The card's one-line explanation; simulated rides already say why. */
export function uploadSkipText(skip: UploadSkip | null): string | null {
  return skip === null || skip === 'simulated' ? null : SKIP_TEXT[skip]
}
