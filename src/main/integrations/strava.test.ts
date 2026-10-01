import { mkdtempSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SecretStore, type Cipher } from '../secrets/secret-store'
import { HttpError } from './http'
import { IntervalsClient } from './intervals'
import { StravaClient, type StravaEndpoints } from './strava'

const plainCipher: Cipher = {
  isAvailable: () => true,
  encrypt: (s) => Buffer.from(s, 'utf8'),
  decrypt: (b) => b.toString('utf8'),
}

interface MockState {
  tokenCalls: Record<string, string>[]
  uploads: { fields: string; auth: string }[]
  pollsBeforeDone: number
  uploadError: string | null
  rateLimit: boolean
  refreshCount: number
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => resolve(b))
  })
}

async function startMock(state: MockState): Promise<{ server: Server; base: string }> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const body = await readBody(req)
    res.setHeader('content-type', 'application/json')
    if (url.pathname === '/oauth/token') {
      const p = JSON.parse(body) as Record<string, string>
      state.tokenCalls.push(p)
      if (p.grant_type === 'refresh_token') state.refreshCount++
      res.end(
        JSON.stringify({
          access_token: `access-${state.tokenCalls.length}`,
          refresh_token: `refresh-${state.tokenCalls.length}`,
          expires_at: Math.floor(Date.now() / 1000) + 6 * 3600,
          athlete: { id: 42, firstname: 'Ray', lastname: 'F' },
        }),
      )
      return
    }
    if (url.pathname === '/api/v3/uploads' && req.method === 'POST') {
      if (state.rateLimit) {
        res.statusCode = 429
        res.setHeader('retry-after', '12')
        res.end(JSON.stringify({ message: 'Rate Limit Exceeded' }))
        return
      }
      state.uploads.push({ fields: body, auth: String(req.headers.authorization) })
      res.statusCode = 201
      res.end(JSON.stringify({ id: 777, id_str: '777', error: null, status: 'Your activity is still being processed.', activity_id: null }))
      return
    }
    if (url.pathname === '/api/v3/uploads/777') {
      if (state.uploadError) {
        res.end(JSON.stringify({ id: 777, error: state.uploadError, status: 'There was an error processing your activity.', activity_id: null }))
        return
      }
      const done = state.pollsBeforeDone-- <= 0
      res.end(JSON.stringify({ id: 777, error: null, status: done ? 'Your activity is ready.' : 'processing', activity_id: done ? 123456789 : null }))
      return
    }
    if (url.pathname === '/api/v1/athlete/0/activities') {
      state.uploads.push({ fields: `${url.search}\n${body}`, auth: String(req.headers.authorization) })
      res.end(JSON.stringify({ id: 'i9876' }))
      return
    }
    res.statusCode = 404
    res.end('{}')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }
}

let state: MockState
let mock: { server: Server; base: string }
let endpoints: StravaEndpoints
let secrets: SecretStore

beforeEach(async () => {
  state = { tokenCalls: [], uploads: [], pollsBeforeDone: 2, uploadError: null, rateLimit: false, refreshCount: 0 }
  mock = await startMock(state)
  endpoints = { authorize: `${mock.base}/oauth/authorize`, token: `${mock.base}/oauth/token`, api: `${mock.base}/api/v3` }
  secrets = SecretStore.inDir(mkdtempSync(join(tmpdir(), 'freegaz-secrets-')), plainCipher)
})
afterEach(() => new Promise<void>((r) => mock.server.close(() => r())))

/** Pretends to be the user's browser: follows the authorize URL straight to the redirect. */
async function fakeBrowser(url: string, tamperState = false): Promise<void> {
  const u = new URL(url)
  const redirect = new URL(u.searchParams.get('redirect_uri')!)
  redirect.searchParams.set('code', 'the-auth-code')
  redirect.searchParams.set('state', tamperState ? 'evil' : u.searchParams.get('state')!)
  expect(u.searchParams.get('scope')).toBe('activity:write')
  expect(redirect.hostname).toBe('127.0.0.1')
  await fetch(redirect)
}

