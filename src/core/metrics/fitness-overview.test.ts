import { describe, expect, it } from 'vitest'
import { fitnessOverview, type FitnessFacts } from './fitness-overview'

const base: FitnessFacts = { ctl: 55, atl: 70, tsb: -15, ctl42dAgo: 45, weeklyTss: [380, 400, 420, 410, 120], rides28d: 14, ftpW: 250, eftpW: 262 }

describe('fitnessOverview', () => {
  it('reads the numbers in plain words', () => {
    const t = fitnessOverview(base)
    expect(t).toContain('fitness (CTL')
    expect(t).toContain('is 55')
    expect(t).toContain('up 10 over six weeks')
    expect(t).toContain('productive kind of tired')
    expect(t).toContain('403 TSS a week')
    expect(t).toContain('and steadily')
    expect(t).toContain('a test is probably due')
  })

  it('says when there is nothing yet', () => {
    expect(fitnessOverview({ ...base, ctl: null, atl: null, tsb: null })).toMatch(/no rides/)
  })

  it('covers rested, very tired and an FTP set high', () => {
    expect(fitnessOverview({ ...base, tsb: 12 })).toContain('rested')
    expect(fitnessOverview({ ...base, tsb: -40 })).toContain('very tired')
    expect(fitnessOverview({ ...base, eftpW: 220 })).toContain('set a little high')
    expect(fitnessOverview({ ...base, ftpW: null })).toContain('set it or take a test')
    expect(fitnessOverview({ ...base, ctl42dAgo: null })).not.toContain('six weeks:')
  })
})
