import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CodecError, fromHex, toDataView, toHex } from './bytes'
import {
  encodeCyclingPowerFeature,
  encodeCyclingPowerMeasurement,
  parseCyclingPowerFeature,
  parseCyclingPowerMeasurement,
  type CyclingPowerMeasurement,
} from './cps'

const FC = { seed: 20260929, numRuns: 500 }
const cp = (hex: string) => parseCyclingPowerMeasurement(fromHex(hex))

describe('parseCyclingPowerMeasurement golden vectors', () => {
  it('pedal balance + crank revolution data', () => {
    const hex =
      '23 00 ' + // flags 0x0023: bit 0 balance present, bit 1 balance reference = left, bit 5 crank data
      'f5 00 ' + // power 0x00F5 = 245 W
      '68 ' + //    balance 0x68 = 104 × 0.5 = 52.0 %
      'd2 04 ' + // crank revolutions 0x04D2 = 1234
      '6e b2' //    last crank event time 0xB26E = 45678 (1/1024 s)
    const expected = { powerW: 245, pedalBalancePct: 52, pedalBalanceRefLeft: true, crankRevs: 1234, crankEventTime: 45678 }
    expect(cp(hex)).toEqual(expected)
    expect(toHex(encodeCyclingPowerMeasurement(expected))).toBe(hex)
  })

  it('every optional field (flags 0x1FFF)', () => {
    const hex =
      'ff 1f ' + //       flags 0x1FFF: bits 0-12
      '2c 01 ' + //       power 300 W
      '63 ' + //          balance 99 × 0.5 = 49.5 % (bit 1: left)
      '70 0f ' + //       accumulated torque 0x0F70 = 3952 / 32 = 123.5 N·m (bit 3: crank based)
      'a0 86 01 00 ' + // wheel revolutions 0x000186A0 = 100000
      '00 08 ' + //       last wheel event time 0x0800 = 2048 (1 s at 2048 Hz)
      'ff ff ' + //       crank revolutions 65535
      '00 04 ' + //       last crank event time 0x0400 = 1024 (1 s at 1024 Hz)
      'f4 01 ' + //       max force 500 N
      '88 ff ' + //       min force 0xFF88 = -120 N
      '10 05 ' + //       max torque 0x0510 = 1296 / 32 = 40.5 N·m
      'b8 ff ' + //       min torque 0xFFB8 = -72 / 32 = -2.25 N·m
      'bc 3a 12 ' + //    extreme angles uint24 0x123ABC: max = 0xABC = 2748°, min = 0x123 = 291° (the GSS example)
      '5e 01 ' + //       top dead spot 350°
      'aa 00 ' + //       bottom dead spot 170°
      'e7 03' //          accumulated energy 999 kJ; bit 12: offset compensation
    const expected: CyclingPowerMeasurement = {
      powerW: 300,
      pedalBalancePct: 49.5,
      pedalBalanceRefLeft: true,
      accumulatedTorqueNm: 123.5,
      torqueSourceCrank: true,
      wheelRevs: 100000,
      wheelEventTime: 2048,
      crankRevs: 65535,
      crankEventTime: 1024,
      maxForceN: 500,
      minForceN: -120,
      maxTorqueNm: 40.5,
      minTorqueNm: -2.25,
      maxAngleDeg: 2748,
      minAngleDeg: 291,
      topDeadSpotDeg: 350,
      bottomDeadSpotDeg: 170,
      accumulatedEnergyKj: 999,
      offsetCompensation: true,
    }
    expect(cp(hex)).toEqual(expected)
    expect(toHex(encodeCyclingPowerMeasurement(expected))).toBe(hex)
  })

  it('power only, including negative power', () => {
    expect(cp('00 00 64 00')).toEqual({ powerW: 100 })
    expect(cp('00 00 f6 ff')).toEqual({ powerW: -10 })
  })

  it('balance with an unknown reference side', () => {
    expect(cp('01 00 64 00 64')).toEqual({ powerW: 100, pedalBalancePct: 50, pedalBalanceRefLeft: false })
  })

  it('wheel revolution data at 2048 Hz', () => {
    // 10 00 flags bit 4 | c8 00 200 W | 10 27 00 00 revs 10000 | 00 10 time 4096 (2 s)
    expect(cp('10 00 c8 00 10 27 00 00 00 10')).toEqual({ powerW: 200, wheelRevs: 10000, wheelEventTime: 4096 })
  })

  it('ignores reserved bits and reference bits whose field is absent', () => {
    expect(cp('00 e0 64 00')).toEqual({ powerW: 100 }) // bits 13-15
    expect(cp('0a 00 64 00')).toEqual({ powerW: 100 }) // bits 1 and 3 without balance/torque
  })

  it('throws when truncated', () => {
    expect(() => cp('23 00 f5 00 68 d2 04 6e')).toThrow(CodecError)
    expect(() => cp('00 00 64')).toThrow(CodecError)
    expect(() => cp('00 01 64 00 bc 3a')).toThrow(CodecError) // extreme angles need 3 bytes
    expect(() => cp('00')).toThrow(CodecError)
  })
})

