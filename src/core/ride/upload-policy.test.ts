import { describe, expect, it } from 'vitest'
import { MIN_UPLOAD_S, uploadSkipReason, uploadSkipText } from './upload-policy'

const ride = { simulated: false, movingS: 3600, hasFit: true, autoOn: true, connected: true }

describe('Strava auto-upload policy', () => {
  it('uploads a real ride when auto-upload is on and Strava is connected', () => {
    expect(uploadSkipReason(ride)).toBeNull()
    expect(uploadSkipText(null)).toBeNull()
  })

  it('says why a ride stayed home, most basic reason first', () => {
    expect(uploadSkipReason({ ...ride, simulated: true, movingS: 5 })).toBe('simulated')
    expect(uploadSkipReason({ ...ride, hasFit: false })).toBe('no-file')
    expect(uploadSkipReason({ ...ride, movingS: 12, autoOn: false })).toBe('short')
    expect(uploadSkipReason({ ...ride, autoOn: false, connected: false })).toBe('off')
    expect(uploadSkipReason({ ...ride, connected: false })).toBe('not-connected')
  })

  it('counts a full minute as long enough', () => {
    expect(uploadSkipReason({ ...ride, movingS: MIN_UPLOAD_S - 1 })).toBe('short')
    expect(uploadSkipReason({ ...ride, movingS: MIN_UPLOAD_S })).toBeNull()
  })

  it('leaves simulated rides to their own label', () => {
    expect(uploadSkipText('simulated')).toBeNull()
    expect(uploadSkipText('short')).toMatch(/under a minute/i)
  })
})
