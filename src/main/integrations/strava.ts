// Strava: OAuth (loopback redirect) + FIT upload.
//
// Per Strava's 2026 API rules the user creates their own "single player" API
// app (which requires a Strava subscription) and pastes its Client ID/Secret.
// FreeGaz only ever UPLOADS; it never reads Strava data, which keeps it clear
// of the API agreement's AI/analytics restrictions.
import { randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { SecretStore } from '../secrets/secret-store'
import { BRAND_COLORS, wordmarkSvg } from '@shared/brand'
import { HttpError, requestJson } from './http'

export interface StravaEndpoints {
  /** Where the user's browser is sent to authorize. */
  authorize: string
  token: string
  api: string
}

export const STRAVA_ENDPOINTS: StravaEndpoints = {
  authorize: 'https://www.strava.com/oauth/authorize',
  token: 'https://www.strava.com/oauth/token',
  api: 'https://www.strava.com/api/v3',
}

export interface StravaAppCredentials {
  clientId: string
  clientSecret: string
}

export interface StravaTokens {
  accessToken: string
  refreshToken: string
  /** epoch seconds */
  expiresAt: number
  athleteName?: string
  athleteId?: number
  scope?: string
}

const SECRET_APP = 'strava.app'
const SECRET_TOKENS = 'strava.tokens'

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete?: { id: number; firstname?: string; lastname?: string }
}

export class StravaClient {
  constructor(
    private readonly secrets: SecretStore,
    private readonly endpoints: StravaEndpoints = STRAVA_ENDPOINTS,
    private readonly nowS: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  // ---- configuration ----------------------------------------------------

  setApp(creds: StravaAppCredentials): void {
    this.secrets.setJson(SECRET_APP, creds)
  }

  app(): StravaAppCredentials | null {
    return this.secrets.getJson<StravaAppCredentials>(SECRET_APP)
  }

  tokens(): StravaTokens | null {
    return this.secrets.getJson<StravaTokens>(SECRET_TOKENS)
  }

  status(): { configured: boolean; connected: boolean; athleteName?: string; clientId?: string } {
    const app = this.app()
    const t = this.tokens()
    return { configured: !!app, connected: !!t, athleteName: t?.athleteName, clientId: app?.clientId }
  }

  disconnect(): void {
    this.secrets.delete(SECRET_TOKENS)
  }

  // ---- OAuth -------------------------------------------------------------

  /**
   * Runs the OAuth dance: opens the system browser at Strava's consent page
   * and waits for the redirect on a one-shot loopback listener bound to
   * 127.0.0.1 (Strava accepts 127.0.0.1/localhost as callback domains).
   */
  async connect(openExternal: (url: string) => Promise<void>, timeoutMs = 5 * 60_000): Promise<StravaTokens> {
    const app = this.app()
    if (!app) throw new Error('Add your Strava API app Client ID and Secret first')
    const state = randomBytes(24).toString('hex')
    const { server, port, code } = await listenForCode(state, timeoutMs)
    try {
      const redirect = `http://127.0.0.1:${port}/strava/callback`
      const url = new URL(this.endpoints.authorize)
      url.searchParams.set('client_id', app.clientId)
      url.searchParams.set('redirect_uri', redirect)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('approval_prompt', 'auto')
      url.searchParams.set('scope', 'activity:write')
      url.searchParams.set('state', state)
      await openExternal(url.toString())
      const authCode = await code
      const res = await requestJson<TokenResponse>(this.endpoints.token, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, code: authCode, grant_type: 'authorization_code' }),
      })
      const tokens = toTokens(res)
      this.secrets.setJson(SECRET_TOKENS, tokens)
      return tokens
    } finally {
      server.close()
    }
  }

  /** A valid access token, refreshing (and persisting the rotated refresh token) when < 1 h is left. */
  async accessToken(): Promise<string> {
    const app = this.app()
    const t = this.tokens()
    if (!app || !t) throw new Error('Strava is not connected')
    if (t.expiresAt - this.nowS() > 3600) return t.accessToken
    const res = await requestJson<TokenResponse>(this.endpoints.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, grant_type: 'refresh_token', refresh_token: t.refreshToken }),
    })
    const next = { ...t, ...toTokens(res), athleteName: t.athleteName, athleteId: t.athleteId }
    this.secrets.setJson(SECRET_TOKENS, next)
    return next.accessToken
  }

  // ---- upload ----------------------------------------------------------------

  /**
   * Uploads a FIT file and waits for processing. Duplicate uploads (same
   * external_id or identical file) resolve to the existing activity.
   */
  async uploadFit(
    upload: { bytes: Uint8Array; fileName: string; name: string; description?: string; externalId: string },
    opts: { pollMs?: number; maxWaitMs?: number; sleep?: (ms: number) => Promise<void> } = {},
  ): Promise<{ activityId: string; duplicate: boolean }> {
    const token = await this.accessToken()
    const form = new FormData()
    form.set('file', new Blob([upload.bytes.slice()], { type: 'application/octet-stream' }), upload.fileName)
    form.set('data_type', 'fit')
    form.set('name', upload.name)
    if (upload.description) form.set('description', upload.description)
    // No trainer flag: Strava hides the map of anything marked as a trainer ride, and a
    // VirtualRide is indoor already (it's how journeys and route rides keep their map).
    form.set('sport_type', 'VirtualRide')
    form.set('external_id', upload.externalId)

    const created = await requestJson<UploadStatus>(`${this.endpoints.api}/uploads`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
    })
    const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
    const pollMs = Math.max(1000, opts.pollMs ?? 1500)
    const deadline = Date.now() + (opts.maxWaitMs ?? 120_000)
    let status = created
    for (;;) {
      const done = interpret(status)
      if (done) return done
      if (Date.now() > deadline) throw new Error('Strava is still processing the upload; it will appear shortly')
      await sleep(pollMs)
      status = await requestJson<UploadStatus>(`${this.endpoints.api}/uploads/${status.id_str ?? status.id}`, {
        headers: { authorization: `Bearer ${await this.accessToken()}` },
      })
    }
  }
}

