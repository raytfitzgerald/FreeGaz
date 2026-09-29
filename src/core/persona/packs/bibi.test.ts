import { describe, expect, it } from 'vitest'
import { detectProfanity, violatesGuardrails } from '../guardrails'
import { BIBI, BIBI_BANNED_PATTERNS } from './bibi'

const bannedHits = (text: string): string[] => BIBI_BANNED_PATTERNS.filter((p) => p.test(text)).map((p) => `${p.source.slice(0, 40)}… → ${p.exec(text)?.[0] ?? ''}`)

describe('the Bibi parody', () => {
  it('is labeled as a parody with the required disclaimer', () => {
    expect(BIBI.meta).toMatchObject({
      id: 'bibi',
      name: 'Bibi',
      parody: true,
      disclaimer: 'Parody. Not affiliated with or endorsed by Benjamin Netanyahu.',
    })
  })

  it('touches none of the banned topics: religion, heritage, land, ethnicity, war, the trial or other real people', () => {
    const hits = BIBI.lines.flatMap((l) => bannedHits(l.text).map((h) => `${l.id}: ${h} in "${l.text}"`))
    expect(hits).toEqual([])
    // the persona's own name never appears in its lines either
    expect(BIBI.lines.filter((l) => /netanyahu|benjamin/i.test(l.text))).toEqual([])
  })

  it('passes the global guardrails and never swears', () => {
    expect(BIBI.lines.filter((l) => violatesGuardrails(l.text) !== null).map((l) => l.id)).toEqual([])
    expect(BIBI.lines.filter((l) => l.profanity === true || detectProfanity(l.text) !== null).map((l) => l.id)).toEqual([])
  })

  it('stays on the requested public-rhetoric riffs', () => {
    const texts = BIBI.lines.map((l) => l.text)
    expect(texts).toContain('This interval is weeks away from a nuclear weapon.')
    expect(texts).toContain('Your FTP is months away from a breakthrough.')
    expect(texts).toContain('I have drawn a red line at {targetW} watts.')
    const count = (re: RegExp): number => texts.filter((t) => re.test(t)).length
    expect(count(/red line/i)).toBeGreaterThanOrEqual(10)
    expect(count(/\b(?:weeks|months) away\b/i)).toBeGreaterThanOrEqual(8)
    expect(count(/standing ovation/i)).toBeGreaterThanOrEqual(5)
    expect(count(/fake news/i)).toBeGreaterThanOrEqual(10)
    expect(count(/let me be very clear/i)).toBeGreaterThanOrEqual(8)
    expect(count(/\bchart\b/i)).toBeGreaterThanOrEqual(10)
    expect(count(/cartoon bomb/i)).toBeGreaterThanOrEqual(1)
    expect(count(/longest-serving/i)).toBeGreaterThanOrEqual(2)
    expect(count(/histor(?:y|ic)/i)).toBeGreaterThanOrEqual(10)
  })

  it('has banned patterns that catch what the parody must never say', () => {
    const forbidden = [
      'Pray for more watts.',
      'This climb is our promised land.',
      'Hold the border at 300 watts.',
      'Not one inch of this interval will be given up.',
      'Total victory over this climb.',
      'The IDF of intervals.',
      'Bring the hostages home, then pedal.',
      'Faster than a missile.',
      'Strike the pedals!',
      'Your cadence is my Iron Dome.',
      'Three thousand years of history in this pedal stroke.',
      'Jerusalem would be proud.',
      'For the nation!',
      'The Jewish people pedal on.',
      'Even Trump would hold this.',
      'My wife Sara says pedal.',
      'The trial can wait. The interval cannot.',
      'Pass the champagne and the cigars.',
      'Gifts are not watts.',
      'This is war on your FTP.',
      'On October 7...',
      'Gaza',
      'The Iranian regime of intervals.',
      'Mossad-level pacing.',
      'The security cabinet has approved this interval.',
      'Weapons-grade watts.',
      'Go nuclear on this sprint.',
      'A bombing run of an interval.',
      'The enemy is your cadence.',
      'An existential threat to your FTP.',
      'Never again will you skip.',
      'Welcome to the Knesset of pain.',
      'The media hate this interval.',
      'Peace through watts.',
      'Settle into the interval.',
      'This country needs your watts.',
      'The land of intervals.',
      'Ancient wisdom says pedal.',
      'Chosen for greatness.',
      'Fight for every watt.',
    ]
    const missed = forbidden.filter((t) => bannedHits(t).length === 0)
    expect(missed).toEqual([])
  })

  it('allows the requested rhetoric', () => {
    const allowed = [
      'This interval is weeks away from a nuclear weapon.',
      'I held up a chart with a cartoon bomb at the UN.',
      'At the United Nations, I drew a red line.',
      'Twenty-nine standing ovations in Congress.',
      'As the longest-serving coach, let me be very clear.',
      'Your excuse is fake news.',
      'History will judge this interval.',
    ]
    expect(allowed.flatMap((t) => bannedHits(t).map((h) => `${t}: ${h}`))).toEqual([])
  })
})
