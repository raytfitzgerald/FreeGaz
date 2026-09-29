import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CodecError, fromHex, toDataView, toHex } from './bytes'
import { encodeIndoorBikeData, IndoorBikeDataAssembler, parseIndoorBikeData, type IndoorBikeData } from './ftms-bike-data'

const FC = { seed: 20260929, numRuns: 500 }
const parseHex = (hex: string) => parseIndoorBikeData(fromHex(hex))
const roundTrip = (d: IndoorBikeData) => parseIndoorBikeData(toDataView(encodeIndoorBikeData(d)))

describe('parseIndoorBikeData golden vectors', () => {
  it('speed + cadence + power (flags 0x0044)', () => {
    // Flags 0x0044 carries 3 fields, so the payload is 8 bytes (2 + 3 × 2), not 10.
    const hex =
      '44 00 ' + // flags 0x0044: bit 2 cadence, bit 6 power; bit 0 = 0 so speed is present
      'f6 09 ' + // speed 0x09F6 = 2550 × 0.01 = 25.50 km/h
      'b5 00 ' + // cadence 0x00B5 = 181 × 0.5 = 90.5 rpm
      'fa 00' //    power 0x00FA = 250 W
    const expected = { moreData: false, speedKmh: 25.5, cadenceRpm: 90.5, powerW: 250 }
    expect(parseHex(hex)).toEqual(expected)
    expect(toHex(encodeIndoorBikeData(expected))).toBe(hex)
  })

  it('every field (flags 0x1FFE)', () => {
    const hex =
      'fe 1f ' + //    flags 0x1FFE: bits 1-12; bit 0 = 0 so speed is present
      'c4 09 ' + //    speed 2500 → 25.00 km/h
      '60 09 ' + //    average speed 0x0960 = 2400 → 24.00 km/h
      'b4 00 ' + //    cadence 180 → 90 rpm
      'ab 00 ' + //    average cadence 171 → 85.5 rpm
      '40 e2 01 ' + // total distance uint24 0x01E240 = 123456 m
      '2c 01 ' + //    resistance sint16 0x012C = 300 (15 bytes follow, so 2 are left for it)
      'c8 00 ' + //    power 200 W
      'be 00 ' + //    average power 190 W
      '2c 01 ' + //    total energy 300 kcal
      '58 02 ' + //    energy per hour 600 kcal
      '0a ' + //       energy per minute 10 kcal
      '91 ' + //       heart rate 145 bpm
      '5a ' + //       MET 90 × 0.1 = 9.0
      '08 07 ' + //    elapsed 0x0708 = 1800 s
      '2c 01' //       remaining 300 s
    const expected: IndoorBikeData = {
      moreData: false,
      speedKmh: 25,
      avgSpeedKmh: 24,
      cadenceRpm: 90,
      avgCadenceRpm: 85.5,
      totalDistanceM: 123456,
      resistanceLevel: 300,
      powerW: 200,
      avgPowerW: 190,
      totalEnergyKcal: 300,
      energyPerHourKcal: 600,
      energyPerMinuteKcal: 10,
      heartRateBpm: 145,
      metabolicEquivalent: 9,
      elapsedTimeS: 1800,
      remainingTimeS: 300,
    }
    expect(parseHex(hex)).toEqual(expected)
    expect(toHex(encodeIndoorBikeData(expected))).toBe(hex)
  })

  it('More Data set: no speed field, other fields still in bit order', () => {
    const hex =
      '27 00 ' + // flags 0x0027: bit 0 more data, bit 1 avg speed, bit 2 cadence, bit 5 resistance
      'b8 0b ' + // average speed 0x0BB8 = 3000 → 30.00 km/h
      'aa 00 ' + // cadence 0x00AA = 170 → 85 rpm
      '2a 00' //    resistance sint16 42 (last field, 2 bytes left)
    expect(parseHex(hex)).toEqual({ moreData: true, avgSpeedKmh: 30, cadenceRpm: 85, resistanceLevel: 42 })
  })

  it('signed power', () => {
    // flags 0x0040 (power), speed 0, power 0xFFEC = -20 W
    expect(parseHex('40 00 00 00 ec ff')).toEqual({ moreData: false, speedKmh: 0, powerW: -20 })
  })

  it('ignores reserved flag bits 13-15', () => {
    expect(parseHex('00 e0 d0 07')).toEqual({ moreData: false, speedKmh: 20 })
  })
})