interface UploadStatus {
  id: number
  id_str?: string
  error: string | null
  status: string
  activity_id: number | null
}

function interpret(s: UploadStatus): { activityId: string; duplicate: boolean } | null {
  if (s.activity_id) return { activityId: String(s.activity_id), duplicate: false }
  if (s.error) {
    const dup = /duplicate of .*?(\d{5,})/i.exec(s.error)
    if (dup) return { activityId: dup[1]!, duplicate: true }
    throw new HttpError(`Strava rejected the upload: ${s.error}`, 400, s.error)
  }
  return null
}

function toTokens(r: TokenResponse): StravaTokens {
  const name = [r.athlete?.firstname, r.athlete?.lastname].filter(Boolean).join(' ') || undefined
  return { accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: r.expires_at, athleteName: name, athleteId: r.athlete?.id }
}

/** One-shot loopback HTTP listener for the OAuth redirect. */
function listenForCode(expectedState: string, timeoutMs: number): Promise<{ server: Server; port: number; code: Promise<string> }> {
  return new Promise((resolveListen, rejectListen) => {
    let settle: { resolve: (c: string) => void; reject: (e: Error) => void } | null = null
    const code = new Promise<string>((resolve, reject) => {
      settle = { resolve, reject }
    })
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/strava/callback') {
        res.writeHead(404).end()
        return
      }
      const err = url.searchParams.get('error')
      const state = url.searchParams.get('state')
      const c = url.searchParams.get('code')
      const ok = !err && state === expectedState && !!c
      res.writeHead(ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' })
      res.end(page(ok ? 'Strava connected. You can close this tab and get back on the bike.' : 'Strava authorization failed. Close this tab and try again from FreeGaz.'))
      if (ok) settle?.resolve(c!)
      else settle?.reject(new Error(err ? `Strava authorization ${err}` : 'OAuth state mismatch'))
    })
    const timer = setTimeout(() => settle?.reject(new Error('Timed out waiting for Strava authorization')), timeoutMs)
    code.finally(() => clearTimeout(timer)).catch(() => undefined)
    server.on('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      resolveListen({ server, port: (server.address() as AddressInfo).port, code })
    })
  })
}

function page(message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>FreeGaz</title><body style="font:16px -apple-system,sans-serif;background:${BRAND_COLORS.night};color:${BRAND_COLORS.chalk};display:grid;place-items:center;align-content:center;gap:20px;height:100vh;margin:0">${wordmarkSvg(BRAND_COLORS.chalk, 'style="height:40px;width:auto"')}<p>${message}</p></body>`
}
