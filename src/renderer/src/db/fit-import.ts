// Imports FIT activities (Garmin, Wahoo, other apps, or FreeGaz's own files)
// into the local history, so fitness charts and bests include them.
import { FitImportError, importFitActivity, type DecodedFit } from '@core/fit/import'
import { finalizeRide } from '@core/ride/finalize'
import { athleteSnapshot } from './athlete-repo'
import { db } from './db'

export interface FitImportReport {
  imported: { name: string; rideId: string }[]
  skipped: { name: string; reason: string }[]
}

/** Two rides that start within this long of each other are the same ride. */
const SAME_RIDE_MS = 90_000

export async function importFitFiles(files: { name: string; bytes: Uint8Array }[], onProgress?: (done: number, total: number) => void): Promise<FitImportReport> {
  const { default: FitParser } = await import('fit-file-parser')
  const starts = (await db().rides.orderBy('startedAt').keys()) as number[]
  const report: FitImportReport = { imported: [], skipped: [] }
  let done = 0
  for (const f of files) {
    try {
      const ab = f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) as ArrayBuffer
      let decoded: DecodedFit
      try {
        decoded = (await new FitParser({ mode: 'list', force: true }).parseAsync(ab)) as unknown as DecodedFit
      } catch {
        throw new FitImportError('no-records', 'Not a readable FIT file.')
      }
      const imp = importFitActivity(decoded)
      if (starts.some((s) => Math.abs(s - imp.startedAt) < SAME_RIDE_MS)) throw new FitImportError('no-records', 'Already in your history.')
      const athlete = await athleteSnapshot(imp.startedAt)
      const rideId = `fit-${imp.startedAt.toString(36)}`
      const name = rideName(f.name, imp.indoor, imp.startedAt)
      const fin = finalizeRide({
        rideId,
        name,
        kind: 'free',
        simulated: false,
        startedAt: imp.startedAt,
        athlete,
        records: imp.records,
        utcOffsetMin: -new Date(imp.startedAt).getTimezoneOffset(),
        softwareVersion: 10,
        now: Date.now(),
        imported: { fileName: f.name, device: imp.device ?? undefined },
        elevationGainM: imp.elevationGainM,
      })
      await db().transaction('rw', db().rides, db().rideStreams, async () => {
        await db().rides.put(fin.summary)
        await db().rideStreams.put(fin.streams)
      })
      starts.push(imp.startedAt)
      report.imported.push({ name, rideId })
    } catch (e) {
      report.skipped.push({ name: f.name, reason: e instanceof Error ? e.message : String(e) })
    }
    onProgress?.(++done, files.length)
  }
  return report
}

/** "2026-09-29 0712 - Sweet Spot 3x15.fit" (FreeGaz) keeps its name; others get a time-of-day name. */
export function rideName(fileName: string, indoor: boolean, startedAt: number): string {
  const ours = /^\d{4}-\d{2}-\d{2} \d{4} - (.+)\.fit$/i.exec(fileName)
  if (ours?.[1]) return ours[1]
  const h = new Date(startedAt).getHours()
  const part = h < 5 ? 'Night' : h < 11 ? 'Morning' : h < 14 ? 'Lunch' : h < 18 ? 'Afternoon' : 'Evening'
  return `${part} ${indoor ? 'indoor ride' : 'ride'}`
}
