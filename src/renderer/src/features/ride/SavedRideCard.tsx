import { CheckCircle2, ExternalLink, FolderOpen, X } from 'lucide-react'
import { uploadSkipText } from '@core/ride/upload-policy'
import { bridge } from '../../platform/bridge'
import { rideStore, useRide } from '../../stores/ride'
import { Button } from '../../ui/Button'
import { formatDuration } from '../../ui/format'

/** Shown after a ride is saved: the headline numbers and what happened to the file. */
export function SavedRideCard() {
  const saved = useRide((s) => s.lastSaved)
  const error = useRide((s) => s.error)
  if (error) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-bad/40 bg-bad/10 px-5 py-3 text-sm">
        {error}
        <Button size="iconSm" variant="ghost" aria-label="Dismiss" onClick={() => rideStore.setState({ error: null })}>
          <X className="size-4" />
        </Button>
      </div>
    )
  }
  if (!saved) return null
  const s = saved.summary
  return (
    <div className="rounded-2xl border border-good/40 bg-good/5 px-5 py-4" data-testid="saved-ride">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="size-4 text-good" /> Saved “{s.name}”{s.recovered ? ' (recovered)' : ''}
        </div>
        <Button size="iconSm" variant="ghost" aria-label="Dismiss" onClick={() => rideStore.setState({ lastSaved: null })}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-dim">
        <span>
          <b className="text-ink">{formatDuration(s.movingS)}</b> moving
        </span>
        {s.np !== null && (
          <span>
            NP <b className="text-ink">{s.np} W</b>
          </span>
        )}
        {s.tss !== null && (
          <span>
            TSS <b className="text-ink">{Math.round(s.tss)}</b>
          </span>
        )}
        <span>
          <b className="text-ink">{Math.round(s.kj)}</b> kJ
        </span>
        {s.avgHr !== null && (
          <span>
            HR <b className="text-ink">{s.avgHr}</b> avg
          </span>
        )}
        {s.simulated && <span className="text-accent">Simulated: not uploaded or counted in fitness.</span>}
      </div>
      {uploadSkipText(saved.stravaSkip) && (
        <p className="mt-2 text-sm text-ink-dim" data-testid="strava-skip">
          {uploadSkipText(saved.stravaSkip)}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {saved.fitPath && (
          <Button size="sm" onClick={() => void bridge().invoke('files.reveal', { path: saved.fitPath! })}>
            <FolderOpen className="size-3.5" /> Show FIT file
          </Button>
        )}
        {!saved.uploads.includes('strava') && !s.simulated && (
          <Button size="sm" variant="ghost" onClick={() => void bridge().invoke('files.openUrl', { url: 'https://www.strava.com/upload/select' })}>
            <ExternalLink className="size-3.5" /> Upload to Strava manually
          </Button>
        )}
        {!s.simulated && (
          <Button size="sm" variant="ghost" onClick={() => void bridge().invoke('files.openUrl', { url: 'https://connect.garmin.com/modern/import-data' })}>
            <ExternalLink className="size-3.5" /> Garmin Connect import
          </Button>
        )}
        {saved.uploads.length > 0 && <span className="self-center text-xs text-ink-dim">Queued for {saved.uploads.join(' + ')} upload.</span>}
      </div>
    </div>
  )
}
