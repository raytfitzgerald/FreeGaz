// Athlete profile + FTP history. Both are effective-dated so any ride can be
// re-analysed with the values that applied on the day it was ridden.
import type { AthleteSnapshot } from '@core/ride/types'
import { db, type FtpEntry, type ProfileEntry } from './db'

export const DEFAULT_FTP_W = 200
export const DEFAULT_WEIGHT_KG = 75

export async function ftpHistory(): Promise<FtpEntry[]> {
  return db().ftpHistory.orderBy('date').toArray()
}

export async function currentFtp(at = Date.now()): Promise<FtpEntry | null> {
  const rows = await db().ftpHistory.where('date').belowOrEqual(at).reverse().sortBy('date')
  return rows[0] ?? null
}

export async function recordFtp(entry: Omit<FtpEntry, 'id'>): Promise<number> {
  return db().ftpHistory.add(entry) as Promise<number>
}

export async function deleteFtp(id: number): Promise<void> {
  await db().ftpHistory.delete(id)
}

export async function currentProfile(at = Date.now()): Promise<ProfileEntry | null> {
  const rows = await db().profile.where('from').belowOrEqual(at).reverse().sortBy('from')
  return rows[0] ?? null
}

/** Updates the profile from now on (older rides keep their snapshot). */
export async function updateProfile(patch: Partial<Omit<ProfileEntry, 'id' | 'from'>>): Promise<ProfileEntry> {
  const cur = await currentProfile()
  const next: ProfileEntry = { weightKg: DEFAULT_WEIGHT_KG, ...cur, ...patch, from: Date.now() }
  delete next.id
  const id = await db().profile.add(next)
  return { ...next, id: id as number }
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
