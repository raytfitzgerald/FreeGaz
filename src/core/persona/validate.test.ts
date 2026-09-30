import { describe, expect, it } from 'vitest'
import { coverageGaps } from './coverage'
import { CoachEngine } from './engine'
import { mulberry32 } from './rng'
import { sampleContext } from './samples'
import { validatePack } from './validate'

const meta = { id: 'my-coach', name: 'My Coach', tagline: 'Mine, all mine.' }
const goodLines = [
  { id: 'hi', text: 'Hello! {elapsedMin} minutes in.', triggers: ['idle_banter'], spice: 1 },
  { id: 'go', text: '{targetW} watts for {remainingS}. Go!', triggers: ['segment_start'], spice: 2, criteria: [{ key: 'hard', op: '==', value: true }] },
  { id: 'damn', text: 'Damn fine work.', triggers: ['segment_end_success', 'pr'], spice: 4, profanity: true, weight: 2 },
]

const withLines = (...lines: unknown[]): unknown => ({ meta, lines })

describe('validatePack: happy path', () => {
  it('accepts a well-formed pack', () => {
    const { pack, errors } = validatePack({ meta, lines: goodLines })
    expect(errors).toEqual([])
    expect(pack?.meta).toEqual(meta)
    expect(pack?.lines.map((l) => l.id)).toEqual(['hi', 'go', 'damn'])
    expect(pack?.lines[2]).toEqual({ id: 'damn', text: 'Damn fine work.', triggers: ['segment_end_success', 'pr'], spice: 4, profanity: true, weight: 2 })
  })

  it('defaults the tagline, trims text and de-duplicates triggers', () => {
    const { pack, errors } = validatePack({
      meta: { id: 'tiny', name: 'Tiny' },
      lines: [{ id: 'a', text: '  Spin.  ', triggers: ['idle_banter', 'idle_banter'], spice: 1 }],
    })
    expect(errors).toEqual([])
    expect(pack?.meta.tagline).toBe('')
    expect(pack?.lines[0]).toEqual({ id: 'a', text: 'Spin.', triggers: ['idle_banter'], spice: 1 })
  })

  it('produces a pack the engine can use, with Professional covering the gaps', () => {
    const { pack } = validatePack({ meta, lines: goodLines })
    if (!pack) throw new Error('expected a pack')
    expect(coverageGaps(pack).length).toBeGreaterThan(0)
    const engine = new CoachEngine({ persona: pack, spice: 5, profanity: true, rng: mulberry32(1) })
    expect(engine.consider(sampleContext('segment_start', 0))?.text).toBe('300 watts for 5:00. Go!')
    expect(engine.consider(sampleContext('countdown_10s', 1000))?.personaId).toBe('professional')
    expect(engine.consider(sampleContext('idle_banter', 61_000))?.lineId).toBe('hi')
  })

  it('accepts a voice hint', () => {
    const { pack, errors } = validatePack({
      meta: { ...meta, voiceHint: { rate: 1.1, pitch: 0.9, preferVoices: ['Alex'] } },
      lines: goodLines,
    })
    expect(errors).toEqual([])
    expect(pack?.meta.voiceHint?.preferVoices).toEqual(['Alex'])
  })
})

