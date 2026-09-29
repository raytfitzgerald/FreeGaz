// What to do with an FTP test result: save it automatically, ask the rider,
// or leave FTP alone. Auto-save needs a valid test, a plausible change and a
// real (not simulated) ride; everything else is the rider's call.
import type { FtpTestProtocol } from '../workout/model'
import type { FtpTestResult } from '../workout/ftp-tests'

export type FtpUpdateAction = 'auto' | 'ask' | 'none'

export interface FtpUpdateDecision {
  action: FtpUpdateAction
  newFtpW: number
  /** Change vs the current FTP as a fraction (0.04 = +4 %), or null without one. */
  changePct: number | null
  /** Why the rider is being asked (or why nothing happens). */
  reasons: string[]
}

/** A drop bigger than this is confirmed by the rider (bad day, bad pacing, sick). */
export const MAX_AUTO_DROP = 0.03
/** A jump bigger than this is confirmed too (usually a pacing or sensor problem). */
export const MAX_AUTO_RISE = 0.15
/**
 * A result this far *below* the estimate from recent rides is confirmed: it
 * suggests a bad test day. (A result above it is plausible: recent rides are
 * usually sub-maximal, which drags the estimate down.)
 */
export const EFTP_TOLERANCE = 0.08

export function decideFtpUpdate(input: { result: FtpTestResult; currentFtpW: number | null; simulated: boolean; eftpW?: number | null }): FtpUpdateDecision {
  const newFtpW = Math.round(input.result.ftpW)
  const cur = input.currentFtpW
  const changePct = cur && cur > 0 ? (newFtpW - cur) / cur : null
  if (input.simulated) return { action: 'none', newFtpW, changePct, reasons: ['Simulated rides never change your FTP.'] }
  const reasons = [...(input.result.valid ? [] : input.result.problems)]
  if (changePct !== null && changePct < -MAX_AUTO_DROP) reasons.push(`That is ${Math.round(-changePct * 100)} % below your current FTP of ${cur} W.`)
  if (changePct !== null && changePct > MAX_AUTO_RISE) reasons.push(`That is ${Math.round(changePct * 100)} % above your current FTP of ${cur} W.`)
  const e = input.eftpW
  if (e && e > 0 && newFtpW < e * (1 - EFTP_TOLERANCE)) reasons.push(`Your recent rides point to about ${Math.round(e)} W.`)
  return { action: reasons.length > 0 ? 'ask' : 'auto', newFtpW, changePct, reasons }
}

export const FTP_SOURCE: Record<FtpTestProtocol, 'test-20min' | 'test-ramp' | 'test-8min' | 'test-kolie'> = {
  '20min': 'test-20min',
  ramp: 'test-ramp',
  '8min': 'test-8min',
  'kolie-moore': 'test-kolie',
}
