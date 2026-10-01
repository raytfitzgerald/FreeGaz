import { useEffect, useState } from 'react'
import { CheckCircle2, Copy, ExternalLink, FolderOpen, X } from 'lucide-react'
import { uploadSkipText } from '@core/ride/upload-policy'
import type { SavedMoment } from '../../moments/store'
import { JourneyFinishCard, SavedJourneyLine } from '../journeys/JourneyCards'
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
      {saved.journey && <SavedJourneyLine j={saved.journey} />}
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
      {saved.finishedJourney && <JourneyFinishCard journey={saved.finishedJourney} />}
      {saved.moments && saved.moments.length > 0 && <Moments rideId={s.id} moments={saved.moments} />}
    </div>
  )
}

const MOMENT_LABEL = { hard: 'Hardest effort', coach: 'Coach' } as const

/** The ride's pictures, ready to paste into the Strava post (Strava's API can't attach photos). */
function Moments({ rideId, moments }: { rideId: string; moments: SavedMoment[] }) {
  const activityId = useStravaActivity(rideId)
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (m: SavedMoment) => {
    const { ok } = await bridge().invoke('files.copyImage', { path: m.path })
    setCopied(ok ? m.path : null)
  }
  return (
    <div className="mt-4 border-t border-good/20 pt-3" data-testid="ride-moments">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-semibold">Moments for your Strava post</div>
        {activityId && (
          <Button size="sm" variant="ghost" onClick={() => void bridge().invoke('files.openUrl', { url: `https://www.strava.com/activities/${activityId}` })}>
            <ExternalLink className="size-3.5" /> Open on Strava
          </Button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-ink-dim">Strava doesn't let apps add photos, so copy one here and paste it into the post.</p>
      <div className="mt-3 flex flex-wrap gap-4">
        {moments.map((m) => (
          <figure key={m.path} className="w-60">
            <img src={m.url} alt={`${MOMENT_LABEL[m.kind]}: ${m.caption}`} className="aspect-video w-full rounded-lg border border-line object-cover object-top" />
            <figcaption className="mt-1.5 text-xs text-ink-dim">
              {m.kind === 'coach' && <b className="text-ink">Coach · </b>}
              {m.caption}
            </figcaption>
            <div className="mt-1.5 flex gap-1.5">
              <Button size="sm" onClick={() => void copy(m)} data-testid={`copy-moment-${m.kind}`}>
                <Copy className="size-3.5" /> {copied === m.path ? 'Copied' : 'Copy'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void bridge().invoke('files.reveal', { path: m.path })}>
                <FolderOpen className="size-3.5" /> Show
              </Button>
            </div>
          </figure>
        ))}
      </div>
    </div>
  )
}

/** The Strava activity this ride became, once its upload finishes. */
function useStravaActivity(rideId: string): string | null {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    const done = (items: { rideId: string; provider: string; status: string; activityId?: string }[]) => {
      const hit = items.find((i) => i.rideId === rideId && i.provider === 'strava' && i.status === 'done' && i.activityId)
      if (hit?.activityId) setId(hit.activityId)
    }
    void bridge()
      .invoke('uploads.list', {})
      .then((r) => done(r.items))
      .catch(() => undefined)
    return bridge().on('uploads.changed', (item) => done([item]))
  }, [rideId])
  return id
}
