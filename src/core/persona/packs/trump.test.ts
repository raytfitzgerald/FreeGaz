import { describe, expect, it } from 'vitest'
import { detectProfanity, violatesGuardrails } from '../guardrails'
import { TRUMP, TRUMP_BANNED_PATTERNS } from './trump'

const bannedHits = (text: string): string[] => TRUMP_BANNED_PATTERNS.filter((p) => p.test(text)).map((p) => `${p.source.slice(0, 40)}… → ${p.exec(text)?.[0] ?? ''}`)

describe('The Donald', () => {
  it('names itself and its style', () => {
    expect(TRUMP.meta).toMatchObject({
      id: 'trump',
      name: 'The Donald',
      tagline: 'Tremendous watts, the best intervals and a nickname for every excuse. Believe me.',
    })
  })

  it('touches none of the banned topics: religion, race, borders, war, elections, courts, women, age, looks or other real people', () => {
    const hits = TRUMP.lines.flatMap((l) => bannedHits(l.text).map((h) => `${l.id}: ${h} in "${l.text}"`))
    expect(hits).toEqual([])
    // the persona's own name never appears in its lines either
    expect(TRUMP.lines.filter((l) => /trump|donald/i.test(l.text))).toEqual([])
  })

  it('passes the global guardrails and never swears', () => {
    expect(TRUMP.lines.filter((l) => violatesGuardrails(l.text) !== null).map((l) => l.id)).toEqual([])
    expect(TRUMP.lines.filter((l) => l.profanity === true || detectProfanity(l.text) !== null).map((l) => l.id)).toEqual([])
  })

  it('stays on the requested public-rhetoric riffs', () => {
    const texts = TRUMP.lines.map((l) => l.text)
    expect(texts).toContain("We're going to make your FTP great again. It hasn't been great for a while, frankly.")
    expect(texts).toContain("Skipped it? You're fired. Just kidding. Mostly.")
    expect(texts).toContain("I'm putting a two hundred percent tariff on coasting. Effective immediately.")
    const count = (re: RegExp): number => texts.filter((t) => re.test(t)).length
    expect(count(/tremendous/i)).toBeGreaterThanOrEqual(10)
    expect(count(/believe me/i)).toBeGreaterThanOrEqual(8)
    expect(count(/beautiful/i)).toBeGreaterThanOrEqual(12)
    expect(count(/\bthe best\b/i)).toBeGreaterThanOrEqual(10)
    expect(count(/\bnobody\b/i)).toBeGreaterThanOrEqual(8)
    expect(count(/many people|everybody says|people are saying/i)).toBeGreaterThanOrEqual(8)
    expect(count(/fake news/i)).toBeGreaterThanOrEqual(6)
    expect(count(/low energy/i)).toBeGreaterThanOrEqual(4)
    expect(count(/\bsad\b/i)).toBeGreaterThanOrEqual(4)
    expect(count(/you're fired/i)).toBeGreaterThanOrEqual(3)
    expect(count(/winning/i)).toBeGreaterThanOrEqual(4)
    expect(count(/great again/i)).toBeGreaterThanOrEqual(3)
    expect(count(/thank you for your attention to this matter/i)).toBeGreaterThanOrEqual(4)
    expect(count(/\bsir\b/i)).toBeGreaterThanOrEqual(4)
    expect(count(/could be so complicated/i)).toBeGreaterThanOrEqual(3)
    expect(count(/tariff/i)).toBeGreaterThanOrEqual(2)
  })

  it('has banned patterns that catch what it must never say', () => {
    const forbidden = [
      'Pray for more watts.',
      'God bless this interval.',
      'Make America pedal again.',
      'Build the wall of watts.',
      'Hold the border at 300 watts.',
      'Deport your excuses.',
      'This interval is illegal. Very illegal.',
      'Your cadence is a witch hunt.',
      'The power meter is rigged.',
      'Stop the steal of my watts!',
      'Fight, fight, fight!',
      'Vote for more watts.',
      'Four more years of intervals!',
      'The best president of intervals.',
      'Welcome to the Oval Office of pain.',
      'Lock her up. The cadence, I mean.',
      'Crooked cadence.',
      'Sleepy Joe would never hold this.',
      'Even Melania holds 200 watts.',
      'Ivanka says pedal.',
      'Kim would love this interval.',
      'Bibi and I agree: pedal.',
      'Drain the swamp of lactate.',
      'Grab the handlebars.',
      'This is a total hoax.',
      'The fake media hate this interval.',
      'The failing trainer.',
      'Nice hair on that sprint.',
      'Your legs look old today.',
      'At your age, 200 watts is fine.',
      'Tiny hands on the hoods.',
      'Tremendous stamina, unlike some people.',
      'Terrible, like a hurricane of bombs.',
      'Strike the pedals!',
      'This climb is a war.',
      'Canada will be the 51st state of your FTP.',
      'China is stealing your watts.',
      'Mar-a-Lago recovery ride.',
      'The judge hates this interval.',
      'You are guilty of coasting.',
      'Ladies love a high cadence, and so does every woman.',
    ]
    const missed = forbidden.filter((t) => bannedHits(t).length === 0)
    expect(missed).toEqual([])
  })

  it('allows the requested rhetoric', () => {
    const allowed = [
      "We're going to make your FTP great again.",
      "You're fired!",
      'It is going to be a big, beautiful interval.',
      'Nobody knew sweet spot could be so complicated.',
      'I have concepts of a plan.',
      'Thank you for your attention to this matter!',
      'Many people are saying it. Believe me.',
      "A big, strong guy came up to me, tears in his eyes. 'Sir...'",
      'Low energy. Sad!',
      'Your excuse is fake news.',
      "I'm putting a tariff on coasting.",
      'I drew it on the chart myself. With a Sharpie.',
      "I don't like windmills.",
      'Despite the constant negative covfefe.',
      'The golden age of your FTP.',
      'We are going to win so much, you will get tired of winning.',
    ]
    expect(allowed.flatMap((t) => bannedHits(t).map((h) => `${t}: ${h}`))).toEqual([])
  })
})
