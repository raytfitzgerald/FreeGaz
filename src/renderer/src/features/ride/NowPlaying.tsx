import { useEffect, useState } from 'react'
import { Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import type { InvokeRes } from '@shared/ipc/contract'
import { bridge } from '../../platform/bridge'
import { Button } from '../../ui/Button'

type Status = InvokeRes<'music.status'>
const POLL_MS = 5000

/** Spotify / Apple Music now playing, with transport buttons and N / Shift+N / P keys. Hidden when no player runs. */
export function NowPlaying() {
  const [s, setS] = useState<Status | null>(null)

  useEffect(() => {
    let live = true
    const poll = () =>
      void bridge()
        .invoke('music.status', {})
        .then((r) => live && setS(r))
        .catch(() => undefined)
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [])

  const send = (action: 'playpause' | 'next' | 'previous') =>
    void bridge()
      .invoke('music.command', { action })
      .then(setS)
      .catch(() => undefined)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'n' || e.key === 'N') send(e.shiftKey ? 'previous' : 'next')
      else if (e.key === 'p' || e.key === 'P') send('playpause')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!s?.player) return null
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-1.5 text-sm" data-testid="now-playing">
      <Music2 className="size-4 shrink-0 text-ink-dim" aria-hidden />
      <div className="min-w-0 max-w-72 truncate" title={s.track ? `${s.track} · ${s.artist ?? ''}` : undefined}>
        {s.track ? (
          <>
            <span className="text-ink">{s.track}</span>
            {s.artist && <span className="text-ink-dim"> · {s.artist}</span>}
          </>
        ) : (
          <span className="text-ink-dim">{s.player === 'spotify' ? 'Spotify' : 'Music'}</span>
        )}
      </div>
      <div className="flex items-center">
        <Button size="iconSm" variant="ghost" aria-label="Previous track (Shift+N)" onClick={() => send('previous')}>
          <SkipBack className="size-3.5" />
        </Button>
        <Button size="iconSm" variant="ghost" aria-label={s.state === 'playing' ? 'Pause music (P)' : 'Play music (P)'} onClick={() => send('playpause')}>
          {s.state === 'playing' ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </Button>
        <Button size="iconSm" variant="ghost" aria-label="Next track (N)" onClick={() => send('next')}>
          <SkipForward className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
