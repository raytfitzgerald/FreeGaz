import type { UpdateStatus } from '@shared/ipc/contract'

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** One line for the About page: where the updater is, in plain words. */
export function updateStatusText(s: UpdateStatus): string {
  switch (s.state) {
    case 'unsupported':
      return {
        dev: 'Updates arrive in the installed app. This is a development build.',
        web: 'The web app updates itself the next time it opens online.',
        unsigned: "This build isn't signed with a Developer ID, so it can't update itself. Download new versions from freegaz.app.",
        platform: 'In-app updates are for the Mac app.',
        failed: "The updater couldn't start. Download new versions from freegaz.app.",
      }[s.reason]
    case 'idle':
      return s.checkedAt ? `Last checked at ${time(s.checkedAt)}.` : 'Not checked yet.'
    case 'checking':
      return 'Checking for a new version…'
    case 'up-to-date':
      return `You're up to date. Checked at ${time(s.checkedAt)}.`
    case 'available':
      return `FreeGaz ${s.version} is available.`
    case 'downloading':
      return `Downloading FreeGaz ${s.version}… ${s.percent} %`
    case 'ready':
      return `FreeGaz ${s.version} is ready. It installs when you restart FreeGaz or quit it.`
    case 'error':
      return s.message
  }
}
