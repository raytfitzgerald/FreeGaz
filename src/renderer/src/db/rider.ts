// The rider's name and photo, for their head on the ride-along bike and the
// home velodrome. Kept on this Mac (IndexedDB, included in backups), never
// sent anywhere. The photo is cropped to a small square JPEG as it's chosen.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'

const KEY = 'rider.identity'
export const PHOTO_PX = 160
export const MAX_NAME = 40

export interface RiderIdentity {
  name: string | null
  /** A data: URL, or null. */
  photo: string | null
}

const EMPTY: RiderIdentity = { name: null, photo: null }

export function useRider(): RiderIdentity {
  return useLiveQuery(() => db().kv.get(KEY).then((r) => ({ ...EMPTY, ...(r?.value as Partial<RiderIdentity> | undefined) })), []) ?? EMPTY
}

export async function saveRider(patch: Partial<RiderIdentity>): Promise<void> {
  const cur = ((await db().kv.get(KEY))?.value as Partial<RiderIdentity> | undefined) ?? {}
  const next = { ...EMPTY, ...cur, ...patch }
  if (next.name !== null) next.name = next.name.trim().slice(0, MAX_NAME) || null
  await db().kv.put({ key: KEY, value: next })
}

/** "Ray Fitzgerald" → "RF"; nothing → "You". */
export function riderInitials(name: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  return words.length === 0 ? 'You' : words.slice(0, 2).map((w) => [...w][0]!.toUpperCase()).join('')
}

/** The centre square of an image file, scaled to PHOTO_PX, as a JPEG data URL. */
export async function photoFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.')
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = PHOTO_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read the image.')
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_PX, PHOTO_PX)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}