describe('Indoor Bike Data resistance level: sint16 vs uint8 by length', () => {
  // Flags 0x0060: bit 5 resistance, bit 6 power. After the resistance come only
  // the 2 power bytes, so the bytes left for the resistance decide its type.
  it('reads sint16 when exactly 2 bytes are left (FTMS v1.0 layout)', () => {
    // 60 00 flags | d0 07 speed 2000 → 20.00 km/h | fb ff resistance sint16 -5 | 96 00 power 150 W
    expect(parseHex('60 00 d0 07 fb ff 96 00')).toEqual({ moreData: false, speedKmh: 20, resistanceLevel: -5, powerW: 150 })
  })

  it('reads uint8 when exactly 1 byte is left (GSS 2026 layout)', () => {
    // 60 00 flags | d0 07 speed | c8 resistance uint8 200 (as sint16 0x96C8 it would be -26936) | 96 00 power 150 W
    expect(parseHex('60 00 d0 07 c8 96 00')).toEqual({ moreData: false, speedKmh: 20, resistanceLevel: 200, powerW: 150 })
  })

  it('accounts for every fixed-size field after the resistance', () => {
    // Flags 0x0A60: resistance, power (2), heart rate (1), elapsed time (2): 5 bytes follow.
    const record = { moreData: false, speedKmh: 20, resistanceLevel: 12, powerW: 150, heartRateBpm: 140, elapsedTimeS: 3600 }
    // 60 0a | d0 07 | 0c 00 sint16 12 | 96 00 | 8c HR 140 | 10 0e elapsed 3600 s
    expect(parseHex('60 0a d0 07 0c 00 96 00 8c 10 0e')).toEqual(record)
    // Same record with a uint8 resistance: 0c
    expect(parseHex('60 0a d0 07 0c 96 00 8c 10 0e')).toEqual(record)
  })

  it('handles the resistance as the last field', () => {
    expect(parseHex('20 00 d0 07 2a')).toEqual({ moreData: false, speedKmh: 20, resistanceLevel: 42 }) // uint8
    expect(parseHex('20 00 d0 07 2a 00')).toEqual({ moreData: false, speedKmh: 20, resistanceLevel: 42 }) // sint16
  })

  it('prefers sint16 when trailing bytes make both readings possible', () => {
    // 3 bytes left for a 2-byte field plus one trailing 0xEE: sint16, junk ignored.
    expect(parseHex('60 00 d0 07 fb ff 96 00 ee')).toEqual({ moreData: false, speedKmh: 20, resistanceLevel: -5, powerW: 150 })
  })

  it('documents the one ambiguity: an sint16 payload one byte short reads as the uint8 layout', () => {
    // 60 00 d0 07 fb ff 96 (00 missing): 1 byte left → uint8 0xFB, then power from "ff 96".
    expect(parseHex('60 00 d0 07 fb ff 96')).toEqual({ moreData: false, speedKmh: 20, resistanceLevel: 251, powerW: -26881 })
    // Two bytes short can no longer hold the power field and throws.
    expect(() => parseHex('60 00 d0 07 fb ff')).toThrow(CodecError)
  })

  it('always encodes sint16', () => {
    expect(toHex(encodeIndoorBikeData({ moreData: false, speedKmh: 20, resistanceLevel: 200, powerW: 150 }))).toBe(
      '60 00 d0 07 c8 00 96 00',
    )
  })
})

