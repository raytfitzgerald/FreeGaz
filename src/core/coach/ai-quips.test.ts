import { describe, expect, it } from 'vitest'
import { BIBI, ROAST_COMIC } from '../persona/packs'
import { WorkoutPlan } from '../ride/workout-plan'
import { BUILTIN_WORKOUTS } from '../workout/builtins'
import { FTP_TEST_20MIN } from '../workout/ftp-tests'
import type { Workout } from '../workout/model'
import { AI_LINE_WEIGHT, MAX_AI_LINES, QUIP_TRIGGERS, quipLinesFromPack, quipPackPrompt, workoutStructure } from './ai-quips'
import { workoutSegments, type CoachSegment } from './segments'

const builtin = (id: string): Workout => BUILTIN_WORKOUTS.find((w) => w.id === `builtin:${id}`)!

function segmentsOf(w: Workout): CoachSegment[] {
  const resolve = workoutSegments(new WorkoutPlan(w, { ftpW: 250 }))
  const out: CoachSegment[] = []
  for (let i = 0; resolve(i); i++) out.push(resolve(i)!)
  return out
}

const pack = (lines: { trigger: string; text: string }[]) => ({ lines: [...lines, ...FILLER] })
// the schema wants at least five lines; these are clean and always accepted
const FILLER = [
  { trigger: 'idle_banter', text: 'Smooth circles, champ. The trainer is listening.' },
  { trigger: 'ride_start', text: 'Welcome back to the cave. Warm up like you mean it.' },
  { trigger: 'halfway', text: 'Halfway. {remainingS} to go. Stay greedy.' },
  { trigger: 'pr', text: 'A new record. Frame it.' },
  { trigger: 'workout_complete', text: 'Done. The fan can rest now.' },
]

describe('quipPackPrompt', () => {
  it('describes the persona and the ride', () => {
    const p = quipPackPrompt(ROAST_COMIC.meta, { spice: 4, profanity: true }, { kind: 'workout', name: 'VO2 Max 5×4', durationS: 3900, structure: '5 × 4:00 at 115 % FTP' })
    expect(p).toContain('Persona: Roast Comic')
    expect(p).toContain('Spice level 4/5')
    expect(p).toContain('No language restrictions.')
    expect(p).toContain('a structured workout called "VO2 Max 5×4", 65 minutes')
    expect(p).toContain('Main work: 5 × 4:00 at 115 % FTP.')
    expect(p).not.toContain('parody')
  })

  it('passes the ride name and the profanity setting through', () => {
    const p = quipPackPrompt(BIBI.meta, { spice: 5, profanity: true }, { kind: 'workout', name: 'Battle of the Bulge', durationS: 3600, structure: null })
    expect(p).toContain('No language restrictions.')
    expect(p).toContain('called "Battle of the Bulge"')
    expect(quipPackPrompt(ROAST_COMIC.meta, { spice: 3, profanity: false }, { kind: 'free', name: 'Fat Burner', durationS: null, structure: null })).toContain('called "Fat Burner"')
  })
})

describe('workoutStructure', () => {
  it('sums up the hard work in order', () => {
    expect(workoutStructure(segmentsOf(builtin('vo2max-5x4')))).toBe('2 × 30 seconds at 110 % FTP; 5 × 4:00 at 115 % FTP')
    expect(workoutStructure(segmentsOf(builtin('sprints-6x15')))).toBe('6 × 15 seconds all-out')
    expect(workoutStructure(segmentsOf(FTP_TEST_20MIN))).toBe('5:00 all-out; 20:00 test effort')
    expect(workoutStructure(segmentsOf(builtin('endurance-60')))).toBeNull()
  })
})

