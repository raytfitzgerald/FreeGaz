import { mkdtempSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { encodeMeta, encodeRecord, parseJournal } from '@core/ride/journal'
import type { RideRecord } from '@core/ride/recorder'
import { JournalStore } from './journal-store'

const dir = () => mkdtempSync(join(tmpdir(), 'freegaz-journal-'))
const meta = (rideId: string) => encodeMeta({ rideId, startedAt: 1, name: 'Ride', kind: 'free', simulated: false, ftpW: 250, weightKg: 75 })
const rec = (t: number): RideRecord => ({
  t, ts: t * 1000, power: 200, cadence: 90, hr: 140, speed: 9, distance: t * 9, altitude: null, grade: null,
  targetW: null, lrBalance: null, coreTemp: null, skinTemp: null, smo2: null, lap: 0, rr: [],
})

describe('JournalStore', () => {
  it('appends idempotently by sequence number', () => {
    const store = new JournalStore(dir())
    store.begin('ride-abc123', meta('ride-abc123'))
    store.append('ride-abc123', 1, [encodeRecord(rec(0))])
    store.append('ride-abc123', 1, [encodeRecord(rec(0))]) // retry of the same batch
    store.append('ride-abc123', 2, [encodeRecord(rec(1)), encodeRecord(rec(2))])
    store.close('ride-abc123')
    const j = parseJournal(store.read('ride-abc123'))
    expect(j.records.map((r) => r.t)).toEqual([0, 1, 2])
  })

  it('lists unfinalized journals as pending (crash recovery) and removes finalized ones', () => {
    const d = dir()
    const a = new JournalStore(d)
    a.begin('crashed-ride1', meta('crashed-ride1'))
    a.append('crashed-ride1', 1, [encodeRecord(rec(0)), encodeRecord(rec(1))])
    // simulate an app kill: a fresh store instance, file never closed/finalized
    const b = new JournalStore(d)
    const pending = b.pending()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ rideId: 'crashed-ride1', records: 2 })
    b.remove('crashed-ride1')
    expect(b.pending()).toHaveLength(0)
  })

  it('survives a torn tail and reopens for append after a restart', () => {
    const d = dir()
    const a = new JournalStore(d)
    a.begin('torn-ride01', meta('torn-ride01'))
    a.append('torn-ride01', 1, [encodeRecord(rec(0))])
    appendFileSync(a.pathFor('torn-ride01'), '[1,1000,20')
    const b = new JournalStore(d)
    expect(b.pending()[0]?.records).toBe(1)
  })

  it('rejects path-traversal ride ids', () => {
    const store = new JournalStore(dir())
    expect(() => store.begin('../../etc/passwd', 'x')).toThrow()
  })
})
