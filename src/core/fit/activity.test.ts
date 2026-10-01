// Validates our FIT output with Garmin's official decoder (devDependency only).
import { Decoder, Stream } from '@garmin/fitsdk'
import { describe, expect, it } from 'vitest'
import type { RideRecord } from '../ride/recorder'
import { encodeFitActivity, type FitActivityInput } from './activity'

const T0 = Date.UTC(2026, 8, 29, 13, 0, 0)

function ride(): { records: RideRecord[]; input: FitActivityInput } {
  const records: RideRecord[] = []
  let ts = T0
  let dist = 0
  for (let t = 0; t < 600; t++) {
    if (t === 300) ts += 45_000 // a 45 s pause mid-ride
    ts += 1000
    const power = t % 60 < 30 ? 300 : 150
    dist += 9
    records.push({
      t, ts, power: t === 100 ? null : power, cadence: 90, hr: 120 + Math.floor(t / 20), speed: 9, distance: dist,
      altitude: null, grade: t > 400 ? 2.5 : null, targetW: power, lrBalance: t % 2 ? 48 : null, coreTemp: 37.4, skinTemp: null,
      smo2: null, lap: t < 300 ? 0 : 1, rr: [],
    })
  }
  const powers = records.map((r) => r.power).filter((p): p is number => p !== null)
  const avg = powers.reduce((a, b) => a + b, 0) / powers.length
  const input: FitActivityInput = {
    records,
    laps: [
      { startIndex: 0, endIndex: 299, avgPower: 225, maxPower: 300, np: 240, avgHr: 127, maxHr: 134, avgCadence: 90, maxCadence: 90, distanceM: 2700, kj: 67.5 },
      { startIndex: 300, endIndex: 599, avgPower: 225, maxPower: 300, np: 240, avgHr: 142, maxHr: 149, avgCadence: 90, maxCadence: 90, distanceM: 2700, kj: 67.5 },
    ],
    session: {
      avgPower: avg, maxPower: 300, np: 240.4, tss: 15.2, intensityFactor: 0.962, kj: 134.7, avgHr: 135, maxHr: 149,
      avgCadence: 90, maxCadence: 90, avgSpeed: 9, maxSpeed: 9, totalAscentM: null, thresholdPowerW: 250,
    },
    utcOffsetMin: -420,
    softwareVersion: 10,
    serialNumber: 123456,
  }
  return { records, input }
}

function decode(bytes: Uint8Array) {
  const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)))
  expect(decoder.isFIT()).toBe(true)
  expect(decoder.checkIntegrity()).toBe(true)
  const { messages, errors } = decoder.read()
  expect(errors).toEqual([])
  return messages
}

describe('FIT activity encoder', () => {
  it('produces a file that passes the official integrity check', () => {
    const { input } = ride()
    decode(encodeFitActivity(input))
  })

  it('contains one record per moving second with correct values', () => {
    const { records, input } = ride()
    const m = decode(encodeFitActivity(input))
    const recs = m.recordMesgs!
    expect(recs).toHaveLength(records.length)
    expect(recs[0]!.power).toBe(300)
    expect(recs[100]!.power).toBeUndefined() // missing stays missing
    expect(recs[599]!.heartRate).toBe(149)
    expect((recs[599]!.timestamp as Date).getTime()).toBe(records[599]!.ts)
    expect(recs[10]!.coreTemperature).toBeCloseTo(37.4, 1)
  })

  it('writes cycling / virtual_activity session with summary metrics and laps', () => {
    const { input } = ride()
    const m = decode(encodeFitActivity(input))
    const session = m.sessionMesgs![0]!
    expect(session.sport).toBe('cycling')
    expect(session.subSport).toBe('virtualActivity')
    expect(session.totalTimerTime).toBe(600)
    expect(session.totalElapsedTime).toBe(645)
    expect(session.normalizedPower).toBe(240)
    expect(session.thresholdPower).toBe(250)
    expect(m.lapMesgs).toHaveLength(2)
    expect(m.activityMesgs).toHaveLength(1)
    expect(m.fileIdMesgs![0]!.type).toBe('activity')
  })

  it('brackets the pause with timer stop/start events', () => {
    const { input } = ride()
    const m = decode(encodeFitActivity(input))
    const timer = m.eventMesgs!.filter((e) => e.event === 'timer').map((e) => e.eventType)
    expect(timer).toEqual(['start', 'stopAll', 'start', 'stopAll'])
  })

  it('carries FreeGaz developer fields (target power, trainer grade)', () => {
    const { input } = ride()
    const m = decode(encodeFitActivity(input))
    expect(m.fieldDescriptionMesgs!.map((f) => f.fieldName)).toEqual(['target_power', 'trainer_grade', 'w_prime_balance'])
    const dev = m.recordMesgs![450]!.developerFields as Record<number, number>
    expect(Object.values(dev)).toEqual(expect.arrayContaining([150]))
  })

  it('writes GPS positions where the ride has them, and none where it does not', () => {
    const { input } = ride()
    const records = input.records.map((r, i) => (i < 300 ? { ...r, lat: 48.8583701 + i * 1e-5, lon: 2.2944813 } : r))
    const m = decode(encodeFitActivity({ ...input, records }))
    const recs = m.recordMesgs!
    const deg = (semi: unknown) => ((semi as number) * 180) / 2 ** 31
    expect(deg(recs[0]!.positionLat)).toBeCloseTo(48.8583701, 6)
    expect(deg(recs[0]!.positionLong)).toBeCloseTo(2.2944813, 6)
    expect(deg(recs[299]!.positionLat)).toBeCloseTo(48.8583701 + 299e-5, 6)
    expect(recs[300]!.positionLat).toBeUndefined()
    expect(recs).toHaveLength(600)
  })

  it('rejects an empty ride', () => {
    const { input } = ride()
    expect(() => encodeFitActivity({ ...input, records: [] })).toThrow()
  })
})