describe('Strava OAuth', () => {
  it('exchanges the code from the loopback redirect and stores tokens', async () => {
    const strava = new StravaClient(secrets, endpoints)
    strava.setApp({ clientId: '123', clientSecret: 'shh' })
    const tokens = await strava.connect((url) => fakeBrowser(url))
    expect(tokens.athleteName).toBe('Ray F')
    expect(state.tokenCalls[0]).toMatchObject({ client_id: '123', client_secret: 'shh', code: 'the-auth-code', grant_type: 'authorization_code' })
    expect(strava.status()).toMatchObject({ configured: true, connected: true })
  })

  it('rejects a redirect with the wrong state', async () => {
    const strava = new StravaClient(secrets, endpoints)
    strava.setApp({ clientId: '123', clientSecret: 'shh' })
    await expect(strava.connect((url) => fakeBrowser(url, true))).rejects.toThrow(/state mismatch/)
  })

  it('refreshes near expiry and persists the rotated refresh token', async () => {
    let now = Math.floor(Date.now() / 1000)
    const strava = new StravaClient(secrets, endpoints, () => now)
    strava.setApp({ clientId: '123', clientSecret: 'shh' })
    await strava.connect((url) => fakeBrowser(url))
    expect(await strava.accessToken()).toBe('access-1') // fresh: no refresh
    now += 5.5 * 3600 // < 1 h left
    expect(await strava.accessToken()).toBe('access-2')
    expect(state.tokenCalls[1]).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'refresh-1' })
    expect(strava.tokens()?.refreshToken).toBe('refresh-2')
  })
})

describe('Strava upload', () => {
  const upload = { bytes: Uint8Array.from([14, 16, 0x9f]), fileName: 'ride.fit', name: 'Sweet Spot 3×15', description: 'Roasted by the Drill Sergeant', externalId: 'freegaz-abc123' }

  async function connected() {
    const strava = new StravaClient(secrets, endpoints)
    strava.setApp({ clientId: '123', clientSecret: 'shh' })
    await strava.connect((url) => fakeBrowser(url))
    return strava
  }

  it('uploads as a VirtualRide, without the trainer flag that would hide its map, and polls until processed', async () => {
    const strava = await connected()
    const res = await strava.uploadFit(upload, { sleep: async () => undefined })
    expect(res).toEqual({ activityId: '123456789', duplicate: false })
    const fields = state.uploads[0]!.fields
    expect(fields).toContain('name="data_type"\r\n\r\nfit')
    expect(fields).toContain('name="sport_type"\r\n\r\nVirtualRide')
    expect(fields).not.toContain('name="trainer"')
    expect(fields).toContain('name="sport_type"\r\n\r\nVirtualRide')
    expect(fields).toContain('name="external_id"\r\n\r\nfreegaz-abc123')
    expect(state.uploads[0]!.auth).toBe('Bearer access-1')
  })

  it('treats a duplicate as success', async () => {
    const strava = await connected()
    state.uploadError = 'ride.fit duplicate of activity 111222333'
    expect(await strava.uploadFit(upload, { sleep: async () => undefined })).toEqual({ activityId: '111222333', duplicate: true })
  })

  it('surfaces rate limiting with Retry-After', async () => {
    const strava = await connected()
    state.rateLimit = true
    const err = await strava.uploadFit(upload, { sleep: async () => undefined }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).status).toBe(429)
    expect((err as HttpError).retryAfterS).toBe(12)
    expect((err as HttpError).retryable).toBe(true)
  })
})

describe('intervals.icu upload', () => {
  it('uses Basic auth with API_KEY and posts the FIT', async () => {
    const icu = new IntervalsClient(secrets, `${mock.base}/api/v1`)
    icu.configure({ apiKey: 'k3y', athleteId: '0' })
    const res = await icu.uploadFit({ bytes: Uint8Array.from([1, 2]), fileName: 'ride.fit', name: 'Ride', externalId: 'freegaz-x' })
    expect(res.activityId).toBe('i9876')
    expect(state.uploads[0]!.auth).toBe(`Basic ${Buffer.from('API_KEY:k3y').toString('base64')}`)
    expect(state.uploads[0]!.fields).toContain('external_id=freegaz-x')
  })
})
