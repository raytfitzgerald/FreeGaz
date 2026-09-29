// Phone remote: a tiny HTTP + WebSocket server on the LAN so a phone on the
// handlebars can show live numbers and send commands (pause, skip, ±%).
//
// It is an open network surface, so:
//  * off by default; bound to one LAN interface only
//  * a 128-bit per-session token in the URL path (rotates every start)
//  * strict Host check and WebSocket Origin check (defeats DNS rebinding and
//    cross-site WebSocket hijacking from other pages on the network)
//  * view-only unless control is explicitly allowed
//  * commands validated against a zod whitelist and rate-limited per client
import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { networkInterfaces } from 'node:os'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import { RideCommandSchema, type LiveBroadcast, type RideCommand } from '@shared/live'
import { phonePage } from './phone-page'

export interface RemoteClient {
  id: string
  address: string
  connectedAt: number
}

export interface RemoteStatus {
  running: boolean
  url: string | null
  allowControl: boolean
  clients: RemoteClient[]
}

interface Conn {
  ws: WebSocket
  info: RemoteClient
  recent: number[]
}

const MAX_COMMANDS_PER_S = 5
const BROADCAST_INTERVAL_MS = 500

export function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) return a.address
  }
  return null
}

export class RemoteServer {
  private server: Server | null = null
  private wss: WebSocketServer | null = null
  private token = ''
  private host = ''
  private port = 0
  private allowControl = false
  private readonly conns = new Map<string, Conn>()
  private latest: LiveBroadcast | null = null
  private lastSent = 0
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly onCommand: (cmd: RideCommand) => void,
    private readonly onChange: (s: RemoteStatus) => void = () => undefined,
  ) {}

  status(): RemoteStatus {
    return {
      running: !!this.server,
      url: this.server ? this.url() : null,
      allowControl: this.allowControl,
      clients: [...this.conns.values()].map((c) => ({ ...c.info })),
    }
  }

  url(): string {
    return `http://${this.host}:${this.port}/r/${this.token}/`
  }

  async start(opts: { allowControl: boolean; host?: string; port?: number }): Promise<RemoteStatus> {
    await this.stop()
    const host = opts.host ?? lanAddress()
    if (!host) throw new Error('No local network connection found (connect to Wi-Fi first)')
    this.host = host
    this.token = randomBytes(16).toString('hex')
    this.allowControl = opts.allowControl
    const server = createServer((req, res) => this.handleHttp(req, res))
    const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 })
    server.on('upgrade', (req, socket, head) => this.handleUpgrade(wss, req, socket, head))
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(opts.port ?? 0, host, () => resolve())
    })
    this.server = server
    this.wss = wss
    this.port = (server.address() as AddressInfo).port
    this.timer = setInterval(() => this.flush(), BROADCAST_INTERVAL_MS)
    this.changed()
    return this.status()
  }

  async stop(): Promise<RemoteStatus> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const c of this.conns.values()) c.ws.close(1001, 'Remote stopped')
    this.conns.clear()
    this.wss?.close()
    const server = this.server
    this.server = null
    this.wss = null
    if (server) await new Promise<void>((r) => server.close(() => r()))
    this.changed()
    return this.status()
  }

  kick(clientId: string): void {
    const c = this.conns.get(clientId)
    if (!c) return
    c.ws.close(4001, 'Kicked')
    this.conns.delete(clientId)
    this.changed()
  }

  /** Called ~4x/s by main; the remote gets the latest frame at 2 Hz. */
  publish(b: LiveBroadcast): void {
    this.latest = b
  }

  // ---- internals ----------------------------------------------------------

  private expectedHost(): string {
    return `${this.host}:${this.port}`
  }

  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    if (req.headers.host !== this.expectedHost()) {
      res.writeHead(421).end()
      return
    }
    const path = (req.url ?? '/').split('?')[0]
    if (req.method !== 'GET' || path !== `/r/${this.token}/`) {
      res.writeHead(404).end()
      return
    }
    const nonce = randomBytes(16).toString('base64')
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src ws://${this.expectedHost()}; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    })
    res.end(phonePage({ nonce, wsPath: `/r/${this.token}/ws`, allowControl: this.allowControl }))
  }

  private handleUpgrade(wss: WebSocketServer, req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const reject = (code: number) => {
      socket.write(`HTTP/1.1 ${code} Forbidden\r\nConnection: close\r\n\r\n`)
      socket.destroy()
    }
    if (req.headers.host !== this.expectedHost()) return reject(403)
    if (req.headers.origin !== `http://${this.expectedHost()}`) return reject(403)
    if ((req.url ?? '') !== `/r/${this.token}/ws`) return reject(403)
    wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, req))
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const info: RemoteClient = { id: randomBytes(6).toString('hex'), address: req.socket.remoteAddress ?? '?', connectedAt: Date.now() }
    const conn: Conn = { ws, info, recent: [] }
    this.conns.set(info.id, conn)
    this.changed()
    ws.send(JSON.stringify({ type: 'hello', allowControl: this.allowControl }))
    if (this.latest) ws.send(JSON.stringify({ type: 'live', data: this.latest }))
    ws.on('message', (raw) => this.onMessage(conn, raw.toString()))
    ws.on('close', () => {
      this.conns.delete(info.id)
      this.changed()
    })
  }

  private onMessage(conn: Conn, raw: string): void {
    if (!this.allowControl) return
    const now = Date.now()
    conn.recent = conn.recent.filter((t) => now - t < 1000)
    if (conn.recent.length >= MAX_COMMANDS_PER_S) return
    let msg: unknown
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    const cmd = RideCommandSchema.safeParse((msg as { cmd?: unknown })?.cmd)
    if (!cmd.success) return
    conn.recent.push(now)
    this.onCommand(cmd.data)
  }

  private flush(): void {
    if (!this.latest || this.conns.size === 0) return
    if (this.latest.frame.t === this.lastSent) return
    this.lastSent = this.latest.frame.t
    const payload = JSON.stringify({ type: 'live', data: this.latest })
    for (const c of this.conns.values()) if (c.ws.readyState === c.ws.OPEN) c.ws.send(payload)
  }

  private changed(): void {
    this.onChange(this.status())
  }
}
