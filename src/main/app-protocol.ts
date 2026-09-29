import { net, protocol } from 'electron'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

// Production builds are served from app://freegaz/ rather than file://.
// IndexedDB, localStorage and Web Bluetooth permissions are all keyed by this
// origin, so it must NEVER change once users have data.
export const APP_SCHEME = 'app'
export const APP_HOST = 'freegaz'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

/** Must run before `app.ready`. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true },
    },
  ])
}

/** Serves files from the built renderer directory with a strict CSP. */
export function handleAppScheme(rendererDir: string): void {
  const root = normalize(rendererDir + sep)
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.host !== APP_HOST) return new Response('Not found', { status: 404 })

    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/' || pathname === '') pathname = '/index.html'
    const filePath = normalize(join(root, pathname))
    if (!filePath.startsWith(root)) return new Response('Forbidden', { status: 403 })

    const upstream = await net.fetch(pathToFileURL(filePath).toString())
    const headers = new Headers(upstream.headers)
    if (filePath.endsWith('.html')) {
      headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY)
      headers.set('X-Content-Type-Options', 'nosniff')
    }
    return new Response(upstream.body, { status: upstream.status, headers })
  })
}
