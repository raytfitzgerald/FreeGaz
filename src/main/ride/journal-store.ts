import { closeSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, unlinkSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { parseJournal, type JournalMeta } from '@core/ride/journal'

const SAFE_ID = /^[A-Za-z0-9_-]{6,64}$/

interface OpenJournal {
  fd: number
  lastSeq: number
  lastSync: number
}

export interface PendingJournal {
  rideId: string
  meta: JournalMeta | null
  records: number
  lastTs: number | null
  bytes: number
}

/**
 * Append-only ride journals in <userData>/journals/<rideId>.ndjson.
 * Writes go straight to the file descriptor (in the OS page cache, so a
 * renderer crash or app kill loses nothing written) and are fsync'd every
 * few seconds so even a power cut loses at most that long.
 */
export class JournalStore {
  private readonly dir: string
  private readonly open = new Map<string, OpenJournal>()

  constructor(
    userData: string,
    private readonly syncEveryMs = 5000,
    private readonly now: () => number = Date.now,
  ) {
    this.dir = join(userData, 'journals')
    mkdirSync(this.dir, { recursive: true })
  }

  pathFor(rideId: string): string {
    if (!SAFE_ID.test(rideId)) throw new Error(`Invalid ride id ${rideId}`)
    return join(this.dir, `${rideId}.ndjson`)
  }

  begin(rideId: string, metaLine: string): void {
    const fd = openSync(this.pathFor(rideId), 'a')
    writeSync(fd, `${metaLine}\n`)
    fsyncSync(fd)
    this.open.set(rideId, { fd, lastSeq: 0, lastSync: this.now() })
  }

  /** Appends lines; idempotent per sequence number. Returns the durable (written) seq. */
  append(rideId: string, seq: number, lines: string[]): number {
    let j = this.open.get(rideId)
    if (!j) {
      // Main restarted or renderer reloaded mid-ride: reopen for append.
      const fd = openSync(this.pathFor(rideId), 'a')
      j = { fd, lastSeq: seq - 1, lastSync: this.now() }
      this.open.set(rideId, j)
    }
    if (seq <= j.lastSeq) return j.lastSeq
    if (lines.length > 0) writeSync(j.fd, lines.map((l) => l.replace(/\n/g, ' ')).join('\n') + '\n')
    j.lastSeq = seq
    if (this.now() - j.lastSync >= this.syncEveryMs) {
      fsyncSync(j.fd)
      j.lastSync = this.now()
    }
    return j.lastSeq
  }

  /** Flush + close (keeps the file until finalize() confirms the ride is saved). */
  close(rideId: string): void {
    const j = this.open.get(rideId)
    if (!j) return
    try {
      fsyncSync(j.fd)
    } finally {
      closeSync(j.fd)
      this.open.delete(rideId)
    }
  }

  /** The ride is safely stored elsewhere: delete its journal. */
  remove(rideId: string): void {
    this.close(rideId)
    try {
      unlinkSync(this.pathFor(rideId))
    } catch {
      // already gone
    }
  }

  read(rideId: string): string {
    return readFileSync(this.pathFor(rideId), 'utf8')
  }

  /** Journals on disk that were never finalized (i.e. crashed rides). */
  pending(): PendingJournal[] {
    const out: PendingJournal[] = []
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.ndjson')) continue
      const rideId = f.slice(0, -'.ndjson'.length)
      if (!SAFE_ID.test(rideId) || this.open.has(rideId)) continue
      try {
        const text = readFileSync(join(this.dir, f), 'utf8')
        const j = parseJournal(text)
        out.push({ rideId, meta: j.meta, records: j.records.length, lastTs: j.records.at(-1)?.ts ?? null, bytes: statSync(join(this.dir, f)).size })
      } catch {
        // unreadable: leave it for manual inspection
      }
    }
    return out.sort((a, b) => (b.lastTs ?? 0) - (a.lastTs ?? 0))
  }

  closeAll(): void {
    for (const id of [...this.open.keys()]) this.close(id)
  }
}