describe('validatePack: sad paths', () => {
  it.each([null, 42, 'pack', [], {}, { meta }, { lines: goodLines }, { meta, lines: [] }])('rejects %j', (json) => {
    const { pack, errors } = validatePack(json)
    expect(pack).toBeNull()
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects bad or reserved ids, and banned names', () => {
    const cases: [unknown, RegExp][] = [
      [{ ...meta, id: 'Bad Id!' }, /meta\.id/],
      [{ ...meta, id: 'zen' }, /built-in/],
      [{ ...meta, name: 'Coach Jesus' }, /meta\.name: touches a banned topic \(religion/],
      [{ ...meta, tagline: 'Roasts your fat legs' }, /meta\.tagline: touches a banned topic \(body/],
      [{ ...meta, voiceHint: { rate: 50, pitch: 1, preferVoices: [] } }, /voiceHint\.rate/],
    ]
    for (const [badMeta, message] of cases) {
      const { pack, errors } = validatePack({ meta: badMeta, lines: goodLines })
      expect(pack, JSON.stringify(badMeta)).toBeNull()
      expect(errors.join('\n')).toMatch(message)
    }
  })

  it('drops bad lines with a message naming the line, and keeps the rest', () => {
    const bad = [
      { id: 'trig', text: 'Hi.', triggers: ['nap_time'], spice: 1 },
      { id: 'spice0', text: 'Hi.', triggers: ['idle_banter'], spice: 0 },
      { id: 'spice6', text: 'Hi.', triggers: ['idle_banter'], spice: 6 },
      { id: 'spiceFrac', text: 'Hi.', triggers: ['idle_banter'], spice: 2.5 },
      { id: 'noTriggers', text: 'Hi.', triggers: [], spice: 1 },
      { id: 'empty', text: '   ', triggers: ['idle_banter'], spice: 1 },
      { id: 'long', text: 'x'.repeat(201), triggers: ['idle_banter'], spice: 1 },
      { id: 'weight', text: 'Hi.', triggers: ['idle_banter'], spice: 1, weight: 0 },
      { id: 'topic', text: 'Pedal like a girl.', triggers: ['idle_banter'], spice: 3 },
      { id: 'body', text: 'Burn off that belly.', triggers: ['idle_banter'], spice: 3 },
      { id: 'strong', text: 'Pedal, you bastard.', triggers: ['idle_banter'], spice: 5 },
      { id: 'unflagged', text: 'Damn, pedal.', triggers: ['idle_banter'], spice: 3 },
      { id: 'placeholder', text: 'Hold {pwoer}.', triggers: ['idle_banter'], spice: 1 },
      { id: 'brace', text: 'Hold {power.', triggers: ['idle_banter'], spice: 1 },
      { id: 'critKey', text: 'Hi.', triggers: ['idle_banter'], spice: 1, criteria: [{ key: 'mood', op: '==', value: 'grumpy' }] },
      { id: 'critOp', text: 'Hi.', triggers: ['idle_banter'], spice: 1, criteria: [{ key: 'power', op: '>', value: 'lots' }] },
      { id: 'critBadOp', text: 'Hi.', triggers: ['idle_banter'], spice: 1, criteria: [{ key: 'power', op: '~', value: 1 }] },
      { text: 'No id.', triggers: ['idle_banter'], spice: 1 },
      'not an object',
    ]
    const { pack, errors } = validatePack(withLines(...goodLines, ...bad, { ...goodLines[0], text: 'Duplicate id.' }))
    expect(pack?.lines.map((l) => l.id)).toEqual(['hi', 'go', 'damn'])
    const text = errors.join('\n')
    expect(errors).toHaveLength(bad.length + 1)
    expect(text).toMatch(/lines\[3\]\.triggers\.0/)
    expect(text).toMatch(/lines\[4\]\.spice/)
    expect(text).toMatch(/\("topic"\): text: touches a banned topic \(gender/)
    expect(text).toMatch(/\("body"\): text: touches a banned topic \(body/)
    expect(text).toMatch(/\("strong"\): text: contains profanity; set "profanity": true/)
    expect(text).toMatch(/\("unflagged"\): text: contains profanity; set "profanity": true/)
    expect(text).toMatch(/\("placeholder"\): text: unknown placeholder \{pwoer\}/)
    expect(text).toMatch(/\("brace"\): text: stray/)
    expect(text).toMatch(/\("critKey"\): criteria: unknown key "mood"/)
    expect(text).toMatch(/\("critOp"\): criteria: ">" needs a number/)
    expect(text).toMatch(/\("hi"\): duplicate id/)
  })

  it('returns no pack when every line is invalid', () => {
    const { pack, errors } = validatePack(withLines({ id: 'x', text: 'Pray harder.', triggers: ['idle_banter'], spice: 1 }))
    expect(pack).toBeNull()
    expect(errors).toContain('lines: no valid lines')
  })
})
