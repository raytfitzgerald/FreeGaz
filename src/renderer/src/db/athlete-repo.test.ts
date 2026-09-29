import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { athleteSnapshot, currentFtp, recordFtp, updateProfile } from './athlete-repo'

beforeEach(async () => {
  await db().delete()
  await db().open()
})

describe('athlete repo', () => {
  it('falls back to defaults with no data', async () => {
    expect(await athleteSnapshot()).toMatchObject({ ftpW: 200, weightKg: 75 })
  })

  it('returns the FTP effective at a given date', async () => {
    await recordFtp({ date: Date.UTC(2026, 0, 1), ftpW: 240, source: 'manual' })
    await recordFtp({ date: Date.UTC(2026, 5, 1), ftpW: 262, source: 'test-20min' })
    expect((await currentFtp(Date.UTC(2026, 2, 1)))?.ftpW).toBe(240)
    expect((await currentFtp(Date.UTC(2026, 8, 1)))?.ftpW).toBe(262)
    expect(await currentFtp(Date.UTC(2025, 0, 1))).toBeNull()
  })

  it('profile updates are effective-dated and merge with the previous entry', async () => {
    await updateProfile({ weightKg: 78, lthr: 168 })
    await new Promise((r) => setTimeout(r, 2))
    await updateProfile({ weightKg: 76.5 })
    const snap = await athleteSnapshot()
    expect(snap).toMatchObject({ weightKg: 76.5, lthr: 168 })
  })
})
