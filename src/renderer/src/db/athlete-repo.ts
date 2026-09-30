// Athlete profile + FTP history. Both are effective-dated so any ride can be
// re-analysed with the values that applied on the day it was ridden.
import type { AthleteSnapshot } from '@core/ride/types'
import { db, type FtpEntry, type ProfileEntry } from './db'

export const DEFAULT_FTP_W = 200
export const DEFAULT_WEIGHT_KG = 75

export async function ftpHistory(): Promise<FtpEntry[]> {
  return db().ftpHistory.orderBy('date').toArray()
}

// These read the whole date index and filter in JS, rather than
// where(...).belowOrEqual(at): a live query only watches the range it read,
// and a bounded range ends at the moment it first ran, so an edit saved a
// moment later (dated now) was never seen and the Settings fields snapped back.
export async function currentFtp(at = Date.now()): Promise<FtpEntry | null> {
  return (await db().ftpHistory.orderBy('date').reverse().filter((r) => r.date <= at).first()) ?? null
}

export async function recordFtp(entry: Omit<FtpEntry, 'id'>): Promise<number> {
  return db().ftpHistory.add(entry) as Promise<number>
}

export async function deleteFtp(id: number): Promise<void> {
  await db().ftpHistory.delete(id)
}

export async function currentProfile(at = Date.now()): Promise<ProfileEntry | null> {
  return (await db().profile.orderBy('from').reverse().filter((r) => r.from <= at).first()) ?? null
}

/** Updates the profile from now on (older rides keep their snapshot). */
/** Profile saves, one after another (see updateProfile). */
let profileWrites: Promise<unknown> = Promise.resolve()

export function updateProfile(patch: Partial<Omit<ProfileEntry, 'id' | 'from'>>): Promise<ProfileEntry> {
  // one read-modify-write at a time: two quick edits (weight, then max HR) must not each start from the old row
  const run = profileWrites.then(async () => {
    const cur = await currentProfile()
    // two edits in one millisecond tie on `from`; the index then orders them by id, so the later one wins
    const next: ProfileEntry = { weightKg: DEFAULT_WEIGHT_KG, ...cur, ...patch, from: Date.now() }
    delete next.id
    const id = await db().profile.add(next)
    return { ...next, id: id as number }
  })
  profileWrites = run.catch(() => undefined)
  return run
}

/** Values to freeze into a ride at its start. */
export async function athleteSnapshot(at = Date.now()): Promise<AthleteSnapshot> {
  const [ftp, profile] = await Promise.all([currentFtp(at), currentProfile(at)])
  return {
    ftpW: ftp?.ftpW ?? DEFAULT_FTP_W,
    weightKg: profile?.weightKg ?? DEFAULT_WEIGHT_KG,
    lthr: profile?.lthr,
    maxHr: profile?.maxHr,
    restHr: profile?.restHr,
    cpW: profile?.cpW,
    wPrimeJ: profile?.wPrimeJ,
  }
}
