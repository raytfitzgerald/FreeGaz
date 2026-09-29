import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compileWorkout, targetAt, type Timeline } from '../compile'
import type { Segment, Workout } from '../model'
import { ERG_FREERIDE_FTP, ERG_MAXEFFORT_FTP, parseErgMrc, parseErgMrcWithWarnings, toErg, toMrc } from './ergmrc'
import { WorkoutFormatError } from './errors'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const ftp = (value: number) => ({ unit: 'ftp' as const, value })
const watts = (value: number) => ({ unit: 'watts' as const, value })

function workout(segments: Segment[], extra: Partial<Workout> = {}): Workout {
  return { id: 't', name: 'Test ride', tags: [], sportType: 'bike', source: 'user', segments, ...extra }
}

/** ERG/MRC flatten structure, so compare what the trainer would do: watts every second. */
function sameWatts(a: Timeline, b: Timeline, ftpW: number): void {
  expect(b.durationS).toBe(a.durationS)
  for (let t = 0; t < a.durationS; t++) {
    expect(targetAt(b, t + 0.5, ftpW)?.watts ?? null, `t=${t}`).toBeCloseTo(targetAt(a, t + 0.5, ftpW)?.watts ?? 0, 1)
  }
}

describe('parseErgMrc', () => {
  it('reads an MRC file into steady and ramp segments with text cues', () => {
    const { workout: w, warnings, header } = parseErgMrcWithWarnings(fixture('sweet-spot-sampler.mrc'))
    expect(warnings).toEqual([])
    expect(header).toEqual({
      version: '2',
      units: 'ENGLISH',
      description: 'Sweet spot sampler: two blocks with a ramp in and out',
      fileName: 'sweet-spot-sampler.mrc',
      data: 'percent',
    })
    expect(w).toMatchObject({ name: 'sweet-spot-sampler', description: header.description, source: 'import', tags: [] })
    expect(w.id).toMatch(/^mrc:[0-9a-f]{8}$/)
    expect(w.segments).toEqual([
      { kind: 'ramp', role: 'ramp', durationS: 600, from: ftp(0.45), to: ftp(0.7), text: [{ offsetS: 0, message: 'Ramp up gently', durationS: 10 }] },
      { kind: 'steady', durationS: 180, power: ftp(0.55) },
      {
        kind: 'steady',
        durationS: 720,
        power: ftp(0.9),
        text: [{ offsetS: 0, message: 'First sweet spot block: settle at 90 %', durationS: 15 }],
      },
      { kind: 'steady', durationS: 300, power: ftp(0.55) },
      { kind: 'steady', durationS: 720, power: ftp(0.9) },
      { kind: 'ramp', role: 'ramp', durationS: 300, from: ftp(0.6), to: ftp(0.4), text: [{ offsetS: 120, message: 'Last block done, spin it out', durationS: 10 }] },
    ])
    expect(compileWorkout(w).durationS).toBe(47 * 60)
  })

  it('reads ERG watts as absolute targets, rounding times to whole seconds', () => {
    const { workout: w, header } = parseErgMrcWithWarnings(fixture('threshold-pair.erg'))
    expect(header).toMatchObject({ ftpW: 250, data: 'watts', fileName: 'C:\\Workouts\\threshold-pair.erg' })
    expect(w.name).toBe('threshold-pair')
    expect(w.id).toMatch(/^erg:/)
    expect(w.segments.map((s) => (s.kind === 'steady' ? [s.durationS, s.power] : [s.kind === 'ramp' ? s.durationS : 0, s.kind]))).toEqual([
      [600, 'ramp'],
      [600, watts(240)],
      [300, watts(125)],
      [600, watts(240)],
      [300, watts(100)],
      [20, watts(150)],
    ])
  })

  it('converts ERG watts to FTP fractions when given an FTP', () => {
    const w = parseErgMrc(fixture('threshold-pair.erg'), { ftpW: 300 })
    expect(w.segments[0]).toMatchObject({ from: ftp(100 / 300), to: ftp(180 / 300) })
    expect(w.segments[1]).toMatchObject({ power: ftp(0.8) })
  })

  it('warns about oddities and keeps going', () => {
    const r = parseErgMrcWithWarnings(
      [
        'stray line',
        '[COURSE HEADER]',
        'COLOR = blue',
        '[END COURSE HEADER]',
        '[COURSE DATA]',
        '0 50',
        'oops',
        '5 50',
        '4 60',
        '10 60',
        '[END COURSE DATA]',
        '[MUSIC]',
        'track.mp3',
        '[COURSE TEXT]',
        '30 Spaces instead of tabs 12',
        '9000\tWay past the end\t5',
        '[END COURSE TEXT]',
      ].join('\n'),
    )
    expect(r.header.data).toBe('percent')
    expect(r.workout.segments).toEqual([
      { kind: 'steady', durationS: 300, power: ftp(0.5), text: [{ offsetS: 30, message: 'Spaces instead of tabs', durationS: 12 }] },
      { kind: 'ramp', role: 'ramp', durationS: 300, from: ftp(0.5), to: ftp(0.6) },
    ])
    expect(r.warnings).toEqual([
      'Line 1: ignored text outside any section.',
      'Line 3: ignored header field COLOR.',
      'Line 7: unreadable data row "oops"; skipped.',
      'Line 9: time goes backwards; point skipped.',
      'Line 12: ignored unknown section [MUSIC].',
      'No "MINUTES PERCENT" or "MINUTES WATTS" line; assuming percent.',
      'Line 16: text at 9000 s is outside the workout; skipped.',
    ])
  })

  it('accepts a byte-order mark and CR line endings', () => {
    const r = parseErgMrcWithWarnings('\uFEFF[COURSE HEADER]\rMINUTES PERCENT\r[END COURSE HEADER]\r[COURSE DATA]\r0 50\r1 50\r[END COURSE DATA]\r')
    expect(r.warnings).toEqual([])
    expect(r.workout.segments).toEqual([{ kind: 'steady', durationS: 60, power: ftp(0.5) }])
  })

  it('guesses watts when values are large, and refuses files without data', () => {
    const r = parseErgMrcWithWarnings('[COURSE DATA]\n0 150\n10 300\n[END COURSE DATA]\n')
    expect(r.header.data).toBe('watts')
    expect(r.workout.segments[0]).toMatchObject({ from: watts(150), to: watts(300) })
    expect(() => parseErgMrc('[COURSE HEADER]\nMINUTES PERCENT\n[END COURSE HEADER]\n')).toThrow(WorkoutFormatError)
  })
})

