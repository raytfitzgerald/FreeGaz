import { beforeEach, describe, expect, it } from 'vitest'
import { ENTER_MS, HOP_MS, LEAVE_MS, OFFSTAGE, STILL_POSE, ToonMotion, headForLine, knee, resetHeadCycles, talkEstimateMs } from './motion'

/** Runs frames every 16 ms from `from` to `to` and returns the last pose (the cranks integrate). */
function run(m: ToonMotion, from: number, to: number, rpm: number | null = 80) {
  let pose = m.frame(from, rpm)
  for (let t = from + 16; t <= to; t += 16) pose = m.frame(t, rpm)
  return pose
}

describe('ToonMotion', () => {
  it('rides in from off-stage and settles in place', () => {
    const m = new ToonMotion({ enter: true })
    const first = m.frame(1000, 80)
    expect(first.x).toBeCloseTo(-OFFSTAGE, 0)
    const arrived = run(m, 1016, 1000 + ENTER_MS + 400)
    expect(Math.abs(arrived.x)).toBeLessThanOrEqual(3) // the gentle wander
  })

  it('is simply there when it does not enter', () => {
    const m = new ToonMotion({ enter: false })
    expect(Math.abs(m.frame(5000, 80).x)).toBeLessThanOrEqual(3)
  })

  it('hops, pops and wiggles when a new line starts', () => {
    const m = new ToonMotion({ enter: false })
    run(m, 0, 2000)
    m.line(2000, 'History will judge this interval.')
    const pop = m.frame(2016, 80)
    expect(pop.headScale).toBeLessThan(0.9)
    const mid = run(m, 2032, 2000 + HOP_MS / 2)
    expect(mid.y).toBeLessThan(-8)
    // the wiggle dies away, the hop is long over
    const later = run(m, 2000 + HOP_MS / 2 + 16, 2000 + 4000)
    expect(later.y).toBe(0)
    expect(later.headScale).toBeCloseTo(1, 3)
  })

  it('saves the first hop for when it arrives, if the line rode in with it', () => {
    const m = new ToonMotion({ enter: true })
    m.line(1000, 'Let me be very clear.')
    const riding = run(m, 1000, 1000 + ENTER_MS / 2)
    expect(riding.y).toBe(0)
    const landing = run(m, 1000 + ENTER_MS / 2 + 16, 1000 + ENTER_MS - 80 + HOP_MS / 2)
    expect(landing.y).toBeLessThan(-8)
  })

  it('flaps its jaw while talking, and only then', () => {
    const m = new ToonMotion({ enter: false })
    run(m, 0, 1000)
    let open = 0
    for (let t = 1016; t < 3000; t += 16) open = Math.max(open, m.frame(t, 80).jaw)
    expect(open).toBe(0) // no line, no talking
    m.line(3000, 'Weeks away from a new FTP. Weeks.')
    let max = 0
    for (let t = 3016; t < 4000; t += 16) max = Math.max(max, m.frame(t, 80).jaw)
    expect(max).toBeGreaterThan(0.8)
  })

  it('without a voice, talks for about as long as the line takes to say', () => {
    const text = 'I have drawn a red line at ninety five percent of your FTP.'
    const m = new ToonMotion({ enter: false })
    m.line(0, text)
    expect(m.talking(100)).toBe(true)
    expect(m.talking(talkEstimateMs(text) - 1)).toBe(true)
    expect(m.talking(talkEstimateMs(text) + 1)).toBe(false)
  })

  it('with a voice, talks exactly while the voice does', () => {
    const m = new ToonMotion({ enter: false })
    m.line(0, 'A short line.')
    m.speaking(true, 50)
    expect(m.talking(20_000)).toBe(true) // a long sentence, slowly said
    m.speaking(false, 20_000)
    expect(m.talking(20_001)).toBe(false) // done, even though the estimate never ran out
  })

  it('opens the jaw on each word when the voice reports words', () => {
    const m = new ToonMotion({ enter: false })
    m.line(0, 'Historic. Interval.')
    m.speaking(true, 0)
    run(m, 0, 1000)
    m.word(1000)
    const peak = run(m, 1016, 1048)
    expect(peak.jaw).toBeGreaterThan(0.6)
  })

  it('tells the same line twice without a second hop', () => {
    const m = new ToonMotion({ enter: false })
    m.lineFor(1, 0, 'Once.')
    run(m, 0, 2000)
    m.lineFor(1, 2000, 'Once.')
    expect(run(m, 2016, 2000 + HOP_MS / 2).y).toBe(0)
    m.lineFor(2, 3000, 'Twice.')
    expect(run(m, 3016, 3000 + HOP_MS / 2).y).toBeLessThan(-8)
  })

  it('rides off and fades, then says it is gone', () => {
    const m = new ToonMotion({ enter: false })
    run(m, 0, 1000)
    m.leave(1000)
    expect(m.gone(1000 + LEAVE_MS - 1)).toBe(false)
    run(m, 1016, 1000 + LEAVE_MS - 16)
    const end = m.frame(1000 + LEAVE_MS, 80)
    expect(end.x).toBeCloseTo(OFFSTAGE, 0)
    expect(end.opacity).toBeCloseTo(0, 5)
    expect(m.gone(1000 + LEAVE_MS)).toBe(true)
  })

  it('comes round again if a new line arrives while it is leaving', () => {
    const m = new ToonMotion({ enter: false })
    run(m, 0, 1000)
    m.leave(1000)
    run(m, 1016, 1300)
    m.line(1300, 'One more thing.')
    expect(m.frame(1316, 80).x).toBeCloseTo(-OFFSTAGE, 0)
    expect(m.gone(5000)).toBe(false)
  })

  it('pedals at the rider cadence, and coasts at zero', () => {
    const m = new ToonMotion({ enter: false })
    const a = run(m, 0, 1000, 60)
    const b = run(m, 1016, 2000, 60)
    // 60 rpm: one turn a second, so back where it started
    const turned = (b.crank - a.crank + 2 * Math.PI) % (2 * Math.PI)
    expect(Math.min(turned, 2 * Math.PI - turned)).toBeLessThan(0.3)
    const c = run(m, 2016, 3000, 0)
    const d = run(m, 3016, 4000, 0)
    expect(d.crank).toBeCloseTo(c.crank, 6)
  })

  it('has a still pose for reduced motion', () => {
    expect(STILL_POSE).toMatchObject({ x: 0, y: 0, jaw: 0, headRot: 0, headScale: 1, opacity: 1 })
  })
})