describe('encodeCyclingPowerMeasurement', () => {
  it('requires paired fields together', () => {
    expect(() => encodeCyclingPowerMeasurement({ powerW: 1, wheelRevs: 5 })).toThrow(CodecError)
    expect(() => encodeCyclingPowerMeasurement({ powerW: 1, crankEventTime: 5 })).toThrow(CodecError)
    expect(() => encodeCyclingPowerMeasurement({ powerW: 1, maxForceN: 5 })).toThrow(CodecError)
  })

  it('wraps rolling counters and clamps the rest', () => {
    const bytes = encodeCyclingPowerMeasurement({
      powerW: 40000, // clamps to 32767
      crankRevs: 65536 + 3, // wraps to 3
      crankEventTime: 70000, // wraps to 4464 = 0x1170
      maxAngleDeg: 5000, // clamps to 4095
      minAngleDeg: 0,
    })
    expect(toHex(bytes)).toBe('20 01 ff 7f 03 00 70 11 ff 0f 00')
  })

  it('omits the reference bits without their fields', () => {
    expect(toHex(encodeCyclingPowerMeasurement({ powerW: 100, pedalBalanceRefLeft: true, torqueSourceCrank: true }))).toBe('00 00 64 00')
  })
})

const opt = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: undefined })
const int = (min: number, max: number, scale = 1) => fc.integer({ min, max }).map((v) => v / scale)
const both = (a: fc.Arbitrary<number>, b: fc.Arbitrary<number>) => opt(fc.tuple(a, b))
// fc.integer stops at 2^31 - 1, so build uint32 values from two halves.
const u32 = fc.tuple(int(0, 0xffff), int(0, 0xffff)).map(([hi, lo]) => hi * 0x10000 + lo)

const measurement: fc.Arbitrary<CyclingPowerMeasurement> = fc
  .record({
    powerW: int(-0x8000, 0x7fff),
    balance: opt(fc.tuple(int(0, 0xff, 2), fc.boolean())),
    torque: opt(fc.tuple(int(0, 0xffff, 32), fc.boolean())),
    wheel: both(u32, int(0, 0xffff)),
    crank: both(int(0, 0xffff), int(0, 0xffff)),
    force: both(int(-0x8000, 0x7fff), int(-0x8000, 0x7fff)),
    torques: both(int(-0x8000, 0x7fff, 32), int(-0x8000, 0x7fff, 32)),
    angles: both(int(0, 0xfff), int(0, 0xfff)),
    topDeadSpotDeg: opt(int(0, 0xffff)),
    bottomDeadSpotDeg: opt(int(0, 0xffff)),
    accumulatedEnergyKj: opt(int(0, 0xffff)),
    offsetCompensation: opt(fc.constant(true)),
  })
  .map(({ balance, torque, wheel, crank, force, torques, angles, ...rest }) => ({
    ...rest,
    pedalBalancePct: balance?.[0],
    pedalBalanceRefLeft: balance?.[1],
    accumulatedTorqueNm: torque?.[0],
    torqueSourceCrank: torque?.[1],
    wheelRevs: wheel?.[0],
    wheelEventTime: wheel?.[1],
    crankRevs: crank?.[0],
    crankEventTime: crank?.[1],
    maxForceN: force?.[0],
    minForceN: force?.[1],
    maxTorqueNm: torques?.[0],
    minTorqueNm: torques?.[1],
    maxAngleDeg: angles?.[0],
    minAngleDeg: angles?.[1],
  }))

