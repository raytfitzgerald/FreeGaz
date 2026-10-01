// Persisting finished rides: one Dexie transaction for summary + streams,
// then the FIT file goes to the export folder (main) and, if enabled, into
// the Strava / intervals.icu upload outbox. The journal is deleted only once
// all of that has succeeded, so a crash at any step is recoverable.
import { finalizeRide, type FinalizeInput } from '@core/ride/finalize'
import { parseJournal } from '@core/ride/journal'
import type { RideSummary } from '@core/ride/types'
import { MIN_UPLOAD_S, uploadSkipReason, type UploadSkip } from '@core/ride/upload-policy'
import type { SavedMoment } from '../moments/store'
import { bridge } from '../platform/bridge'
import { settingsStore } from '../stores/settings'
import { db } from './db'

export interface SaveResult {
  summary: RideSummary
  fitPath: string | null
  uploads: string[]
  /** Why the ride wasn't queued for Strava, or null if it was. */
  stravaSkip: UploadSkip | null
  /** Pictures of the ride's best moments, saved next to the FIT file (added once they're written). */
  moments?: SavedMoment[]
}

export async function saveFinishedRide(input: Omit<FinalizeInput, 'now' | 'utcOffsetMin' | 'softwareVersion'>): Promise<SaveResult> {
  const fin = finalizeRide({
    ...input,
    now: Date.now(),
    utcOffsetMin: -new Date(input.startedAt).getTimezoneOffset(),
    softwareVersion: 10,
  })

  let fitPath: string | null = null
  if (fin.fit && fin.summary.fit) {
    const saved = await bridge().invoke('files.saveFit', { fileName: fin.summary.fit.fileName, bytes: new Uint8Array(fin.fit) })
    fitPath = saved.path
    fin.summary.fit = { ...fin.summary.fit, fileName: saved.fileName, path: saved.path }
  }

  const uploads: string[] = []
  const auto = settingsStore.getState().autoUpload
  const stravaConnected = auto.strava ? await bridge().invoke('strava.status', {}).then((st) => st.connected, () => false) : false
  const stravaSkip = uploadSkipReason({ simulated: fin.summary.simulated, movingS: fin.summary.movingS, hasFit: fitPath !== null, autoOn: auto.strava, connected: stravaConnected })
  if (fitPath && !fin.summary.simulated && fin.summary.movingS >= MIN_UPLOAD_S) {
    const description = describe(fin.summary)
    for (const provider of ['strava', 'intervals'] as const) {
      if (!auto[provider] || (provider === 'strava' && stravaSkip !== null)) continue
      await bridge().invoke('uploads.enqueue', {
        rideId: fin.summary.id,
        provider,
        fitPath,
        fileName: fin.summary.fit!.fileName,
        name: [...fin.summary.name].slice(0, 200).join(''),
        description: description.slice(0, 5000),
      })
      uploads.push(provider)
      fin.summary.uploads = { ...fin.summary.uploads, [provider]: { status: 'queued', at: Date.now() } }
    }
  }

  await db().transaction('rw', db().rides, db().rideStreams, async () => {
    await db().rides.put(fin.summary)
    await db().rideStreams.put(fin.streams)
  })
  await bridge().invoke('journal.remove', { rideId: input.rideId }).catch(() => undefined)
  return { summary: fin.summary, fitPath, uploads, stravaSkip }
}

/** A short Strava description: the numbers people actually look at. */
export function describe(s: RideSummary): string {
  const parts = [
    s.np !== null ? `NP ${s.np} W` : null,
    s.intensityFactor !== null ? `IF ${s.intensityFactor.toFixed(2)}` : null,
    s.tss !== null ? `TSS ${Math.round(s.tss)}` : null,
    `${Math.round(s.kj)} kJ`,
    s.avgHr !== null ? `avg HR ${s.avgHr}` : null,
  ].filter(Boolean)
  return `${parts.join(' · ')}\nRecorded with FreeGaz.`
}

export interface PendingRecovery {
  rideId: string
  name: string | null
  startedAt: number | null
  records: number
  simulated: boolean
}

export async function pendingRecoveries(): Promise<PendingRecovery[]> {
  const { journals } = await bridge().invoke('journal.pending', {})
  // Skip journals whose ride was already saved (crash between save and journal removal).
  const out: PendingRecovery[] = []
  for (const j of journals) {
    if (await db().rides.get(j.rideId)) {
      await bridge().invoke('journal.remove', { rideId: j.rideId })
      continue
    }
    if (j.records > 0) out.push(j)
    else await bridge().invoke('journal.remove', { rideId: j.rideId })
  }
  return out
}

/** Rebuilds a crashed ride from its journal and saves it like a normal ride. */
export async function recoverRide(rideId: string): Promise<SaveResult | null> {
  const { text } = await bridge().invoke('journal.read', { rideId })
  const j = parseJournal(text)
  if (!j.meta || j.records.length === 0) return null
  return saveFinishedRide({
    rideId,
    name: j.meta.name,
    kind: j.meta.kind,
    simulated: j.meta.simulated,
    startedAt: j.meta.startedAt,
    athlete: { ...j.meta.athlete, ftpW: j.meta.ftpW, weightKg: j.meta.weightKg },
    records: j.records,
    workoutId: j.meta.workoutId,
    workoutJson: j.meta.workoutJson,
    recovered: true,
  })
}

export async function discardRecovery(rideId: string): Promise<void> {
  await bridge().invoke('journal.remove', { rideId })
}

/** Edits the rider's own fields on a saved ride (notes, RPE, name). */
export async function updateRide(rideId: string, patch: Partial<Pick<RideSummary, 'notes' | 'rpe' | 'name' | 'feel'>>): Promise<void> {
  await db().rides.update(rideId, { ...patch, updatedAt: Date.now() })
}

export async function deleteRide(rideId: string): Promise<void> {
  await db().transaction('rw', db().rides, db().rideStreams, async () => {
    await db().rides.delete(rideId)
    await db().rideStreams.delete(rideId)
  })
}
