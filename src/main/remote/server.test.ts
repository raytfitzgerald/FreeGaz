import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { EMPTY_FRAME, type RideCommand } from '@shared/live'
import { RemoteServer } from './server'

const HOST = '127.0.0.1'
let server: RemoteServer | null = null

afterEach(async () => {
  await server?.stop()
  server = null
})

async function start(allowControl = true) {
  const commands: RideCommand[] = []
  server = new RemoteServer((c) => commands.push(c))
  const status = await server.start({ allowControl, host: HOST })
  const url = new URL(status.url!)
  return { status, url, commands }
}

const openWs = (url: string, origin: string): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { origin })
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
    ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)))
  })

describe('RemoteServer', () => {
  it('serves the phone page only on the tokenized path with the right Host', async () => {
    const { url } = await start()
    const ok = await fetch(url)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(await ok.text()).toContain('FreeGaz remote')
    const wrongToken = await fetch(`http://${url.host}/r/deadbeef/`)
    expect(wrongToken.status).toBe(404)
  })

  it('rejects WebSocket upgrades with a bad token or foreign Origin', async () => {
    const { url } = await start()
    const wsBase = `ws://${url.host}${url.pathname}ws`
    await expect(openWs(`ws://${url.host}/r/nope/ws`, `http://${url.host}`)).rejects.toThrow(/403/)
    await expect(openWs(wsBase, 'http://evil.example')).rejects.toThrow(/403/)
    const ws = await openWs(wsBase, `http://${url.host}`)
    ws.close()
  })

  it('streams live frames at ~2 Hz and accepts whitelisted commands', async () => {
    const { url, commands } = await start(true)
    const ws = await openWs(`ws://${url.host}${url.pathname}ws`, `http://${url.host}`)
    const frames: unknown[] = []
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString()) as { type: string }
      if (m.type === 'live') frames.push(m)
    })
    for (let i = 0; i < 12; i++) {
      server!.publish({ frame: { ...EMPTY_FRAME, t: i * 250, power3s: 200 + i }, ride: null })
      await new Promise((r) => setTimeout(r, 250))
    }
    expect(frames.length).toBeGreaterThanOrEqual(4)
    ws.send(JSON.stringify({ cmd: { type: 'skip' } }))
    ws.send(JSON.stringify({ cmd: { type: 'rm -rf' } })) // not whitelisted
    ws.send('not json')
    await new Promise((r) => setTimeout(r, 100))
    expect(commands).toEqual([{ type: 'skip' }])
    ws.close()
  })

  it('ignores commands in view-only mode and rate-limits floods', async () => {
    const viewOnly = await start(false)
    let ws = await openWs(`ws://${viewOnly.url.host}${viewOnly.url.pathname}ws`, `http://${viewOnly.url.host}`)
    ws.send(JSON.stringify({ cmd: { type: 'skip' } }))
    await new Promise((r) => setTimeout(r, 50))
    expect(viewOnly.commands).toHaveLength(0)
    ws.close()
    await server!.stop()

    const ctl = await start(true)
    ws = await openWs(`ws://${ctl.url.host}${ctl.url.pathname}ws`, `http://${ctl.url.host}`)
    for (let i = 0; i < 20; i++) ws.send(JSON.stringify({ cmd: { type: 'lap' } }))
    await new Promise((r) => setTimeout(r, 100))
    expect(ctl.commands.length).toBeLessThanOrEqual(5)
    ws.close()
  })

  it('rotates the token on every start and can kick clients', async () => {
    const a = await start()
    const ws = await openWs(`ws://${a.url.host}${a.url.pathname}ws`, `http://${a.url.host}`)
    await new Promise((r) => setTimeout(r, 30))
    const id = server!.status().clients[0]!.id
    const closed = new Promise((r) => ws.once('close', r))
    server!.kick(id)
    await closed
    const b = await server!.start({ allowControl: true, host: HOST })
    expect(b.url).not.toBe(a.status.url)
  })
})
