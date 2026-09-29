import { describe, expect, it } from 'vitest'
import { bracesBalanced, buildFacts, formatDuration, formatFact, placeholdersOf, renderTemplate, toSpeech } from './template'
import type { CoachContext } from './types'

const ctx = (data: CoachContext['data'], extra: Partial<CoachContext> = {}): CoachContext => ({
  now: 0,
  trigger: 'halfway',
  data,
  rideKind: 'workout',
  ...extra,
})

describe('formatDuration', () => {
  it('says seconds below a minute and m:ss from 60 s', () => {
    expect(formatDuration(0)).toBe('0 seconds')
    expect(formatDuration(1)).toBe('1 second')
    expect(formatDuration(45)).toBe('45 seconds')
    expect(formatDuration(59.4)).toBe('59 seconds')
    expect(formatDuration(59.6)).toBe('1:00')
    expect(formatDuration(60)).toBe('1:00')
    expect(formatDuration(125)).toBe('2:05')
    expect(formatDuration(1500)).toBe('25:00')
    expect(formatDuration(3723)).toBe('1:02:03')
  })
})

describe('formatFact', () => {
  it('rounds watts and other plain numbers to integers', () => {
    expect(formatFact('power', 287.6)).toBe('288')
    expect(formatFact('targetW', 300)).toBe('300')
    expect(formatFact('projectedFtp', 286.5)).toBe('287')
    expect(formatFact('hr', 171.2)).toBe('171')
    expect(formatFact('pct', -0.2)).toBe('0')
  })

  it('formats every key ending in S as a duration', () => {
    expect(formatFact('remainingS', 125)).toBe('2:05')
    expect(formatFact('remainingS', 45)).toBe('45 seconds')
    expect(formatFact('durationS', 300)).toBe('5:00')
  })

  it('keeps two decimals for ratios', () => {
    expect(formatFact('intensityFactor', 0.853)).toBe('0.85')
    expect(formatFact('peakWkg', 4.567)).toBe('4.57')
  })

  it('refuses non-positive values for magnitudes like deficitW', () => {
    expect(formatFact('deficitW', 12.4)).toBe('12')
    expect(formatFact('deficitW', 0.4)).toBeNull()
    expect(formatFact('deficitW', -8)).toBeNull()
    expect(formatFact('ftpGain', 0)).toBeNull()
    expect(formatFact('repsLeft', 0)).toBeNull()
  })

  it('trims strings and rejects empty or overlong ones', () => {
    expect(formatFact('segmentLabel', '  VO2   #3 ')).toBe('VO2 #3')
    expect(formatFact('segmentLabel', '   ')).toBeNull()
    expect(formatFact('segmentLabel', 'x'.repeat(81))).toBeNull()
    expect(formatFact('erg', true)).toBe('yes')
    expect(formatFact('power', Number.NaN)).toBeNull()
  })
})

describe('placeholders', () => {
  it('lists placeholders and checks braces', () => {
    expect(placeholdersOf('Hold {targetW} for {remainingS}.')).toEqual(['targetW', 'remainingS'])
    expect(bracesBalanced('Hold {targetW}.')).toBe(true)
    expect(bracesBalanced('Hold {targetW.')).toBe(false)
    expect(bracesBalanced('Hold targetW}.')).toBe(false)
    expect(bracesBalanced('Hold {1bad}.')).toBe(false)
  })

  it('renders only when every placeholder is present', () => {
    const facts = buildFacts(ctx({ power: 287.6, targetW: 300, remainingS: 125 }))
    expect(renderTemplate('{power} of {targetW}, {remainingS} left', facts)).toBe('288 of 300, 2:05 left')
    expect(renderTemplate('{power} at {cadence} rpm', facts)).toBeNull()
    expect(renderTemplate('No placeholders.', facts)).toBe('No placeholders.')
  })
})

describe('buildFacts', () => {
  it('drops missing values: null, undefined and NaN are not zero', () => {
    const facts = buildFacts(ctx({ power: null, hr: undefined, cadence: Number.NaN, targetW: 300 }))
    expect(facts.power).toBeUndefined()
    expect(facts.hr).toBeUndefined()
    expect(facts.cadence).toBeUndefined()
    expect(facts.pct).toBeUndefined()
    expect(facts.targetW).toBe(300)
  })

  it('derives percentages, gaps, torque, FTP deltas and reps left', () => {
    const facts = buildFacts(
      ctx({ power: 270, targetW: 300, cadence: 90, cadenceAvg: 95, ftpOld: 275, ftpNew: 287, projectedFtp: 290, rep: 3, reps: 5, elapsedS: 1830 }),
    )
    expect(facts.pct).toBe(90)
    expect(facts.deficitW).toBe(30)
    expect(facts.surplusW).toBe(-30)
    expect(facts.pctUnder).toBe(10)
    expect(facts.cadenceDrop).toBe(5)
    expect(facts.torqueNm).toBeCloseTo(28.65, 1)
    expect(facts.ftpGain).toBe(12)
    expect(facts.ftpDrop).toBe(-12)
    expect(facts.projectedGain).toBe(15)
    expect(facts.repsLeft).toBe(2)
    expect(facts.elapsedMin).toBe(30)
  })

  it('derives hard from the segment kind unless the caller says otherwise', () => {
    expect(buildFacts(ctx({ segmentKind: 'maxeffort' })).hard).toBe(true)
    expect(buildFacts(ctx({ segmentKind: 'off' })).hard).toBe(false)
    expect(buildFacts(ctx({ segmentKind: 'steady', hard: true })).hard).toBe(true)
  })

  it('lets caller values win and copies context facts', () => {
    const facts = buildFacts(ctx({ power: 270, targetW: 300, pct: 85 }, { rideKind: 'ftp-test', intensityFactor: 0.91 }))
    expect(facts.pct).toBe(85)
    expect(facts.pctUnder).toBe(15)
    expect(facts.rideKind).toBe('ftp-test')
    expect(facts.intensityFactor).toBe(0.91)
  })
})

describe('toSpeech', () => {
  it('spells out durations and metric names for TTS', () => {
    expect(toSpeech('2:05 to go')).toBe('2 minutes 5 seconds to go')
    expect(toSpeech('Hold for 1:00.')).toBe('Hold for 1 minute.')
    expect(toSpeech('1:02:03 left')).toBe('1 hour 2 minutes 3 seconds left')
    expect(toSpeech('W′bal at 18%.')).toBe('W prime balance at 18%.')
    expect(toSpeech('3.4 W/kg and 820 kJ at 31 N·m')).toBe('3.4 watts per kilo and 820 kilojoules at 31 newton meters')
    expect(toSpeech('Hold 300 watts.')).toBe('Hold 300 watts.')
  })
})
