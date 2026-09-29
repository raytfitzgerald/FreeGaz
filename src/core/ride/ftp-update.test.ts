import { describe, expect, it } from 'vitest'
import type { FtpTestResult } from '../workout/ftp-tests'
import { decideFtpUpdate } from './ftp-update'

const result = (ftpW: number, problems: string[] = []): FtpTestResult => ({ ftpW, basisW: ftpW / 0.95, basis: 'test', valid: problems.length === 0, problems })

describe('decideFtpUpdate', () => {
  it('auto-saves a valid, plausible result, rounded', () => {
    expect(decideFtpUpdate({ result: result(256.5), currentFtpW: 250, simulated: false })).toEqual({ action: 'auto', newFtpW: 257, changePct: 0.028, reasons: [] })
  })

  it('auto-saves the very first test, whatever the number', () => {
    expect(decideFtpUpdate({ result: result(310), currentFtpW: null, simulated: false }).action).toBe('auto')
  })

  it('asks before a drop of more than 3 % or a jump of more than 15 %', () => {
    const drop = decideFtpUpdate({ result: result(240), currentFtpW: 250, simulated: false })
    expect(drop.action).toBe('ask')
    expect(drop.reasons[0]).toMatch(/4 % below your current FTP of 250 W/)
    expect(decideFtpUpdate({ result: result(244), currentFtpW: 250, simulated: false }).action).toBe('auto')
    expect(decideFtpUpdate({ result: result(290), currentFtpW: 250, simulated: false }).reasons[0]).toMatch(/16 % above/)
  })

  it('asks when the test had problems or disagrees with recent rides', () => {
    const bad = decideFtpUpdate({ result: result(255, ['The effort is missing 12 s of power.']), currentFtpW: 250, simulated: false })
    expect(bad).toMatchObject({ action: 'ask', reasons: ['The effort is missing 12 s of power.'] })
    expect(decideFtpUpdate({ result: result(255), currentFtpW: 250, simulated: false, eftpW: 230 }).reasons[0]).toMatch(/about 230 W/)
    expect(decideFtpUpdate({ result: result(255), currentFtpW: 250, simulated: false, eftpW: 250 }).action).toBe('auto')
  })

  it('never touches FTP from a simulated ride', () => {
    expect(decideFtpUpdate({ result: result(255), currentFtpW: 250, simulated: true })).toMatchObject({ action: 'none', newFtpW: 255 })
  })
})