describe('Indoor Bike Data expended energy', () => {
  it('omits fields the trainer marks "not available" (0xFFFF / 0xFF)', () => {
    const hex =
      '00 03 ' + // flags 0x0300: bit 8 expended energy, bit 9 heart rate
      '00 00 ' + // speed 0
      'ff ff ' + // total energy 0xFFFF → not available
      '5e 01 ' + // energy per hour 0x015E = 350 kcal
      'ff ' + //    energy per minute 0xFF → not available
      '8e' //       heart rate 142 bpm
    const expected = { moreData: false, speedKmh: 0, energyPerHourKcal: 350, heartRateBpm: 142 }
    expect(parseHex(hex)).toEqual(expected)
    // The encoder writes the sentinels back for the missing two.
    expect(toHex(encodeIndoorBikeData(expected))).toBe(hex)
  })

  it('reads all three when available', () => {
    // 00 01 flags (energy) | 00 00 speed | d2 04 total 1234 | 58 02 per hour 600 | 0a per minute 10
    expect(parseHex('00 01 00 00 d2 04 58 02 0a')).toEqual({
      moreData: false,
      speedKmh: 0,
      totalEnergyKcal: 1234,
      energyPerHourKcal: 600,
      energyPerMinuteKcal: 10,
    })
  })

  it('keeps real values below the sentinels when encoding', () => {
    const bytes = encodeIndoorBikeData({ moreData: false, speedKmh: 0, totalEnergyKcal: 70000, energyPerMinuteKcal: 300 })
    // total clamps to 0xFFFE (not 0xFFFF), per hour is not available, per minute clamps to 0xFE
    expect(toHex(bytes)).toBe('00 01 00 00 fe ff ff ff fe')
    expect(parseIndoorBikeData(toDataView(bytes))).toEqual({
      moreData: false,
      speedKmh: 0,
      totalEnergyKcal: 65534,
      energyPerMinuteKcal: 254,
    })
  })
})

describe('encodeIndoorBikeData', () => {
  it('rounds to each resolution and clamps to each range', () => {
    const bytes = encodeIndoorBikeData({ moreData: false, speedKmh: 25.456, cadenceRpm: 90.3, powerW: 40000, metabolicEquivalent: 9.96 })
    // speed 2545.6 → 2546 (f2 09), cadence 180.6 → 181 (b5 00), power clamps to 32767 (ff 7f), MET 99.6 → 100 (64)
    expect(toHex(bytes)).toBe('44 04 f2 09 b5 00 ff 7f 64')
  })

  it('rejects speed in a moreData part and a final part without speed', () => {
    expect(() => encodeIndoorBikeData({ moreData: true, speedKmh: 20 })).toThrow(CodecError)
    expect(() => encodeIndoorBikeData({ moreData: false, powerW: 100 })).toThrow(CodecError)
  })

  it('rejects non-finite values', () => {
    expect(() => encodeIndoorBikeData({ moreData: false, speedKmh: 20, powerW: Number.NaN })).toThrow('powerW: cannot encode NaN')
  })
})

describe('Indoor Bike Data truncation', () => {
  it('throws CodecError one byte short of any layout without a resistance field', () => {
    for (const hex of ['44 00 f6 09 b5 00 fa 00', '00 03 00 00 ff ff 5e 01 ff 8e', '27 00 b8 0b aa 00 2a 00', '40 00 00 00 ec ff']) {
      const bytes = fromHex(hex)
      const short = new DataView(bytes.buffer, 0, bytes.byteLength - 1)
      if (hex.startsWith('27')) {
        // Resistance is the last field here, so one byte short is the valid uint8 layout.
        expect(parseIndoorBikeData(short).resistanceLevel).toBe(42)
        continue
      }
      expect(() => parseIndoorBikeData(short)).toThrow(CodecError)
    }
  })

  it('throws on an empty payload or flags alone when speed is due', () => {
    expect(() => parseHex('')).toThrow(CodecError)
    expect(() => parseHex('00')).toThrow(CodecError)
    expect(() => parseHex('00 00')).toThrow(CodecError)
    expect(parseHex('01 00')).toEqual({ moreData: true }) // More Data with no fields is complete
  })
})

