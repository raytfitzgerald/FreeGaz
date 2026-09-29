// Full backup / restore of the local database as a zip (fflate). Typed-array
// streams are stored as base64 so the round trip is lossless.
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import type { RideStreams } from '@core/ride/streams'
import { db } from './db'

export const BACKUP_FORMAT = 'freegaz-backup'
export const BACKUP_VERSION = 1

type TypedKey = Exclude<keyof RideStreams, 'rideId' | 'length'>
const TYPED: Record<TypedKey, 'f64' | 'f32' | 'u16' | 'u32'> = {
  ts: 'f64',
  power: 'f32',
  cadence: 'f32',
  hr: 'f32',
  speed: 'f32',
  distance: 'f32',
  altitude: 'f32',
  grade: 'f32',
  targetW: 'f32',
  lrBalance: 'f32',
  coreTemp: 'f32',
  skinTemp: 'f32',
  smo2: 'f32',
  lap: 'u16',
  rr: 'f32',
  rrOffsets: 'u32',
}

const b64 = (u8: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s)
}
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

function encodeStreams(s: RideStreams): Record<string, unknown> {
  const out: Record<string, unknown> = { rideId: s.rideId, length: s.length }
  for (const k of Object.keys(TYPED) as TypedKey[]) {
    const arr = s[k] as ArrayBufferView
    out[k] = b64(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength))
  }
  return out
}

function decodeStreams(o: Record<string, unknown>): RideStreams {
  const s = { rideId: String(o.rideId), length: Number(o.length) } as RideStreams
  for (const [k, t] of Object.entries(TYPED) as [TypedKey, string][]) {
    const bytes = unb64(String(o[k] ?? ''))
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    ;(s as unknown as Record<string, ArrayBufferView>)[k] =
      t === 'f64' ? new Float64Array(buf) : t === 'f32' ? new Float32Array(buf) : t === 'u16' ? new Uint16Array(buf) : new Uint32Array(buf)
  }
  return s
}

export async function createBackup(): Promise<Uint8Array> {
  const d = db()
  const [rides, streams, workouts, ftpHistory, profile, kv] = await Promise.all([
    d.rides.toArray(),
    d.rideStreams.toArray(),
    d.workouts.toArray(),
    d.ftpHistory.toArray(),
    d.profile.toArray(),
    d.kv.toArray(),
  ])
  const files: Zippable = {
    'manifest.json': strToU8(JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: Date.now(), counts: { rides: rides.length, workouts: workouts.length } })),
    'rides.json': strToU8(JSON.stringify(rides)),
    'workouts.json': strToU8(JSON.stringify(workouts)),
    'ftpHistory.json': strToU8(JSON.stringify(ftpHistory)),
    'profile.json': strToU8(JSON.stringify(profile)),
    'kv.json': strToU8(JSON.stringify(kv)),
  }
  for (const s of streams) files[`streams/${s.rideId}.json`] = strToU8(JSON.stringify(encodeStreams(s)))
  return zipSync(files, { level: 6 })
}

export interface RestoreResult {
  rides: number
  workouts: number
  ftpEntries: number
}

/** Merges a backup into the database (existing ids are overwritten, nothing is deleted). */
export async function restoreBackup(zip: Uint8Array): Promise<RestoreResult> {
  const files = unzipSync(zip)
  const json = <T>(name: string, fallback: T): T => (files[name] ? (JSON.parse(strFromU8(files[name]!)) as T) : fallback)
  const manifest = json<{ format?: string; version?: number }>('manifest.json', {})
  if (manifest.format !== BACKUP_FORMAT) throw new Error('This is not a FreeGaz backup')
  if ((manifest.version ?? 0) > BACKUP_VERSION) throw new Error('This backup was made by a newer FreeGaz')

  const d = db()
  const rides = json<unknown[]>('rides.json', [])
  const workouts = json<unknown[]>('workouts.json', [])
  const ftpHistory = json<unknown[]>('ftpHistory.json', [])
  const profile = json<unknown[]>('profile.json', [])
  const kv = json<unknown[]>('kv.json', [])
  const streams = Object.keys(files)
    .filter((n) => n.startsWith('streams/') && n.endsWith('.json'))
    .map((n) => decodeStreams(JSON.parse(strFromU8(files[n]!)) as Record<string, unknown>))

  await d.transaction('rw', [d.rides, d.rideStreams, d.workouts, d.ftpHistory, d.profile, d.kv], async () => {
    await d.rides.bulkPut(rides as never[])
    await d.rideStreams.bulkPut(streams)
    await d.workouts.bulkPut(workouts as never[])
    await d.ftpHistory.bulkPut(ftpHistory as never[])
    await d.profile.bulkPut(profile as never[])
    await d.kv.bulkPut(kv as never[])
  })
  return { rides: rides.length, workouts: workouts.length, ftpEntries: ftpHistory.length }
}
