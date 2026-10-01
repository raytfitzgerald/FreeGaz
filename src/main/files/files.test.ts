import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isAllowedExternal, isInside, isJpeg, sanitizeFileName, writeInto } from './files'

describe('file helpers', () => {
  it('sanitizes ride names into safe file names', () => {
    expect(sanitizeFileName('2026-09-29 0700 - Sweet Spot 3×15', 'fit')).toBe('2026-09-29 0700 - Sweet Spot 3×15.fit')
    expect(sanitizeFileName('../../etc/passwd', '.fit')).toBe('_.._etc_passwd.fit')
    expect(sanitizeFileName('a:b|c?', 'fit')).toBe('a_b_c_.fit')
    expect(sanitizeFileName('   ', 'fit')).toBe('ride.fit')
  })

  it('writes only inside the target folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'freegaz-files-'))
    const p = writeInto(dir, 'ride.fit', Uint8Array.from([1, 2, 3]))
    expect(readFileSync(p)).toEqual(Buffer.from([1, 2, 3]))
    expect(() => writeInto(dir, '../escape.fit', Uint8Array.from([1]))).toThrow()
  })

  it('knows inside the folder from next to it', () => {
    expect(isInside('/Users/r/Rides', '/Users/r/Rides/a.jpg')).toBe(true)
    expect(isInside('/Users/r/Rides', '/Users/r/Rides-old/a.jpg')).toBe(false)
    expect(isInside('/Users/r/Rides', '/Users/r/Rides/../secrets.jpg')).toBe(false)
  })

  it('recognises JPEG bytes', () => {
    expect(isJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe(true)
    expect(isJpeg(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
  })

  it('allows only https links to known hosts', () => {
    expect(isAllowedExternal('https://www.strava.com/upload/select')).toBe(true)
    expect(isAllowedExternal('https://connect.garmin.com/modern/import-data')).toBe(true)
    expect(isAllowedExternal('http://www.strava.com/')).toBe(false)
    expect(isAllowedExternal('https://ko-fi.com/someone')).toBe(true)
    expect(isAllowedExternal('https://evil.example/')).toBe(false)
    expect(isAllowedExternal('file:///etc/passwd')).toBe(false)
  })
})
