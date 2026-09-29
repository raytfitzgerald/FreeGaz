import { readFileSync } from 'node:fs'
import { XMLValidator } from 'fast-xml-parser'
import { describe, expect, it } from 'vitest'
import { compileWorkout, diffTimelines } from '../compile'
import type { Segment, Workout } from '../model'
import { WorkoutFormatError } from './errors'
import { parseZwo, parseZwoWithWarnings, toZwo } from './zwo'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const ftp = (value: number) => ({ unit: 'ftp' as const, value })

function workout(segments: Segment[], extra: Partial<Workout> = {}): Workout {
  return { id: 't', name: 'Test', tags: [], sportType: 'bike', source: 'user', segments, ...extra }
}

function roundTrip(w: Workout, ftpW?: number): string | null {
  return diffTimelines(compileWorkout(w), compileWorkout(parseZwo(toZwo(w, { ftpW }))))
}

describe('parseZwo', () => {
  const { workout: w, warnings } = parseZwoWithWarnings(fixture('everything.zwo'))

  it('reads metadata case-insensitively, decoding entities', () => {
    expect(w).toMatchObject({
      name: 'Fixture & Friends',
      author: 'FreeGaz Tests',
      description: 'Exercises every block type.\nSecond line, café included.',
      tags: ['Intervals', 'Fixture'],
      sportType: 'bike',
      source: 'import',
    })
    expect(w.id).toMatch(/^zwo:[0-9a-f]{8}$/)
  })

  it('maps every block type, in document order', () => {
    expect(w.segments.map((s) => (s.kind === 'ramp' ? `${s.kind}:${s.role}` : s.kind))).toEqual([
      'ramp:warmup',
      'steady',
      'steady',
      'intervals',
      'intervals',
      'ramp:ramp',
      'freeride',
      'freeride',
      'maxeffort',
      'ramp:cooldown',
      'ramp:cooldown',
    ])
  })

  it('keeps ramp direction for Warmup/Ramp and always descends on Cooldown', () => {
    expect(w.segments[0]).toMatchObject({ from: ftp(0.4), to: ftp(0.75) })
    expect(w.segments[5]).toMatchObject({ from: ftp(0.9), to: ftp(0.6) })
    expect(w.segments[9]).toMatchObject({ from: ftp(0.65), to: ftp(0.4) })
    // PowerLow < PowerHigh on a Cooldown still means "down".
    expect(w.segments[10]).toMatchObject({ from: ftp(0.55), to: ftp(0.3) })
  })

  it('reads text events, including the mssage typo and durations', () => {
    expect(w.segments[0]?.text).toEqual([
      { offsetS: 0, message: 'Easy does it' },
      { offsetS: 300, message: 'Halfway through the warm-up', durationS: 15 },
    ])
  })

  it('reads steady power, show_avg, cadence and SolidState ranges', () => {
    expect(w.segments[1]).toEqual({ kind: 'steady', durationS: 300, power: ftp(0.6), cadence: { rpm: 90 }, showAverage: true })
    expect(w.segments[2]).toEqual({ kind: 'steady', durationS: 120, power: { unit: 'ftp', value: 0.9, low: 0.88, high: 0.92 } })
  })

  it('reads IntervalsT with cadence and power ranges', () => {
    expect(w.segments[3]).toEqual({
      kind: 'intervals',
      repeat: 4,
      on: { durationS: 60, power: ftp(1.15), cadence: { rpm: 100 } },
      off: { durationS: 90, power: ftp(0.5), cadence: { rpm: 85 } },
      text: [{ offsetS: 200, message: 'Second rep: stay on top of it' }],
    })
    expect(w.segments[4]).toEqual({
      kind: 'intervals',
      repeat: 2,
      on: { durationS: 30, power: { unit: 'ftp', value: 1.25, low: 1.2, high: 1.3 } },
      off: { durationS: 30, power: ftp(0.5) },
    })
  })

  it('reads FreeRide FlatRoad and MaxEffort', () => {
    expect(w.segments[6]).toEqual({ kind: 'freeride', durationS: 600, flatRoad: false })
    expect(w.segments[7]).toEqual({ kind: 'freeride', durationS: 60 })
    expect(w.segments[8]).toEqual({ kind: 'maxeffort', durationS: 20 })
    const tl = compileWorkout(w)
    expect(tl.steps.filter((s) => s.kind === 'freeride').map((s) => s.flatRoad)).toEqual([false, true])
  })

  it('places a text event past the first rep inside a later rep', () => {
    const tl = compileWorkout(w)
    const cue = tl.texts.find((t) => t.message.startsWith('Second rep'))
    const step = tl.steps[cue?.stepIndex ?? -1]
    expect(step).toMatchObject({ kind: 'on', repIndex: 1, segmentIndex: 3 })
  })

  it('warns about what it skipped, and ignores pace silently', () => {
    expect(warnings).toEqual([
      'Ignored <category>.',
      '<FreeRide> (block 7): ignored unknown attribute Zone.',
      'Skipped unknown block <Sprint> (block 10).',
    ])
  })

  it('refuses running workouts with a clear error', () => {
    expect(() => parseZwo(fixture('run.zwo'))).toThrow(WorkoutFormatError)
    expect(() => parseZwo(fixture('run.zwo'))).toThrow(/running workout/)
  })

  it('accepts a byte-order mark', () => {
    expect(parseZwo('\uFEFF<workout_file><workout><FreeRide Duration="60"/></workout></workout_file>').segments).toEqual([
      { kind: 'freeride', durationS: 60 },
    ])
  })

  it('rejects files that are not workouts', () => {
    expect(() => parseZwo('')).toThrow(/empty/)
    expect(() => parseZwo('<workout_file><workout></workout_file>')).toThrow(/Not valid XML/)
    expect(() => parseZwo('<plan><workout/></plan>')).toThrow(/expected <workout_file>/)
    expect(() => parseZwo('<workout_file><name>x</name></workout_file>')).toThrow(/no <workout>/)
    expect(() => parseZwo('<workout_file><sportType>swim</sportType><workout/></workout_file>')).toThrow(/Unsupported sportType/)
  })

  it('skips broken blocks and text events with warnings instead of failing', () => {
    const r = parseZwoWithWarnings(`<workout_file><workout>
      <SteadyState Power="0.5"/>
      <SteadyState Duration="abc" Power="0.5"/>
      <IntervalsT Repeat="0" OnDuration="30" OffDuration="30" OnPower="1" OffPower="0.5"/>
      <IntervalsT OnDuration="30" OffDuration="30" OnPower="1" OffPower="0.5"/>
      <SteadyState Duration="60" Power="0.5">
        <textevent timeoffset="5"/>
        <textevent timeoffset="-5" message="negative"/>
        <textevent message="no offset"/>
        <note>hi</note>
      </SteadyState>
    </workout></workout_file>`)
    expect(r.workout.segments).toEqual([
      { kind: 'intervals', repeat: 1, on: { durationS: 30, power: ftp(1) }, off: { durationS: 30, power: ftp(0.5) } },
      { kind: 'steady', durationS: 60, power: ftp(0.5), text: [{ offsetS: 0, message: 'no offset' }] },
    ])
    expect(r.workout.name).toBe('Untitled workout')
    expect(r.warnings).toEqual([
      '<SteadyState> (block 1): missing or invalid Duration; block skipped.',
      '<SteadyState> (block 2): Duration="abc" is not a number; ignored.',
      '<SteadyState> (block 2): missing or invalid Duration; block skipped.',
      '<IntervalsT> (block 3): Repeat="0" must be a whole number from 1 to 1000; block skipped.',
      '<IntervalsT> (block 4): missing Repeat; assuming 1.',
      '<SteadyState> (block 5) <textevent>: no message; skipped.',
      '<SteadyState> (block 5) <textevent>: negative timeoffset; skipped.',
      '<SteadyState> (block 5) <textevent>: missing timeoffset; showing it at the start of the block.',
      '<SteadyState> (block 5): ignored <note>.',
    ])
  })

  it('derives a stable id from the content, or uses the injected factory', () => {
    const xml = fixture('everything.zwo')
    expect(parseZwo(xml).id).toBe(parseZwo(xml).id)
    expect(parseZwo(`${xml} `).id).not.toBe(parseZwo(xml).id)
    expect(parseZwo(xml, { newId: () => 'abc', source: 'user' })).toMatchObject({ id: 'abc', source: 'user' })
  })
})