describe('talkEstimateMs', () => {
  it('is roughly a third of a second a word, within limits', () => {
    expect(talkEstimateMs('Go.')).toBe(1200)
    expect(talkEstimateMs('one two three four five six seven eight nine ten')).toBe(3300)
    expect(talkEstimateMs('word '.repeat(100))).toBe(7000)
  })
})

describe('headForLine', () => {
  beforeEach(resetHeadCycles)

  it('moves to the next head with every new line, round robin', () => {
    expect(headForLine('bibi', null, 3)).toBe(0)
    expect([1, 2, 3, 4].map((line) => headForLine('bibi', line, 3))).toEqual([1, 2, 0, 1])
  })

  it('gives the same head when asked about the same line again (StrictMode renders twice)', () => {
    expect(headForLine('bibi', 'a', 3)).toBe(1)
    expect(headForLine('bibi', 'a', 3)).toBe(1)
    expect(headForLine('bibi', null, 3)).toBe(1)
  })

  it('keeps a separate rotation per set', () => {
    headForLine('bibi', 1, 3)
    expect(headForLine('other', 1, 2)).toBe(1)
    expect(headForLine('bibi', 2, 3)).toBe(2)
  })
})

describe('knee', () => {
  it('keeps both bones at their length and bends forward', () => {
    const hip = { x: 0, y: 0 }
    const foot = { x: 5, y: 30 }
    const k = knee(hip, foot, 20, 18)
    expect(Math.hypot(k.x - hip.x, k.y - hip.y)).toBeCloseTo(20, 6)
    expect(Math.hypot(foot.x - k.x, foot.y - k.y)).toBeCloseTo(18, 6)
    expect(k.x).toBeGreaterThan(foot.x / 2)
  })

  it('straightens rather than breaking when the foot is out of reach', () => {
    const k = knee({ x: 0, y: 0 }, { x: 0, y: 100 }, 20, 18)
    expect(k.x).toBeCloseTo(0, 1)
    expect(k.y).toBeCloseTo(20, 3)
  })
})
