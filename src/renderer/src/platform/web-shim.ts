// Browser-mode implementation of the preload bridge: the installable web app
// (phones, via the browser) and `npm run dev:web`. Devices are real, over Web
// Bluetooth where the browser has it (Chrome on Android and desktop), or the
// simulator: always in dev, and with ?sim=1 in the built app. Services that
// need the main process (Strava, AI keys, the file system) have in-browser
// stand-ins.
import type { EventChannel, EventMap, FreegazBridge, InvokeChannel, InvokeReq, InvokeRes } from '@shared/ipc/contract'
import { AppSettingsSchema, DEFAULT_SETTINGS, mergeSettings, migrateStoredSettings, type AppSettings } from '@shared/settings'
import { bugIssueUrl } from '@core/support/bug-report'

const SETTINGS_KEY = 'freegaz.web.settings'
const query = () => new URLSearchParams(location.search)
/** Simulated devices: the default while developing, opt-in (?sim=1) in the built web app. */
const webSim = () => (import.meta.env.DEV ? query().get('sim') !== '0' : query().get('sim') === '1')

function webOs(): string {
  const ua = navigator.userAgent
  const ios = ua.match(/(?:iPhone|iPad); CPU (?:iPhone )?OS ([\d_]+)/)
  if (ios) return `iOS ${ios[1]!.replace(/_/g, '.')}`
  const android = ua.match(/Android ([\d.]+)/)
  if (android) return `Android ${android[1]}`
  return ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, '.') ?? 'unknown'
}
const JOURNAL_PREFIX = 'freegaz.web.journal.'

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      // quota / private mode: journal is best-effort in the browser build
    }
  },
  del: (k: string) => {
    try {
      localStorage.removeItem(k)
    } catch {
      // ignore
    }
  },
  keys: (prefix: string) => {
    try {
      return Object.keys(localStorage).filter((k) => k.startsWith(prefix))
    } catch {
      return []
    }
  },
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const parsed = raw ? AppSettingsSchema.safeParse(migrateStoredSettings(JSON.parse(raw))) : null
    return parsed?.success ? parsed.data : { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

type Handlers = { [C in InvokeChannel]: (req: InvokeReq<C>) => Promise<InvokeRes<C>> | InvokeRes<C> }

export function createWebShim(): FreegazBridge {
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  const fire = <E extends EventChannel>(event: E, payload: EventMap[E]) => {
    for (const l of listeners.get(event) ?? []) l(payload)
  }
  let settings = loadSettings()
  let wakeLock: { release(): Promise<void> } | null = null

  const handlers: Handlers = {
    'app.ping': ({ msg }) => ({ pong: msg, version: `${__FREEGAZ_VERSION__}-web`, platform: 'web' }),
    'app.info': () => ({
      version: `${__FREEGAZ_VERSION__}-web`,
      electron: 'n/a',
      chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? 'unknown',
      node: 'n/a',
      userData: 'IndexedDB (browser)',
      documents: 'Downloads (browser)',
      isPackaged: false,
      isTest: false,
      sim: webSim(),
      warp: Number(query().get('warp') ?? '1') || 1,
      os: webOs(),
      arch: 'browser',
    }),
    // the browser build opens the issue itself
    'support.reportBug': ({ title, body }) => {
      const { url, trimmed } = bugIssueUrl(title, body)
      window.open(url, '_blank', 'noopener')
      return { ok: true, trimmed }
    },
    'settings.get': () => settings,
    'settings.patch': (patch) => {
      settings = mergeSettings(settings, patch)
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      } catch {
        // storage unavailable (private window): keep in memory
      }
      fire('settings.changed', settings)
      return settings
    },
    // Chrome shows its own device chooser; nothing to bridge.
    'ble.prepare': () => ({ ok: true }),
    'ble.choose': () => ({ ok: false }),
    'ble.requestAutoConnect': () => ({ ok: false }),

    // Journals live in localStorage in the browser build (best-effort).
    'journal.begin': ({ rideId, meta }) => {
      ls.set(JOURNAL_PREFIX + rideId, `${meta}\n`)
      return { ok: true }
    },
    'journal.append': ({ rideId, seq, lines }) => {
      const k = JOURNAL_PREFIX + rideId
      if (lines.length) ls.set(k, (ls.get(k) ?? '') + lines.join('\n') + '\n')
      return { durableSeq: seq }
    },
    'journal.close': () => ({ ok: true }),
    'journal.remove': ({ rideId }) => {
      ls.del(JOURNAL_PREFIX + rideId)
      return { ok: true }
    },
    'journal.pending': () => ({
      journals: ls.keys(JOURNAL_PREFIX).map((k) => {
        const text = ls.get(k) ?? ''
        const firstLine = text.slice(0, text.indexOf('\n'))
        let meta: { name?: string; startedAt?: number; simulated?: boolean } = {}
        try {
          meta = JSON.parse(firstLine)
        } catch {
          // torn meta
        }
        return {
          rideId: k.slice(JOURNAL_PREFIX.length),
          name: meta.name ?? null,
          startedAt: meta.startedAt ?? null,
          records: Math.max(0, text.split('\n').filter(Boolean).length - 1),
          lastTs: null,
          simulated: meta.simulated ?? true,
        }
      }),
    }),
    'journal.read': ({ rideId }) => ({ text: ls.get(JOURNAL_PREFIX + rideId) ?? '' }),

    // Files download instead of landing in ~/Documents.
    'files.saveFit': ({ fileName, bytes }) => {
      const name = fileName.endsWith('.fit') ? fileName : `${fileName}.fit`
      const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/vnd.ant.fit' }))
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      return { path: `Downloads/${name}`, fileName: name }
    },
    'files.saveAs': ({ defaultName, bytes }) => {
      const url = URL.createObjectURL(new Blob([bytes.slice()]))
      const a = document.createElement('a')
      a.href = url
      a.download = defaultName
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      return { path: `Downloads/${defaultName}` }
    },
    'files.exportDir': () => ({ dir: 'Downloads' }),
    'files.chooseExportDir': () => ({ dir: null }),
    'files.reveal': () => ({ ok: false }),
    'music.status': () => ({ player: null, state: null, track: null, artist: null, volume: null }),
    'music.command': () => ({ player: null, state: null, track: null, artist: null, volume: null }),
    'files.listFits': () => ({ dir: 'browser', files: [] }),
    'files.readFit': () => {
      throw new Error('Reading the FIT folder needs the desktop app')
    },
    'files.exportZwift': ({ fileName, text }) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/xml' }))
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      return { paths: [], error: null }
    },
    'files.openUrl': ({ url }) => {
      window.open(url, '_blank', 'noopener')
      return { ok: true }
    },
    // Integrations need the main process (secrets, loopback OAuth): unavailable in the browser build.
    'strava.status': () => ({ configured: false, connected: false }),
    'strava.setApp': () => ({ ok: false }),
    'strava.connect': () => ({ ok: false, error: 'Strava needs the desktop app' }),
    'strava.disconnect': () => ({ ok: true }),
    'intervals.status': () => ({ configured: false }),
    'intervals.configure': () => ({ ok: false }),
    'intervals.clear': () => ({ ok: true }),
    'uploads.enqueue': ({ rideId, provider }) => ({ id: `${provider}:${rideId}`, status: 'error' }),
    'uploads.list': () => ({ items: [] }),
    'uploads.retry': () => ({ ok: false }),
    // AI runs in main (keys never touch the renderer); the browser build uses offline personas only.
    'ai.status': () => ({ provider: null, configured: false, model: null, keys: { anthropic: false, openai: false, grok: false }, breakerOpen: false }),
    'ai.configure': () => ({ provider: null, configured: false, model: null, keys: { anthropic: false, openai: false, grok: false }, breakerOpen: false }),
    'ai.models': () => ({ models: [], error: 'AI needs the desktop app' }),
    'ai.complete': () => ({ ok: false, error: 'AI needs the desktop app', code: 'not-configured' }),
    'ai.structured': () => ({ ok: false, error: 'AI needs the desktop app', code: 'not-configured' }),
    'ai.stream.start': ({ streamId }) => {
      setTimeout(() => fire('ai.stream.end', { streamId, text: null, error: 'AI needs the desktop app', code: 'not-configured', model: null }), 0)
      return { ok: true }
    },
    'ai.stream.cancel': () => ({ ok: true }),
    'minihud.toggle': () => ({ open: false }),
    'minihud.setClickThrough': () => ({ ok: true }),
    'ride.command': (cmd) => {
      fire('ride.command', cmd)
      return { ok: true }
    },
    'remote.start': ({ allowControl }) => ({ running: false, url: null, qrDataUrl: null, allowControl, clients: [] }),
    'remote.stop': () => ({ running: false, url: null, qrDataUrl: null, allowControl: false, clients: [] }),
    'remote.status': () => ({ running: false, url: null, qrDataUrl: null, allowControl: false, clients: [] }),
    'remote.kick': () => ({ ok: true }),
    'power.keepAwake': async ({ on }) => {
      try {
        if (on && !wakeLock) wakeLock = await (navigator as unknown as { wakeLock: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock.request('screen')
        if (!on && wakeLock) {
          await wakeLock.release()
          wakeLock = null
        }
        return { ok: true }
      } catch {
        return { ok: false }
      }
    },
  }

  return {
    platform: 'web',
    async invoke<C extends InvokeChannel>(channel: C, req: InvokeReq<C>): Promise<InvokeRes<C>> {
      const handler = handlers[channel] as (r: InvokeReq<C>) => Promise<InvokeRes<C>> | InvokeRes<C>
      if (!handler) throw new Error(`web shim: unsupported channel ${channel}`)
      return handler(req)
    },
    send() {
      // no main process in the browser build: live broadcasts go nowhere
    },
    on<E extends EventChannel>(event: E, listener: (payload: EventMap[E]) => void) {
      const set = listeners.get(event) ?? new Set()
      set.add(listener as (p: unknown) => void)
      listeners.set(event, set)
      return () => set.delete(listener as (p: unknown) => void)
    },
  }
}
