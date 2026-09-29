import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { HttpError, backoffMs } from './http'

export type UploadProvider = 'strava' | 'intervals'
export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error'

export interface OutboxItem {
  id: string
  rideId: string
  provider: UploadProvider
  /** FIT file on disk (the export folder copy). */
  fitPath: string
  fileName: string
  name: string
  description?: string
  status: UploadStatus
  attempts: number
  nextAttemptAt: number
  activityId?: string
  lastError?: string
  createdAt: number
  updatedAt: number
}

export type Uploader = (item: OutboxItem, bytes: Uint8Array) => Promise<{ activityId: string }>

const MAX_ATTEMPTS = 8

/**
 * Persistent upload queue. Survives restarts and offline periods: items are
 * retried with exponential backoff (honouring Retry-After) until they succeed
 * or hit a permanent error.
 */
export class UploadOutbox {
  private items: OutboxItem[]
  private running = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly file: string,
    private readonly uploaders: Record<UploadProvider, Uploader>,
    private readonly readFile: (path: string) => Uint8Array,
    private readonly onChange: (item: OutboxItem) => void,
    private readonly now: () => number = Date.now,
  ) {
    this.items = this.load()
    // Anything left "uploading" by a crash goes back in the queue.
    for (const it of this.items) if (it.status === 'uploading') it.status = 'queued'
  }

  static inDir(dir: string, uploaders: Record<UploadProvider, Uploader>, readFile: (p: string) => Uint8Array, onChange: (i: OutboxItem) => void): UploadOutbox {
    return new UploadOutbox(join(dir, 'outbox.json'), uploaders, readFile, onChange)
  }

  list(): OutboxItem[] {
    return this.items.map((i) => ({ ...i }))
  }

  enqueue(entry: Pick<OutboxItem, 'rideId' | 'provider' | 'fitPath' | 'fileName' | 'name' | 'description'>): OutboxItem {
    const existing = this.items.find((i) => i.rideId === entry.rideId && i.provider === entry.provider)
    if (existing && existing.status !== 'error') return { ...existing }
    const item: OutboxItem = {
      ...entry,
      id: `${entry.provider}:${entry.rideId}`,
      status: 'queued',
      attempts: 0,
      nextAttemptAt: this.now(),
      createdAt: this.now(),
      updatedAt: this.now(),
    }
    this.items = this.items.filter((i) => i.id !== item.id)
    this.items.push(item)
    this.save()
    this.onChange({ ...item })
    this.kick()
    return { ...item }
  }

  retry(id: string): void {
    const it = this.items.find((i) => i.id === id)
    if (!it) return
    it.status = 'queued'
    it.attempts = 0
    it.nextAttemptAt = this.now()
    this.save()
    this.kick()
  }

  /** Process due items now (also called on a timer). */
  async run(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      for (;;) {
        const due = this.items.find((i) => i.status === 'queued' && i.nextAttemptAt <= this.now())
        if (!due) break
        await this.attempt(due)
      }
    } finally {
      this.running = false
      this.schedule()
    }
  }

  kick(): void {
    void this.run()
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private async attempt(item: OutboxItem): Promise<void> {
    item.status = 'uploading'
    item.attempts++
    item.updatedAt = this.now()
    this.save()
    this.onChange({ ...item })
    try {
      const bytes = this.readFile(item.fitPath)
      const { activityId } = await this.uploaders[item.provider](item, bytes)
      item.status = 'done'
      item.activityId = activityId
      item.lastError = undefined
    } catch (e) {
      const retryable = e instanceof HttpError ? e.retryable : true
      item.lastError = e instanceof Error ? e.message : String(e)
      if (retryable && item.attempts < MAX_ATTEMPTS) {
        item.status = 'queued'
        item.nextAttemptAt = this.now() + backoffMs(item.attempts - 1, e instanceof HttpError ? e.retryAfterS : null)
      } else {
        item.status = 'error'
      }
    }
    item.updatedAt = this.now()
    this.save()
    this.onChange({ ...item })
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    const next = this.items.filter((i) => i.status === 'queued').map((i) => i.nextAttemptAt)
    if (next.length === 0) return
    const delay = Math.max(1000, Math.min(...next) - this.now())
    this.timer = setTimeout(() => void this.run(), delay)
  }

  private load(): OutboxItem[] {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as OutboxItem[]
    } catch {
      return []
    }
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.items, null, 1))
    renameSync(tmp, this.file)
  }
}