describe('quipLinesFromPack', () => {
  const opts = { persona: ROAST_COMIC.meta, spice: 4, profanity: false }

  it('turns clean lines into templates at the ride spice', () => {
    const { lines, rejected } = quipLinesFromPack(pack([{ trigger: 'segment_start', text: 'Here we go: {targetW} watts. No bargaining.' }]), opts)
    expect(rejected).toEqual([])
    expect(lines[0]).toEqual({
      id: 'ai.segment_start.1',
      text: 'Here we go: {targetW} watts. No bargaining.',
      triggers: ['segment_start'],
      spice: 4,
      // an interval start, never a warmup or a recovery
      criteria: [{ key: 'hard', op: '==', value: true }],
      weight: AI_LINE_WEIGHT,
    })
    expect(lines.map((l) => l.id)).toEqual(['ai.segment_start.1', 'ai.idle_banter.1', 'ai.ride_start.1', 'ai.halfway.1', 'ai.pr.1', 'ai.workout_complete.1'])
  })

  it('drops anything off-brief, too sweary or unspeakable, and keeps the rest', () => {
    const bad = [
      { trigger: 'distress', text: 'Keep going, you are fine.' },
      { trigger: 'made_up', text: 'Nice.' },
      { trigger: 'under_target', text: 'You are {pwoer} short.' },
      { trigger: 'under_target', text: 'Missing a brace {power.' },
      { trigger: 'idle_banter', text: 'Pedal off that belly, big guy.' },
      { trigger: 'idle_banter', text: 'Is that your asthma talking?' },
      { trigger: 'idle_banter', text: 'This is a war on watts.' },
      { trigger: 'idle_banter', text: 'Holy smokes, pedal.' },
      { trigger: 'idle_banter', text: 'What the f*** is this pace.' },
      { trigger: 'idle_banter', text: 'Damn, that cadence.' },
      { trigger: 'idle_banter', text: 'Follow me at https://example.com for tips.' },
      { trigger: 'idle_banter', text: 'Faster! 🔥🔥' },
      { trigger: 'idle_banter', text: 'Smooth circles, champ. The trainer is listening.' },
    ]
    const { lines, rejected } = quipLinesFromPack(pack(bad), opts)
    expect(rejected.map((r) => r.reason)).toEqual(['trigger', 'trigger', 'placeholder', 'placeholder', 'profanity', 'profanity', 'unspeakable', 'unspeakable', 'duplicate'])
    expect(lines.map((l) => l.text)).toContain('Pedal off that belly, big guy.')
    expect(lines.map((l) => l.text)).toContain('This is a war on watts.')
  })

  it('keeps profanity, mild and strong, only when the rider allows it', () => {
    const allowed = quipLinesFromPack(
      pack([
        { trigger: 'idle_banter', text: 'Damn, that cadence.' },
        { trigger: 'under_target', text: 'What the fuck is this pace.' },
      ]),
      { ...opts, profanity: true },
    )
    expect(allowed.lines.find((l) => l.text.startsWith('Damn'))).toMatchObject({ profanity: true })
    expect(allowed.lines.find((l) => l.text.includes('fuck'))).toMatchObject({ profanity: true })
    expect(quipLinesFromPack(pack([{ trigger: 'idle_banter', text: 'What the fuck is this pace.' }]), opts).rejected.map((r) => r.reason)).toEqual(['profanity'])
  })

  it('keeps lines the topic list used to drop, and still honors the profanity setting', () => {
    const bibi = { persona: BIBI.meta, spice: 5, profanity: true }
    const { lines, rejected } = quipLinesFromPack(
      pack([
        { trigger: 'segment_start', text: 'I have drawn a red line at {targetW} watts. Again.' },
        { trigger: 'halfway', text: 'Halfway. A historic victory is near.' },
        { trigger: 'idle_banter', text: 'My friends, this cadence is under siege by the enemy.' },
        { trigger: 'idle_banter', text: 'This interval is protected by the iron dome of my charts.' },
        { trigger: 'idle_banter', text: 'Damn fine chart, if I say so myself.' },
      ]),
      bibi,
    )
    expect(rejected).toEqual([])
    expect(lines.map((l) => l.text)).toEqual([
      'I have drawn a red line at {targetW} watts. Again.',
      'Halfway. A historic victory is near.',
      'My friends, this cadence is under siege by the enemy.',
      'This interval is protected by the iron dome of my charts.',
      'Damn fine chart, if I say so myself.',
      ...FILLER.map((l) => l.text),
    ])
    expect(lines.find((l) => l.text.startsWith('Damn'))).toMatchObject({ profanity: true })
  })

  it('rejects malformed replies outright and caps the pack', () => {
    expect(quipLinesFromPack({ lines: 'nope' }, opts)).toEqual({ lines: [], rejected: [] })
    expect(quipLinesFromPack(null, opts)).toEqual({ lines: [], rejected: [] })
    const many = Array.from({ length: 80 }, (_, i) => ({ trigger: QUIP_TRIGGERS[i % QUIP_TRIGGERS.length]!, text: `Line number ${i} of the pack.` }))
    expect(quipLinesFromPack({ lines: many }, opts).lines).toHaveLength(MAX_AI_LINES)
  })
})
