import { describe, expect, it } from 'vitest'
import type { RideRecord } from './recorder'
import { column, recordsToStreams, streamsToRecords } from './streams'

const rec = (t: number, over: Partial<RideRecord> = {}): RideRecord => ({
  t, ts: 1_790_000_000_000 + t * 1000, power: 200 + t, cadence: 90, hr: null, speed: 9.5, distance: t * 9.5,
  altitude: null, grade: 1.5, targetW: 210, lrBalance: 49.5, coreTemp: null, skinTemp: null, smo2: null, lap: t > 2 ? 1 : 0,
  rr: t % 2 ? [801.5, 799.5] : [], ...over,
})

describe('ride streams', () => {
  it('round-trips records, preserving null vs zero', () => {
    const records = [rec(0), rec(1, { power: 0 }), rec(2, { power: null }), rec(3), rec(4)]
    const back = streamsToRecords(recordsToStreams('r', records))
    expect(back.map((r) => r.power)).toEqual([200, 0, null, 203, 204])
    expect(back.map((r) => r.hr)).toEqual([null, null, null, null, null])
    expect(back[3]?.rr).toEqual([801.5, 799.5])
    expect(back.map((r) => r.lap)).toEqual([0, 0, 0, 1, 1])
    expect(back[4]?.ts).toBe(records[4]?.ts)
  })

  it('extracts a column for metrics', () => {
    const s = recordsToStreams('r', [rec(0), rec(1, { power: null })])
    expect(column(s, 'power')).toEqual([200, null])
  })
})
