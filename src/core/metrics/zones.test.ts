import { describe, expect, it } from 'vitest'
import { COGGAN_POWER, FRIEL_HR_LTHR, MAX_HR_5, sweetSpot, TimeInZones, zoneFor, type ZoneScheme } from './zones'

const short = (value: number, scheme: ZoneScheme, reference: number) => zoneFor(value, scheme, reference)?.short ?? null

describe('zone schemes', () => {
  it.each([COGGAN_POWER, FRIEL_HR_LTHR, MAX_HR_5])('$id is contiguous with an open top zone', (scheme) => {
    scheme.zones.forEach((z, i) => {
      expect(z.id).toBe(i + 1)
      const next = scheme.zones[i + 1]
      if (next) expect(z.hi).toBe(next.lo)
      else expect(z.hi).toBeNull()
    })
  })

  it('Coggan power zones at FTP 250 W', () => {
    const ftp = 250
    expect(short(0, COGGAN_POWER, ftp)).toBe('Z1')
    expect(short(137.5, COGGAN_POWER, ftp)).toBe('Z1') // 55 %
    expect(short(140, COGGAN_POWER, ftp)).toBe('Z2') // 56 %: exact boundary
    expect(short(187.5, COGGAN_POWER, ftp)).toBe('Z2') // 75 %
    expect(short(190, COGGAN_POWER, ftp)).toBe('Z3')
    expect(short(227, COGGAN_POWER, ftp)).toBe('Z3') // 90.8 %
    expect(short(250, COGGAN_POWER, ftp)).toBe('Z4')
    expect(short(265, COGGAN_POWER, ftp)).toBe('Z5') // 106 %
    expect(short(300, COGGAN_POWER, ftp)).toBe('Z5') // 120 %
    expect(short(375, COGGAN_POWER, ftp)).toBe('Z6') // 150 %
    expect(short(377.5, COGGAN_POWER, ftp)).toBe('Z7') // 151 %
    expect(short(1500, COGGAN_POWER, ftp)).toBe('Z7')
  })

  it('Friel HR zones at LTHR 170 bpm', () => {
    const lthr = 170
    expect(short(130, FRIEL_HR_LTHR, lthr)).toBe('Z1') // 76 %
    expect(short(140, FRIEL_HR_LTHR, lthr)).toBe('Z2') // 82 %
    expect(short(155, FRIEL_HR_LTHR, lthr)).toBe('Z3') // 91 %
    expect(short(165, FRIEL_HR_LTHR, lthr)).toBe('Z4') // 97 %
    expect(short(170, FRIEL_HR_LTHR, lthr)).toBe('Z5a') // 100 %
    expect(short(178, FRIEL_HR_LTHR, lthr)).toBe('Z5b') // 104.7 %
    expect(short(183, FRIEL_HR_LTHR, lthr)).toBe('Z5c') // 107.6 %
  })

  it('% max HR zones leave readings below 50 % unzoned', () => {
    expect(short(90, MAX_HR_5, 200)).toBeNull()
    expect(short(100, MAX_HR_5, 200)).toBe('Z1')
    expect(short(150, MAX_HR_5, 200)).toBe('Z3')
    expect(short(210, MAX_HR_5, 200)).toBe('Z5') // max HR set too low still counts
  })

  it('returns null for an invalid reference or reading', () => {
    expect(zoneFor(200, COGGAN_POWER, 0)).toBeNull()
    expect(zoneFor(200, COGGAN_POWER, Number.NaN)).toBeNull()
    expect(zoneFor(Number.NaN, COGGAN_POWER, 250)).toBeNull()
    expect(zoneFor(-5, COGGAN_POWER, 250)).toBeNull()
  })
})

describe('TimeInZones', () => {
  it('accumulates seconds per zone, ignoring missing samples', () => {
    const tiz = new TimeInZones(COGGAN_POWER, 250)
    for (const w of [100, 100, null, 200, 250, 0, null, 400]) tiz.push(w)
    tiz.push(260, 2.5)
    expect(tiz.seconds()).toEqual([3, 0, 1, 3.5, 0, 0, 1])
    expect(tiz.unzonedS).toBe(0)
  })

  it('counts valid readings outside every zone separately', () => {
    const tiz = new TimeInZones(MAX_HR_5, 190)
    for (const hr of [80, 90, 120, 180]) tiz.push(hr)
    expect(tiz.seconds()).toEqual([0, 1, 0, 0, 1])
    expect(tiz.unzonedS).toBe(2)
  })

  it('seconds() returns a copy, and reset() clears everything', () => {
    const tiz = new TimeInZones(COGGAN_POWER, 250)
    tiz.push(100)
    const s = tiz.seconds()
    s[0] = 99
    expect(tiz.seconds()[0]).toBe(1)
    tiz.reset()
    expect(tiz.seconds().every((x) => x === 0)).toBe(true)
  })

  it('rejects a non-positive reference', () => {
    expect(() => new TimeInZones(COGGAN_POWER, 0)).toThrow(RangeError)
  })
})

describe('sweetSpot', () => {
  it('is 84–97 % FTP inclusive', () => {
    expect(sweetSpot(0.83)).toBe(false)
    expect(sweetSpot(0.84)).toBe(true)
    expect(sweetSpot(0.9)).toBe(true)
    expect(sweetSpot(0.97)).toBe(true)
    expect(sweetSpot(0.98)).toBe(false)
  })
})
