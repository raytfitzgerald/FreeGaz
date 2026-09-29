import { useEffect } from 'react'
import { getRuntime } from '../runtime/composition'

const typing = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable)

/** App-wide ride shortcuts: Space pause, L lap, C mute coach. Page-specific keys live on their pages. */
export function useGlobalHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const rides = getRuntime().rides
      if (e.code === 'Space' && rides.active) {
        rides.command({ type: 'togglePause' })
        e.preventDefault()
      } else if ((e.key === 'l' || e.key === 'L') && rides.active) {
        rides.command({ type: 'lap' })
        e.preventDefault()
      } else if (e.key === 'c' || e.key === 'C') {
        rides.command({ type: 'muteCoach' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