describe('Cycling Power Measurement properties', () => {
  it('encode → parse is the identity for any valid measurement', () => {
    fc.assert(
      fc.property(measurement, (m) => {
        expect(parseCyclingPowerMeasurement(toDataView(encodeCyclingPowerMeasurement(m)))).toEqual(m)
      }),
      FC,
    )
  })
})

describe('Cycling Power Feature', () => {
  it('parses the defined bits', () => {
    // 0x00110A0F: bits 0-3 (balance, torque, wheel, crank), 9 offset compensation,
    // 11 multiple sensor locations, 16 torque-based context, 20-21 = 0b01 (not for distributed use)
    const f = parseCyclingPowerFeature(fromHex('0f 0a 11 00'))
    expect(f).toMatchObject({
      raw: 0x00110a0f,
      pedalPowerBalance: true,
      accumulatedTorque: true,
      wheelRevolutionData: true,
      crankRevolutionData: true,
      extremeMagnitudes: false,
      offsetCompensationIndicator: false,
      offsetCompensation: true,
      measurementContentMasking: false,
      multipleSensorLocations: true,
      torqueBasedContext: true,
      enhancedOffsetCompensation: false,
      distributedSystem: 'notDistributed',
    })
  })

  it('maps each bit 0-19 to its spec name', () => {
    const order = [
      'pedalPowerBalance', 'accumulatedTorque', 'wheelRevolutionData', 'crankRevolutionData', 'extremeMagnitudes',
      'extremeAngles', 'deadSpotAngles', 'accumulatedEnergy', 'offsetCompensationIndicator', 'offsetCompensation',
      'measurementContentMasking', 'multipleSensorLocations', 'crankLengthAdjustment', 'chainLengthAdjustment',
      'chainWeightAdjustment', 'spanLengthAdjustment', 'torqueBasedContext', 'instantaneousMeasurementDirection',
      'factoryCalibrationDate', 'enhancedOffsetCompensation',
    ]
    order.forEach((name, bit) => {
      const f = parseCyclingPowerFeature(toDataView(encodeCyclingPowerFeature({ raw: 2 ** bit })))
      const on = Object.entries(f).filter(([, v]) => v === true).map(([k]) => k)
      expect(on).toEqual([name])
    })
  })

  it('decodes the distributed-system field (bits 20-21)', () => {
    expect(parseCyclingPowerFeature(fromHex('00 00 00 00')).distributedSystem).toBe('unspecified')
    expect(parseCyclingPowerFeature(fromHex('00 00 20 00')).distributedSystem).toBe('distributed')
    expect(parseCyclingPowerFeature(fromHex('00 00 30 00')).distributedSystem).toBe('reserved')
  })

  it('encodes named flags and the distributed-system field', () => {
    expect(toHex(encodeCyclingPowerFeature({ wheelRevolutionData: true, crankRevolutionData: true }))).toBe('0c 00 00 00')
    expect(toHex(encodeCyclingPowerFeature({ crankRevolutionData: true, distributedSystem: 'distributed' }))).toBe('08 00 20 00')
  })

  it('encode(parse(x)) reproduces any 4-byte value', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 4, maxLength: 4 }), (bytes) => {
        expect(Array.from(encodeCyclingPowerFeature(parseCyclingPowerFeature(toDataView(bytes))))).toEqual(Array.from(bytes))
      }),
      FC,
    )
  })

  it('throws when truncated', () => {
    expect(() => parseCyclingPowerFeature(fromHex('0f 0a 11'))).toThrow(CodecError)
  })
})
