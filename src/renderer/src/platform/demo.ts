// Demo mode for the web and iPhone apps: a simulated trainer and heart-rate
// strap, for trying FreeGaz with no trainer nearby (and for App Review, which
// has none). Remembered on the device; rides recorded in it are flagged
// simulated, so they never upload or count. The Mac app uses FREEGAZ_SIM.

const KEY = 'freegaz.web.demo'

function read(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** On when ?sim=1, or when the rider turned it on; ?sim=0 forces it off. Dev builds default on. */
export function demoMode(search: string = location.search, dev = import.meta.env.DEV): boolean {
  const q = new URLSearchParams(search).get('sim')
  if (q === '1') return true
  if (q === '0') return false
  if (read() === '1') return true
  return dev && read() !== '0'
}

/** Turns demo mode on or off and restarts the app, so every device is rebuilt for it. */
export function setDemoMode(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // private browsing: ?sim still works
  }
  const url = new URL(location.href)
  if (url.searchParams.has('sim')) {
    url.searchParams.delete('sim')
    location.replace(url.toString())
  } else {
    // same URL (a hash route): replace() wouldn't reload, so reload
    location.reload()
  }
}
