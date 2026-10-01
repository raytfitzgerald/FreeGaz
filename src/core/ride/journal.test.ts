import { describe, expect, it } from 'vitest'
import { encodeEvent, encodeMeta, encodeRecord, parseJournal } from './journal'
import type { RideRecord } from './recorder'

const rec = (t: number, power: number | null): RideRecord => ({
  t,
  ts: 1_790_000_000_000 + t * 1000,
  power,
  cadence: 90,
  hr: 140,
  speed: 9.5,
  distance: t * 9.5,
  altitude: null,
  grade: null,
  targetW: 200,
  lrBalance: null,
  coreTemp: null,
  skinTemp: null,
  smo2: null,
  lap: 0,
  rr: [801.8, 799.8],
})

const meta = encodeMeta({ rideId: 'r1', startedAt: 1, name: 'Test', kind: 'free', simulated: false, ftpW: 250, weightKg: 75 })

describe('ride journal', () => {
  it('round-trips meta, records and events', () => {
    const text = [meta, encodeRecord(rec(0, 200)), encodeRecord(rec(1, null)), encodeEvent({ type: 'event', t: 2, ts: 3, kind: 'pause' }), encodeEvent({ type: 'end', t: 2, ts: 4 })].join('\n')
    const j = parseJournal(text)
    expect(j.meta?.rideId).toBe('r1')
    expect(j.records.map((r) => r.power)).toEqual([200, null])
    expect(j.records[0]?.rr).toEqual([801.8, 799.8])
    expect(j.events).toHaveLength(2)
    expect(j.ended).toBe(true)
  })

  it('keeps positions, and reads older journals that have none', () => {
    const withGps = { ...rec(0, 200), lat: 48.8583701, lon: 2.2944813 }
    const text = [meta, encodeRecord(withGps), encodeRecord(rec(1, 210))].join('\n')
    const j = parseJournal(text)
    expect(j.records[0]).toMatchObject({ lat: 48.8583701, lon: 2.2944813 })
    expect(j.records[1]).not.toHaveProperty('lat')
  })

  it('ignores a torn final line from a crash mid-write', () => {
    const full = encodeRecord(rec(5, 250))
    const text = [meta, encodeRecord(rec(4, 240)), full.slice(0, full.length - 7)].join('\n')
    const j = parseJournal(text)
    expect(j.records.map((r) => r.t)).toEqual([4])
    expect(j.skipped).toBe(1)
    expect(j.ended).toBe(false)
  })

  it('de-duplicates records re-sent after a retry', () => {
    const text = [meta, encodeRecord(rec(1, 200)), encodeRecord(rec(0, 190)), encodeRecord(rec(1, 200))].join('\n')
    expect(parseJournal(text).records.map((r) => r.t)).toEqual([0, 1])
  })
})
