import { describe, expect, it } from 'vitest'
import {
  displayWeightKg,
  formatElevation,
  formatGapDistance,
  formatLongDistance,
  formatSpan,
  formatSpeedKmh,
  formatSpeedMps,
  formatTempC,
  formatWeight,
  scaleSteps,
  speedUnit,
  storedSpeedKmh,
  storedWeightKg,
  tempUnit,
} from './units'

describe('display units', () => {
  it('leaves metric numbers alone and names their units', () => {
    expect(formatSpeedKmh(32.4, 'metric')).toBe('32.4')
    expect(formatSpeedMps(10, 'metric')).toBe('36')
    expect(formatLongDistance(12_400, 'metric')).toBe('12.4')
    expect(formatSpan(250, 'metric')).toBe('250 m')
    expect(formatSpan(1500, 'metric')).toBe('1.5 km')
    expect(formatGapDistance(-1200, 'metric')).toBe('−1.2 km')
    expect(formatGapDistance(85, 'metric')).toBe('+85 m')
    expect(formatElevation(40, 'metric')).toBe('40 m')
    expect(formatWeight(75, 'metric')).toBe('75')
    expect(formatTempC(38.6, 'metric')).toBe('38.6')
    expect(speedUnit('metric')).toBe('km/h')
    expect(tempUnit('metric')).toBe('°C')
  })

  it('converts to miles, feet, pounds and fahrenheit', () => {
    expect(formatSpeedKmh(32.4, 'imperial')).toBe('20.1')
    expect(formatLongDistance(1609.344, 'imperial')).toBe('1')
    expect(formatSpan(1609.344, 'imperial')).toBe('1 mi')
    expect(formatSpan(30.48, 'imperial')).toBe('100 ft')
    expect(formatGapDistance(-1609.344, 'imperial')).toBe('−1 mi')
    expect(formatElevation(30.48, 'imperial')).toBe('100 ft')
    expect(formatWeight(75, 'imperial')).toBe('165.3')
    expect(formatTempC(0, 'imperial')).toBe('32.0')
    expect(formatTempC(100, 'imperial')).toBe('212.0')
    expect(speedUnit('imperial')).toBe('mph')
  })

  it('round-trips a typed weight and a typed speed', () => {
    const lb = displayWeightKg(75, 'imperial')
    expect(storedWeightKg(Math.round(lb * 10) / 10, 'imperial')).toBeCloseTo(75, 1)
    expect(storedSpeedKmh(20, 'imperial')).toBeCloseTo(32.19, 1)
  })

  it('picks round imperial scale lengths', () => {
    expect(scaleSteps('metric')[0]).toBe(20)
    expect(scaleSteps('imperial').some((m) => Math.abs(m - 1609.344) < 1)).toBe(true)
  })
})
