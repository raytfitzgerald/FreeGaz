import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from '@tanstack/react-router'
import { MessageSquare, RefreshCw, Sparkles, Square } from 'lucide-react'
import { fitnessOverview, type FitnessFacts } from '@core/metrics'
import { PROFESSIONAL, packById } from '@core/persona'
import { coachVoiceKey, coachVoiceNow, fitnessContext, fitnessFacts, streamAi, type StreamHandle } from '../../ai/client'
import { handToCoach } from '../../ai/handoff'
import { aiReady } from '../../coach/quips'
import { db } from '../../db/db'
import { useSettings } from '../../stores/settings'
import { Button } from '../../ui/Button'
import { Card, CardBody, CardHeader } from '../../ui/Card'

const KV_KEY = 'fitness.overview'

interface CachedOverview {
  /** The facts and coach settings it was written from: a change means it's stale. */
  key: string
  text: string
}

/**
 * The Fitness page in words. The app writes a plain read of the numbers
 * itself; with an AI provider the coach writes one in their own voice, once
 * per change in the data or the coach. Either can go to the coach chat.
 */
export function FitnessOverviewCard({ rideCount }: { rideCount: number | undefined }) {
  const ftp = useLiveQuery(() => db().ftpHistory.count(), [])
  const facts = useLiveQuery(() => fitnessFacts(), [rideCount, ftp])
  const cached = useLiveQuery(() => db().kv.get(KV_KEY).then((r) => (r?.value as CachedOverview | undefined) ?? null), [])
  const coach = useSettings((s) => s.coach)
  const persona = (packById(coach.personaId) ?? PROFESSIONAL).meta
  const [ai, setAi] = useState(false)
  const [streamed, setStreamed] = useState<{ key: string; text: string } | null>(null)
  const [running, setRunning] = useState<StreamHandle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tried = useRef(new Set<string>())
  const navigate = useNavigate()

  const hasData = !!facts && facts.ctl !== null
  const key = facts ? `${JSON.stringify(facts)}|${coachVoiceKey()}` : null

  const write = async (f: FitnessFacts, k: string) => {
    tried.current.add(k)
    setError(null)
    let acc = ''
    const h = streamAi('fitness-summary', [{ role: 'user', content: `${coachVoiceNow()}\n\nWrite my fitness overview.\n${await fitnessContext(f)}` }], (d) => {
      acc += d
      setStreamed({ key: k, text: acc })
    })
    setRunning(h)
    const res = await h.done
    setRunning(null)
    if (res.error) {
      setStreamed(null)
      if (res.code !== 'cancelled') setError(res.code === 'not-configured' ? null : res.error)
      return
    }
    const text = (res.text ?? acc).trim()
    setStreamed({ key: k, text })
    await db().kv.put({ key: KV_KEY, value: { key: k, text } satisfies CachedOverview })
  }

  // With an AI provider, the coach writes a fresh overview whenever the numbers (or the coach) change.
  useEffect(() => {
    if (!facts || !key || !hasData || cached === undefined || cached?.key === key || tried.current.has(key)) return
    let live = true
    void aiReady().then((ok) => {
      if (!live) return
      setAi(ok)
      if (ok && !tried.current.has(key)) void write(facts, key)
    })
    return () => {
      live = false
    }
    // write is recreated every render; the key decides
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hasData, cached])
  useEffect(() => {
    let live = true
    void aiReady().then((ok) => live && setAi(ok))
    return () => {
      live = false
    }
  }, [])

  const coachText = streamed?.key === key ? streamed.text : cached?.key === key ? cached.text : null
  const local = facts ? fitnessOverview(facts) : null
  const shown = coachText || local
  const byCoach = !!coachText

  const ask = () => {
    if (!shown) return
    handToCoach({ title: 'Fitness overview', text: shown })
    void navigate({ to: '/coach' })
  }

  return (
    <Card data-testid="fitness-overview">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" /> Overview
          </span>
        }
        subtitle={byCoach ? `${persona.name}'s read of the numbers below.` : 'A plain read of the numbers below.'}
        actions={
          <>
            {running ? (
              <Button size="sm" variant="ghost" onClick={() => running.cancel()}>
                <Square className="size-3.5" /> Stop
              </Button>
            ) : (
              ai &&
              hasData &&
              facts &&
              key && (
                <Button size="sm" variant="ghost" onClick={() => void write(facts, key)} data-testid="fitness-overview-rewrite">
                  <RefreshCw className="size-3.5" /> {byCoach ? 'Rewrite' : "Coach's take"}
                </Button>
              )
            )}
            {ai && hasData && (
              <Button size="sm" onClick={ask} disabled={!!running} data-testid="fitness-overview-ask">
                <MessageSquare className="size-3.5" /> Ask the coach
              </Button>
            )}
          </>
        }
      />
      <CardBody>
        {shown ? (
          <p className="max-w-prose text-sm leading-relaxed" data-testid="fitness-overview-text">
            {shown}
            {running && <span className="text-ink-faint"> …</span>}
          </p>
        ) : (
          <div className="h-10" />
        )}
        {error && <div className="mt-2 text-xs text-bad">The coach couldn't write this one ({error}). The plain read is above.</div>}
        {!ai && hasData && (
          <div className="mt-2 text-xs text-ink-faint">
            Turn on an AI provider in{' '}
            <Link to="/settings" className="text-accent underline">
              Settings → AI
            </Link>{' '}
            for your coach's take, and to ask them about it.
          </div>
        )}
      </CardBody>
    </Card>
  )
}
