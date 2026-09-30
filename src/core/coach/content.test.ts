import { describe, expect, it } from 'vitest'
import { BIBI_BANNED_PATTERNS } from '../persona/packs'
import { PRIORITY, type CoachLine } from '../persona/types'
import { SAFETY_FALLBACK_TEXT, gateLine, matchesAny, personaBannedPatterns, sanitizeFacts, textAllowed } from './content'

const line = (text: string, over: Partial<CoachLine> = {}): CoachLine => ({
  text,
  speech: text,
  personaId: 'bibi',
  trigger: 'ride_start',
  priority: PRIORITY.cue,
  lineId: 'x',
  ...over,
})

describe('persona bans', () => {
  it('adds the Bibi list for the Bibi parody only', () => {
    expect(personaBannedPatterns('bibi')).toBe(BIBI_BANNED_PATTERNS)
    for (const id of ['drill-sergeant', 'roast-comic', 'professional', 'custom-thing']) expect(personaBannedPatterns(id)).toEqual([])
  })

  it('matches normalized text as well, so leetspeak does not slip through', () => {
    const bans = personaBannedPatterns('bibi')
    expect(matchesAny('Victory lap', bans)).toBe(true)
    expect(matchesAny('V1ctory lap', bans)).toBe(true)
    expect(matchesAny('Sweet spot 3x12', bans)).toBe(false)
    expect(matchesAny('anything', [])).toBe(false)
  })
})

describe('sanitizeFacts', () => {
  const bans = personaBannedPatterns('bibi')

  it('drops workout names and labels a persona must never say', () => {
    const data = { workoutName: 'Battle of the Bulge', segmentLabel: 'Attack 2/5', targetW: 300, hard: true }
    expect(sanitizeFacts(data, bans)).toEqual({ targetW: 300, hard: true })
    expect(sanitizeFacts({ workoutName: 'Sweet Spot 3×12', segmentLabel: 'VO2 2/5' }, bans)).toEqual({ workoutName: 'Sweet Spot 3×12', segmentLabel: 'VO2 2/5' })
  })

  it('drops strings that touch the global guardrails for every persona', () => {
    expect(sanitizeFacts({ workoutName: 'Fat Burner 45', power: 200 }, [])).toEqual({ power: 200 })
  })

  it('returns the same object when nothing needs dropping', () => {
    const data = { workoutName: 'Tempo 2×20', power: 250 }
    expect(sanitizeFacts(data, bans)).toBe(data)
  })
})

describe('gateLine', () => {
  it('holds a persona to its own bans', () => {
    expect(gateLine(line('History will judge this interval.'), { personaId: 'bibi', profanity: false })).not.toBeNull()
    expect(gateLine(line('A historic victory for the legs.'), { personaId: 'bibi', profanity: false })).toBeNull()
    // lines from another pack (the supportive Professional tone) only answer to the global rules
    expect(gateLine(line('A historic victory for the legs.', { personaId: 'professional' }), { personaId: 'bibi', profanity: false })).not.toBeNull()
  })

  it('enforces the global guardrails and the profanity setting on every line', () => {
    const opts = { personaId: 'roast-comic', profanity: false }
    expect(gateLine(line('Pedal like your weight depends on it.', { personaId: 'roast-comic' }), opts)).toBeNull()
    expect(gateLine(line('Hell of an interval.', { personaId: 'roast-comic' }), opts)).toBeNull()
    expect(gateLine(line('Hell of an interval.', { personaId: 'roast-comic' }), { ...opts, profanity: true })).not.toBeNull()
    expect(gateLine(line('What the f*** was that.', { personaId: 'roast-comic' }), { ...opts, profanity: true })).toBeNull()
  })

  it('lets AI-written lines through the topic bans, and still applies the profanity setting', () => {
    const opts = { personaId: 'bibi', profanity: false }
    expect(gateLine(line('A historic victory for the legs.', { lineId: 'ai.idle_banter.1' }), opts)).not.toBeNull()
    expect(gateLine(line('Pedal off that belly.', { lineId: 'ai.idle_banter.2', personaId: 'roast-comic' }), opts)).not.toBeNull()
    expect(gateLine(line('Damn, that cadence.', { lineId: 'ai.idle_banter.3' }), opts)).toBeNull()
    expect(gateLine(line('Damn, that cadence.', { lineId: 'ai.idle_banter.3' }), { ...opts, profanity: true })).not.toBeNull()
  })

  it('never drops a safety line: it falls back to plain words', () => {
    const bad = line('Ease off, you sick puppy.', { personaId: 'professional', priority: PRIORITY.safety, trigger: 'distress' })
    expect(gateLine(bad, { personaId: 'bibi', profanity: false })).toMatchObject({ text: SAFETY_FALLBACK_TEXT, speech: SAFETY_FALLBACK_TEXT, priority: PRIORITY.safety })
  })

  it('textAllowed agrees with the gate', () => {
    expect(textAllowed('Hold 300 watts.', [], false)).toBe(true)
    expect(textAllowed('Damn, hold 300 watts.', [], false)).toBe(false)
    expect(textAllowed('Damn, hold 300 watts.', [], true)).toBe(true)
  })
})