// Generators build every value from its raw wire integer, so encode → parse
// must reproduce it exactly.
const opt = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: undefined })
const u = (max: number, scale = 1) => fc.integer({ min: 0, max }).map((v) => v / scale)
const s16 = fc.integer({ min: -0x8000, max: 0x7fff })

const bikeData: fc.Arbitrary<IndoorBikeData> = fc
  .record({
    moreData: fc.boolean(),
    speed: u(0xffff, 100),
    avgSpeedKmh: opt(u(0xffff, 100)),
    cadenceRpm: opt(u(0xffff, 2)),
    avgCadenceRpm: opt(u(0xffff, 2)),
    totalDistanceM: opt(u(0xffffff)),
    resistanceLevel: opt(s16),
    powerW: opt(s16),
    avgPowerW: opt(s16),
    totalEnergyKcal: opt(u(0xfffe)),
    energyPerHourKcal: opt(u(0xfffe)),
    energyPerMinuteKcal: opt(u(0xfe)),
    heartRateBpm: opt(u(0xff)),
    metabolicEquivalent: opt(u(0xff, 10)),
    elapsedTimeS: opt(u(0xffff)),
    remainingTimeS: opt(u(0xffff)),
  })
  .map(({ speed, ...rest }) => ({ ...rest, speedKmh: rest.moreData ? undefined : speed }))

describe('Indoor Bike Data properties', () => {
  it('encode → parse is the identity for any valid record', () => {
    fc.assert(
      fc.property(bikeData, (d) => {
        expect(roundTrip(d)).toEqual(d)
      }),
      FC,
    )
  })

  it('encode → parse stays within half a resolution step for arbitrary values', () => {
    const dbl = (min: number, max: number) => fc.double({ min, max, noNaN: true })
    fc.assert(
      fc.property(dbl(0, 655.35), dbl(0, 32767), dbl(-32768, 32767), dbl(0, 25.5), (speed, cadence, power, met) => {
        const back = roundTrip({ moreData: false, speedKmh: speed, cadenceRpm: cadence, powerW: power, metabolicEquivalent: met })
        expect(Math.abs((back.speedKmh ?? NaN) - speed)).toBeLessThanOrEqual(0.005 + 1e-9)
        expect(Math.abs((back.cadenceRpm ?? NaN) - cadence)).toBeLessThanOrEqual(0.25 + 1e-9)
        expect(Math.abs((back.powerW ?? NaN) - power)).toBeLessThanOrEqual(0.5)
        expect(Math.abs((back.metabolicEquivalent ?? NaN) - met)).toBeLessThanOrEqual(0.05 + 1e-9)
      }),
      FC,
    )
  })

  it('a record split over two notifications reassembles to the original', () => {
    const split = fc.tuple(
      bikeData.filter((d) => !d.moreData),
      fc.array(fc.boolean(), { minLength: 15, maxLength: 15 }),
    )
    fc.assert(
      fc.property(split, ([record, toFirst]) => {
        // Every field except speed goes to the first (moreData) part or the final part.
        const first: IndoorBikeData = { moreData: true }
        const last: IndoorBikeData = { moreData: false, speedKmh: record.speedKmh }
        FIELDS.forEach((key, i) => {
          const value = record[key]
          if (value === undefined) return
          if (toFirst[i]) first[key] = value
          else last[key] = value
        })
        const asm = new IndoorBikeDataAssembler()
        expect(asm.push(roundTrip(first))).toBeNull()
        expect(asm.push(roundTrip(last))).toEqual(record)
      }),
      FC,
    )
  })
})

const FIELDS = [
  'avgSpeedKmh',
  'cadenceRpm',
  'avgCadenceRpm',
  'totalDistanceM',
  'resistanceLevel',
  'powerW',
  'avgPowerW',
  'totalEnergyKcal',
  'energyPerHourKcal',
  'energyPerMinuteKcal',
  'heartRateBpm',
  'metabolicEquivalent',
  'elapsedTimeS',
  'remainingTimeS',
] as const

