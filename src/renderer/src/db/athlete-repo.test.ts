import 'fake-indexeddb/auto'
import { liveQuery } from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { athleteSnapshot, currentFtp, currentProfile, recordFtp, updateProfile } from './athlete-repo'

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

  it('a live query of the current profile and FTP sees edits saved after it started (the Settings fields)', async () => {
    await updateProfile({ weightKg: 78, lthr: 160 })
    const seen: (number | undefined)[] = []
    const ftps: (number | undefined)[] = []
    const a = liveQuery(() => currentProfile()).subscribe({ next: (p) => seen.push(p?.lthr) })
    const b = liveQuery(() => currentFtp()).subscribe({ next: (f) => ftps.push(f?.ftpW) })
    await new Promise((r) => setTimeout(r, 20))
    await updateProfile({ lthr: 171 })
    await recordFtp({ date: Date.now(), ftpW: 255, source: 'manual' })
    await new Promise((r) => setTimeout(r, 50))
    a.unsubscribe()
    b.unsubscribe()
    expect(seen.at(-1)).toBe(171)
    expect(ftps.at(-1)).toBe(255)
  })

  it('two edits in the same millisecond keep the later one', async () => {
    await updateProfile({ maxHr: 191 })
    await updateProfile({ maxHr: 192 })
    expect((await currentProfile())?.maxHr).toBe(192)
  })

  it('edits started together all land', async () => {
    await Promise.all([updateProfile({ maxHr: 188 }), updateProfile({ weightKg: 72.5 }), updateProfile({ lthr: 165 })])
    expect(await currentProfile()).toMatchObject({ maxHr: 188, weightKg: 72.5, lthr: 165 })
  })
})
