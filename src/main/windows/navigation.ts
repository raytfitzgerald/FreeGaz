import { APP_ORIGIN } from '../app-protocol'
import { env } from '../env'

export { APP_ORIGIN }

/** In-window navigation is only allowed within our own origin (hash routing). */
export function isAllowedNavigation(url: string): boolean {
  if (url.startsWith(`${APP_ORIGIN}/`)) return true
  if (env.devServerUrl && url.startsWith(env.devServerUrl)) return true
  return false
}
