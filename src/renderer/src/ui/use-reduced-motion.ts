import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  if (typeof matchMedia === 'undefined') return () => undefined
  const m = matchMedia(QUERY)
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia(QUERY).matches

/** The OS asks for less motion (System Settings → Accessibility → Display → Reduce motion). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, reduced, () => false)
}
