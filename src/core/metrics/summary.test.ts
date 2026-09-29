import { describe, expect, it } from 'vitest'
import { aerobicDecoupling } from './hr'
import { meanMaxPower } from './mmp'
import { normalizedPower } from './power'
import type { Sample } from './sample'
import { summarizeRide } from './summary'
import { COGGAN_POWER, FRIEL_HR_LTHR, MAX_HR_5 } from './zones'

const steady = (v: Sample, seconds: number): Sample[] => Array.from({ length: seconds }, () => v)

// 1 h: 10 min at 150 W, 40 min at 250 W, 10 min coasting. A 60 s power dropout
// happens in the middle.
const power: Sample[] = [...steady(150, 600), ...steady(250, 1200), ...steady(null, 60), ...steady(250, 1140), ...steady(0, 600)]
const hr: Sample[] = [...steady(120, 600), ...steady(150, 1200), ...steady(152, 1200), ...steady(110, 600)]
const cadence: Sample[] = [...steady(85, 600), ...steady(92, 2400), ...steady(0, 600)]
const ride = { power, hr, cadence, ftp: 250, lthr: 165, weightKg: 70 }

describe('summarizeRide', () => {
  const s = summarizeRide(ride)

  it('reports duration and power statistics, skipping the dropout', () => {
    expect(s.durationS).toBe(3600)
    const valid = 600 + 1200 + 1140 + 600
    const joules = 150 * 600 + 250 * 2340
    expect(s.avgPower).toBeCloseTo(joules / valid, 9)
    expect(s.maxPower).toBe(250)
    expect(s.kj).toBeCloseTo(joules / 1000, 9)
    expect(s.np).toBe(normalizedPower(power))
    expect(s.if).toBeCloseTo(s.np! / 250, 12)
    expect(s.tss).toBeCloseTo(((valid * s.np! * s.if!) / (250 * 3600)) * 100, 9)
    expect(s.vi).toBeCloseTo(s.np! / s.avgPower!, 12)
    expect(s.wkg).toBeCloseTo(s.avgPower! / 70, 12)
  })

  it('reports HR, cadence (pedalling only) and HR/power coupling', () => {
    expect(s.avgHr).toBeCloseTo((120 * 600 + 150 * 1200 + 152 * 1200 + 110 * 600) / 3600, 9)
    expect(s.maxHr).toBe(152)
    expect(s.avgCadence).toBeCloseTo((85 * 600 + 92 * 2400) / 3000, 9)
    expect(s.maxCadence).toBe(92)
    expect(s.ef).toBeCloseTo(s.np! / s.avgHr!, 12)
    expect(s.decouplingPct).toBe(aerobicDecoupling(power, hr))
  })

  it('reports time in zones and the power-duration curve', () => {
    expect(s.powerZonesS).toHaveLength(COGGAN_POWER.zones.length)
    // coasting (Z1), 150 W = 60 % (Z2) and 250 W = 100 % (Z4). The dropout is in no zone.
    expect(s.powerZonesS).toEqual([600, 600, 0, 2340, 0, 0, 0])
    expect(s.hrZoneSchemeId).toBe(FRIEL_HR_LTHR.id)
    // 120 and 110 bpm are Z1 (< 81 % of 165); 150 and 152 bpm are Z3 (90–93 %).
    expect(s.hrZonesS).toEqual([1200, 0, 2400, 0, 0, 0, 0])
    expect(s.mmp).toEqual(meanMaxPower(power))
    expect(s.mmp.find((p) => p.durationS === 1200)?.watts).toBe(250)
  })

  it('treats HR 0 as missing and falls back to % max HR zones', () => {
    const noLthr = summarizeRide({ ...ride, lthr: undefined, maxHr: 190, hr: hr.map((h, i) => (i < 600 ? 0 : h)) })
    expect(noLthr.hrZoneSchemeId).toBe(MAX_HR_5.id)
    // Of max HR 190: 150 bpm is Z3, 152 bpm is exactly 80 % (Z4), 110 bpm is Z1. The zeroed first 10 min are missing.
    expect(noLthr.hrZonesS).toEqual([600, 0, 1200, 1200, 0])
    expect(noLthr.avgHr).toBeCloseTo((150 * 1200 + 152 * 1200 + 110 * 600) / 3000, 9)
  })

  it('returns nulls, not zeros, when a sensor is missing', () => {
    const bare = summarizeRide({ power: steady(null, 1800), hr: [], cadence: [], ftp: 0 })
    expect(bare).toMatchObject({
      durationS: 1800,
      avgPower: null,
      maxPower: null,
      np: null,
      if: null,
      tss: null,
      kj: null,
      vi: null,
      wkg: null,
      avgHr: null,
      maxHr: null,
      avgCadence: null,
      maxCadence: null,
      ef: null,
      decouplingPct: null,
      powerZonesS: [],
      hrZonesS: [],
      hrZoneSchemeId: null,
      mmp: [],
    })
  })
})