describe('toMrc / toErg', () => {
  const w = workout(
    [
      { kind: 'ramp', role: 'warmup', durationS: 600, from: ftp(0.4), to: ftp(0.7) },
      { kind: 'intervals', repeat: 3, on: { durationS: 180, power: ftp(1.1) }, off: { durationS: 120, power: ftp(0.5) } },
      { kind: 'steady', durationS: 300, power: watts(200), text: [{ offsetS: 20, message: 'Hold\tsteady', durationS: 8 }] },
      { kind: 'ramp', role: 'cooldown', durationS: 300, from: ftp(0.6), to: ftp(0.4) },
    ],
    { description: 'Line one\nline two' },
  )

  it('writes an MRC file with CRLF lines, flattened intervals and text', () => {
    const mrc = toMrc(w, { ftpW: 250 })
    const lines = mrc.split('\r\n')
    expect(lines.slice(0, 9)).toEqual([
      '[COURSE HEADER]',
      'VERSION = 2',
      'UNITS = ENGLISH',
      'DESCRIPTION = Line one line two',
      'FILE NAME = test-ride.mrc',
      'MINUTES PERCENT',
      '[END COURSE HEADER]',
      '[COURSE DATA]',
      '0.00\t40',
    ])
    expect(lines).toContain('10.00\t70')
    expect(lines).toContain('13.00\t110')
    expect(lines).toContain('25.00\t80')
    expect(lines.slice(-5)).toEqual(['[END COURSE DATA]', '[COURSE TEXT]', '1520\tHold steady\t8', '[END COURSE TEXT]', ''])
    expect(mrc.includes('\n') && !/[^\r]\n/.test(mrc)).toBe(true)
  })

  it('round-trips MRC and ERG to the same second-by-second targets', () => {
    const tl = compileWorkout(w)
    sameWatts(tl, compileWorkout(parseErgMrc(toMrc(w, { ftpW: 250 }))), 250)
    sameWatts(tl, compileWorkout(parseErgMrc(toErg(w, 250))), 250)
    const back = parseErgMrc(toMrc(w, { ftpW: 250 }))
    expect(compileWorkout(back).texts).toEqual(tl.texts.map((t) => ({ ...t, message: 'Hold steady', stepIndex: expect.any(Number) })))
  })

  it('writes ERG watts with the FTP in the header', () => {
    const erg = toErg(w, 250)
    expect(erg).toContain('FTP = 250\r\nMINUTES WATTS\r\n')
    expect(erg).toContain('0.00\t100\r\n10.00\t175\r\n')
    expect(erg).toContain('FILE NAME = test-ride.erg')
  })

  it('maps ERG-off steps to steady targets and says so', () => {
    const lossy = workout([
      { kind: 'freeride', durationS: 60 },
      { kind: 'maxeffort', durationS: 30 },
    ])
    const mrc = toMrc(lossy)
    expect(mrc).toContain(`0.00\t${ERG_FREERIDE_FTP * 100}\r\n1.00\t${ERG_FREERIDE_FTP * 100}\r\n`)
    expect(mrc).toContain(`1.00\t${ERG_MAXEFFORT_FTP * 100}\r\n1.50\t${ERG_MAXEFFORT_FTP * 100}\r\n`)
    expect(mrc).toContain('DESCRIPTION = Exported free rides as steady 50 % FTP and max efforts as steady 120 % FTP.')
  })

  it('needs an FTP to convert between watts and percent', () => {
    expect(() => toMrc(workout([{ kind: 'steady', durationS: 60, power: watts(200) }]))).toThrow(/ftpW/)
    expect(() => toErg(w, 0)).toThrow(RangeError)
  })
})
