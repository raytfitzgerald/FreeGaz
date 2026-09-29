import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import * as codecs from './index'
import { CodecError, fromHex, toDataView } from './index'

const FC = { seed: 20260929, numRuns: 300 }

describe('codecs barrel', () => {
  it('exports exactly this runtime API', () => {
    expect(Object.keys(codecs).sort()).toEqual(
      [
        // bytes
        'ByteReader', 'ByteWriter', 'CodecError', 'clampInt', 'fromHex', 'roundTo', 'toDataView', 'toHex', 'wrapInt',
        // FTMS
        'FtmsOp', 'FtmsResult', 'IndoorBikeDataAssembler', 'TRAINING_STATUS_LABELS', 'decodeFtmsCommand', 'encodeFtmsCommand',
        'encodeFtmsFeatures', 'encodeFtmsResponse', 'encodeFtmsStatus', 'encodeIndoorBikeData', 'encodeSupportedPowerRange',
        'encodeSupportedResistanceRange', 'encodeTrainingStatus', 'parseFtmsFeatures', 'parseFtmsResponse', 'parseFtmsStatus',
        'parseIndoorBikeData', 'parseSupportedPowerRange', 'parseSupportedResistanceRange', 'parseTrainingStatus',
        // HRS
        'BODY_SENSOR_LOCATIONS', 'encodeBodySensorLocation', 'encodeHeartRateMeasurement', 'parseBodySensorLocation',
        'parseHeartRateMeasurement',
        // CPS, CSC, Sensor Location
        'encodeCscFeature', 'encodeCscMeasurement', 'encodeCyclingPowerFeature', 'encodeCyclingPowerMeasurement',
        'parseCscFeature', 'parseCscMeasurement', 'parseCyclingPowerFeature', 'parseCyclingPowerMeasurement',
        'SENSOR_LOCATIONS', 'encodeSensorLocation', 'parseSensorLocation',
        // revolutions
        'RevolutionRateCalculator', 'wheelSpeedMps',
        // Wahoo, Headwind
        'WahooOp', 'decodeWahooCommand', 'encodeWahooCommand', 'encodeWahooResponse', 'parseWahooResponse',
        'HEADWIND_MODES', 'decodeHeadwindCommand', 'encodeHeadwindEvent', 'encodeHeadwindSetMode', 'encodeHeadwindSetSpeed',
        'parseHeadwindEvent',
        // CORE, Moxy, DIS
        'encodeCoreTemp', 'parseCoreTemp', 'encodeMoxy', 'parseMoxy',
        'decodeUtf8String', 'encodeBatteryLevel', 'encodeUtf8String', 'parseBatteryLevel',
      ].sort(),
    )
  })
})

type Parser = (dv: DataView) => unknown

/**
 * One well-formed payload per parser, chosen so that dropping its last byte
 * cannot leave another valid layout. (Payloads where it can, by design, are
 * tested in their own files: RR lists, strings, response parameters, and
 * resistance fields whose 1-byte form is legal.)
 */
const GOLDEN: [name: string, parse: Parser, hex: string][] = [
  ['parseIndoorBikeData', codecs.parseIndoorBikeData, '44 00 f6 09 b5 00 fa 00'],
  ['parseFtmsFeatures', codecs.parseFtmsFeatures, '82 44 00 00 0c e0 00 00'],
  ['parseSupportedPowerRange', codecs.parseSupportedPowerRange, '19 00 c4 09 05 00'],
  ['parseSupportedResistanceRange (6 bytes)', codecs.parseSupportedResistanceRange, '00 00 e8 03 0a 00'],
  ['parseSupportedResistanceRange (3 bytes)', codecs.parseSupportedResistanceRange, '00 c8 05'],
  ['decodeFtmsCommand', codecs.decodeFtmsCommand, '11 00 00 0d 02 28 33'],
  ['parseFtmsResponse', codecs.parseFtmsResponse, '80 05 01'],
  ['parseFtmsStatus', codecs.parseFtmsStatus, '12 00 00 0d 02 28 33'],
  ['parseTrainingStatus', codecs.parseTrainingStatus, '00 01'],
  ['parseHeartRateMeasurement', codecs.parseHeartRateMeasurement, '1e 41 d2 04 00 04 20 03 84 03'],
  ['parseBodySensorLocation', codecs.parseBodySensorLocation, '01'],
  ['parseCyclingPowerMeasurement', codecs.parseCyclingPowerMeasurement, '23 00 f5 00 68 d2 04 6e b2'],
  ['parseCyclingPowerFeature', codecs.parseCyclingPowerFeature, '0f 0a 11 00'],
  ['parseCscMeasurement', codecs.parseCscMeasurement, '03 45 23 01 00 34 12 03 02 ff ff'],
  ['parseCscFeature', codecs.parseCscFeature, '07 00'],
  ['parseSensorLocation', codecs.parseSensorLocation, '05'],
  ['decodeWahooCommand', codecs.decodeWahooCommand, '43 34 21 28 00 fe 01'],
  ['parseWahooResponse', codecs.parseWahooResponse, '01 42'],
  ['parseHeadwindEvent', codecs.parseHeadwindEvent, 'fd 01 19 04'],
  ['decodeHeadwindCommand', codecs.decodeHeadwindCommand, '04 04'],
  ['parseCoreTemp', codecs.parseCoreTemp, '37 19 0f a4 0d 2f 00 11 00 27'],
  ['parseMoxy', codecs.parseMoxy, '2a 00 8d 02 89 02 d2 04'],
  ['parseBatteryLevel', codecs.parseBatteryLevel, '55'],
]

describe('every parser length-checks', () => {
  it.each(GOLDEN)('%s: accepts the golden payload and throws CodecError one byte short', (_name, parse, hex) => {
    const bytes = fromHex(hex)
    expect(() => parse(bytes)).not.toThrow()
    const short = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength - 1)
    expect(() => parse(short)).toThrow(CodecError)
  })

  const ALL: Parser[] = [...GOLDEN.map(([, parse]) => parse), codecs.decodeUtf8String]

  it('random bytes either parse or throw CodecError, never anything else', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 40 }), fc.integer({ min: 0, max: ALL.length - 1 }), (bytes, i) => {
        const parse = ALL[i]
        if (!parse) return
        try {
          parse(toDataView(bytes))
        } catch (e) {
          expect(e).toBeInstanceOf(CodecError)
        }
      }),
      { ...FC, numRuns: 5000 },
    )
  })
})