describe('IndoorBikeDataAssembler', () => {
  const partA = parseHex('27 00 b8 0b aa 00 2a 00') // moreData: avg speed 30, cadence 85, resistance 42
  const partB = parseHex('40 08 8a 0c b4 00 10 0e') // final: speed 32.10, power 180, elapsed 3600 s

  it('passes single-notification records straight through', () => {
    const asm = new IndoorBikeDataAssembler()
    expect(asm.push(partB)).toEqual({ moreData: false, speedKmh: 32.1, powerW: 180, elapsedTimeS: 3600 })
  })

  it('merges a split record when the final part arrives', () => {
    const asm = new IndoorBikeDataAssembler()
    expect(asm.push(partA)).toBeNull()
    expect(asm.push(partB)).toEqual({
      moreData: false,
      speedKmh: 32.1,
      avgSpeedKmh: 30,
      cadenceRpm: 85,
      resistanceLevel: 42,
      powerW: 180,
      elapsedTimeS: 3600,
    })
    // Nothing is left pending afterwards.
    expect(asm.push(partB)).toEqual({ moreData: false, speedKmh: 32.1, powerW: 180, elapsedTimeS: 3600 })
  })

  it('lets later parts win when they repeat a field', () => {
    const asm = new IndoorBikeDataAssembler()
    asm.push({ moreData: true, powerW: 100 })
    expect(asm.push({ moreData: false, speedKmh: 30, powerW: 120 })).toEqual({ moreData: false, speedKmh: 30, powerW: 120 })
  })

  it('keeps accumulating when every part repeats the same elapsed time', () => {
    const asm = new IndoorBikeDataAssembler()
    expect(asm.push({ moreData: true, elapsedTimeS: 60, cadenceRpm: 90 })).toBeNull()
    expect(asm.push({ moreData: true, elapsedTimeS: 60, powerW: 250 })).toBeNull()
    expect(asm.push({ moreData: false, elapsedTimeS: 60, speedKmh: 33 })).toEqual({
      moreData: false,
      elapsedTimeS: 60,
      cadenceRpm: 90,
      powerW: 250,
      speedKmh: 33,
    })
  })

  it('flushes the pending parts when a new record starts before the old one finished', () => {
    const asm = new IndoorBikeDataAssembler()
    expect(asm.push({ moreData: true, cadenceRpm: 85, powerW: 200 })).toBeNull()
    // The final part was lost; the next record's first part repeats cadence.
    expect(asm.push({ moreData: true, cadenceRpm: 86, powerW: 205 })).toEqual({ moreData: false, cadenceRpm: 85, powerW: 200 })
    expect(asm.push({ moreData: false, speedKmh: 31 })).toEqual({ moreData: false, cadenceRpm: 86, powerW: 205, speedKmh: 31 })
  })

  it('keeps data flowing from a trainer that sets More Data on every notification', () => {
    const asm = new IndoorBikeDataAssembler()
    const out = [100, 110, 120, 130].map((powerW) => asm.push({ moreData: true, powerW }))
    expect(out).toEqual([null, { moreData: false, powerW: 100 }, { moreData: false, powerW: 110 }, { moreData: false, powerW: 120 }])
  })

  it('treats a changed elapsed time as a new record', () => {
    const asm = new IndoorBikeDataAssembler()
    asm.push({ moreData: true, elapsedTimeS: 60, cadenceRpm: 90 })
    expect(asm.push({ moreData: true, elapsedTimeS: 61, powerW: 250 })).toEqual({ moreData: false, elapsedTimeS: 60, cadenceRpm: 90 })
  })

  it('reset() drops a partial record', () => {
    const asm = new IndoorBikeDataAssembler()
    asm.push(partA)
    asm.reset()
    expect(asm.push(partB)).toEqual({ moreData: false, speedKmh: 32.1, powerW: 180, elapsedTimeS: 3600 })
  })
})