describe('toZwo', () => {
  const imported = parseZwo(fixture('everything.zwo'))

  it('writes valid, pretty XML for bike', () => {
    const xml = toZwo(imported)
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<workout_file>\n  <author>FreeGaz Tests</author>')).toBe(true)
    expect(xml).toContain('<sportType>bike</sportType>')
    expect(XMLValidator.validate(xml)).toBe(true)
    expect(xml.endsWith('</workout_file>\n')).toBe(true)
  })

  it('round-trips the fixture to an identical timeline', () => {
    expect(roundTrip(imported)).toBeNull()
  })

  it('writes the standard block for each segment kind', () => {
    const xml = toZwo(imported)
    const body = xml.slice(xml.indexOf('<workout>'))
    const blocks = [...body.matchAll(/^ {4}<(\w+)/gm)].map((m) => m[1])
    expect(blocks).toEqual([
      'Warmup',
      'SteadyState',
      'SteadyState',
      'IntervalsT',
      'IntervalsT',
      'Ramp',
      'FreeRide',
      'FreeRide',
      'MaxEffort',
      'Cooldown',
      'Cooldown',
    ])
    expect(xml).toContain('<Cooldown Duration="180" PowerLow="0.55" PowerHigh="0.3"/>')
    expect(xml).toContain('<SteadyState Duration="120" PowerLow="0.88" PowerHigh="0.92"/>')
    expect(xml).toContain(
      '<IntervalsT Repeat="4" OnDuration="60" OffDuration="90" OnPower="1.15" OffPower="0.5" Cadence="100" CadenceResting="85">',
    )
    expect(xml).toContain('<FreeRide Duration="600" FlatRoad="0"/>')
    expect(xml).toContain('<FreeRide Duration="60" FlatRoad="1"/>')
  })

  it('escapes text and attribute values', () => {
    const w = workout(
      [{ kind: 'steady', durationS: 60, power: ftp(0.5), label: 'A <b> & "c"', text: [{ offsetS: 0, message: `Don't "stop" <now> & later` }] }],
      { name: 'Q&A <1>', description: 'x > y & "z"', tags: ['a&b'] },
    )
    const xml = toZwo(w)
    expect(XMLValidator.validate(xml)).toBe(true)
    expect(xml).toContain('<name>Q&amp;A &lt;1&gt;</name>')
    expect(xml).toContain('message="Don&apos;t &quot;stop&quot; &lt;now&gt; &amp; later"')
    const back = parseZwo(xml)
    expect(back).toMatchObject({ name: 'Q&A <1>', description: 'x > y & "z"', tags: ['a&b'] })
    expect(back.segments[0]).toMatchObject({ label: 'A <b> & "c"', text: [{ offsetS: 0, message: `Don't "stop" <now> & later` }] })
  })

  it('keeps labels, interval part labels and cadence ranges via FreeGaz attributes', () => {
    const w = workout([
      {
        kind: 'intervals',
        repeat: 3,
        label: 'Over-unders',
        on: { durationS: 120, power: ftp(0.95), label: 'Under', cadence: { low: 85, high: 95 } },
        off: { durationS: 60, power: ftp(1.05), label: 'Over', cadence: { low: 95, high: 105 } },
      },
      { kind: 'maxeffort', durationS: 300, label: 'Blowout' },
    ])
    const xml = toZwo(w)
    expect(xml).toContain('Label="Over-unders" OnLabel="Under" OffLabel="Over"')
    expect(xml).toContain('CadenceLow="85" CadenceHigh="95" CadenceRestingLow="95" CadenceRestingHigh="105"')
    expect(parseZwo(xml).segments).toEqual(w.segments)
    expect(roundTrip(w)).toBeNull()
  })

  it('converts absolute watts with ftpW, and refuses without it', () => {
    const w = workout([
      { kind: 'steady', durationS: 60, power: { unit: 'watts', value: 223 } },
      { kind: 'ramp', role: 'warmup', durationS: 60, from: { unit: 'watts', value: 100 }, to: ftp(0.8) },
      { kind: 'steady', durationS: 60, power: { unit: 'watts', value: 225, low: 200, high: 250 } },
    ])
    expect(() => toZwo(w)).toThrow(/ftpW/)
    const back = parseZwo(toZwo(w, { ftpW: 237 }))
    const a = compileWorkout(w)
    const b = compileWorkout(back)
    for (const [i, s] of a.steps.entries()) {
      const t = b.steps[i]
      expect(t?.from?.unit).toBe('ftp')
      expect((t?.from?.value ?? 0) * 237).toBeCloseTo(s.from?.unit === 'watts' ? s.from.value : (s.from?.value ?? 0) * 237, 3)
    }
    expect(back.segments[2]).toMatchObject({ power: { low: expect.closeTo(200 / 237, 6), high: expect.closeTo(250 / 237, 6) } })
  })

  it('writes a rising cool-down as a Ramp, and a Power attribute for off-centre ranges', () => {
    const w = workout([
      { kind: 'ramp', role: 'cooldown', durationS: 60, from: ftp(0.4), to: ftp(0.6) },
      { kind: 'steady', durationS: 60, power: { unit: 'ftp', value: 0.9, low: 0.85, high: 1 } },
    ])
    const xml = toZwo(w)
    expect(xml).toContain('<Ramp Duration="60" PowerLow="0.4" PowerHigh="0.6"/>')
    expect(xml).toContain('<SteadyState Duration="60" Power="0.9" PowerLow="0.85" PowerHigh="1"/>')
    expect(parseZwo(xml).segments[1]).toEqual(w.segments[1])
  })

  it('rounds durations and offsets to whole seconds', () => {
    const w = workout([{ kind: 'steady', durationS: 59.6, power: ftp(0.5), text: [{ offsetS: 10.4, message: 'x', durationS: 4.6 }] }])
    const xml = toZwo(w)
    expect(xml).toContain('<SteadyState Duration="60" Power="0.5">')
    expect(xml).toContain('<textevent timeoffset="10" message="x" duration="5"/>')
  })
})
