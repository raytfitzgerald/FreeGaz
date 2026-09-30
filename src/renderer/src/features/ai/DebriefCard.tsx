import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Sparkles, Square } from 'lucide-react'
import type { RideSummary } from '@core/ride/types'
import { coachVoiceNow, rideFacts, streamAi, type StreamHandle } from '../../ai/client'
import { db } from '../../db/db'
import { Button } from '../../ui/Button'
import { Card, CardBody, CardHeader } from '../../ui/Card'
import { Markdown } from '../../ui/Markdown'

/** Streamed AI post-ride debrief, cached on the ride once written. */
export function DebriefCard({ ride }: { ride: RideSummary }) {
  const [text, setText] = useState(ride.debrief ?? '')
  const [running, setRunning] = useState<StreamHandle | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setError(null)
    setText('')
    const previous = await db().rides.where('startedAt').below(ride.startedAt).reverse().limit(8).toArray()
    const input = JSON.stringify({
      ride: rideFacts(ride),
      previousRides: previous.filter((r) => !r.simulated).map(rideFacts),
    })
    let acc = ''
    const h = streamAi('debrief', [{ role: 'user', content: `${coachVoiceNow()}\n\nDebrief this ride.\n${input}` }], (d) => {
      acc += d
      setText(acc)
    })
    setRunning(h)
    const res = await h.done
    setRunning(null)
    if (res.error) {
      setError(res.code === 'not-configured' ? 'not-configured' : res.error)
      return
    }
    await db().rides.update(ride.id, { debrief: res.text ?? acc, updatedAt: Date.now() })
  }

  return (
    <Card className="mt-4">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" /> Coach debrief
          </span>
        }
        subtitle="AI read of the numbers above (optional)."
        actions={
          running ? (
            <Button size="sm" variant="ghost" onClick={() => running.cancel()}>
              <Square className="size-3.5" /> Stop
            </Button>
          ) : (
            <Button size="sm" onClick={() => void run()}>
              <Sparkles className="size-3.5" /> {text ? 'Regenerate' : 'Debrief this ride'}
            </Button>
          )
        }
      />
      <CardBody>
        {error === 'not-configured' ? (
          <div className="text-sm text-ink-dim">
            Turn on an AI provider in{' '}
            <Link to="/settings" className="text-accent underline">
              Settings → AI
            </Link>{' '}
            to get debriefs.
          </div>
        ) : error ? (
          <div className="text-sm text-bad">{error}</div>
        ) : text ? (
          <Markdown text={text} />
        ) : (
          <div className="text-sm text-ink-faint">{running ? 'Thinking…' : 'No debrief yet.'}</div>
        )}
      </CardBody>
    </Card>
  )
}
