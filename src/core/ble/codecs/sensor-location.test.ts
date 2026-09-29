import { describe, expect, it } from 'vitest'
import { CodecError, fromHex } from './bytes'
import { encodeSensorLocation, parseSensorLocation, SENSOR_LOCATIONS } from './sensor-location'

describe('Sensor Location', () => {
  it('lists codes 0-16 in spec order', () => {
    expect(SENSOR_LOCATIONS).toEqual([
      'other', 'topOfShoe', 'inShoe', 'hip', 'frontWheel', 'leftCrank', 'rightCrank', 'leftPedal', 'rightPedal',
      'frontHub', 'rearDropout', 'chainstay', 'rearWheel', 'rearHub', 'chest', 'spider', 'chainRing',
    ])
  })

  it('parses known and reserved codes', () => {
    expect(parseSensorLocation(fromHex('05'))).toBe('leftCrank')
    expect(parseSensorLocation(fromHex('0d'))).toBe('rearHub')
    expect(parseSensorLocation(fromHex('10'))).toBe('chainRing')
    expect(parseSensorLocation(fromHex('11'))).toBe('unknown')
    expect(() => parseSensorLocation(fromHex(''))).toThrow(CodecError)
  })

  it('encodes', () => {
    expect(Array.from(encodeSensorLocation('spider'))).toEqual([15])
  })
})
