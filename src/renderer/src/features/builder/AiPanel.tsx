import { useEffect, useState } from 'react'
import { CircleAlert, Loader2, Sparkles } from 'lucide-react'
import { GeneratedWorkoutSchema } from '@core/ai/schemas'
import { workoutFromGenerated } from '@core/workout/from-generated'
import type { Workout } from '@core/workout/model'
import { workoutIssues } from '@core/workout/validate'
import { bridge } from '../../platform/bridge'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/form'

/** Longest request sent to the model. */
const MAX_REQUEST = 500

/**
 * "Describe a workout": plain English → a draft in the builder, through the
 * structured-AI channel (main owns the keys and the prompt). Shown only when
 * a provider is configured. The draft opens unsaved and is never saved here.
 */
export function AiPanel({ onDrafted }: { onDrafted: (w: Workout, model: string | null) => void }) {
  const [available, setAvailable] = useState(false)
  const [request, setRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    bridge()
      .invoke('ai.status', {})
      .then((s) => {
        if (live) setAvailable(s.provider !== null && s.configured)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])

  if (!available) return null

  const draft = async () => {
    const text = request.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await bridge().invoke('ai.structured', { purpose: 'workout', input: `The rider's request: ${text}` })
      if (!r.ok) {
        setError(r.error ?? 'The AI request failed.')
        return
      }
      const parsed = GeneratedWorkoutSchema.safeParse(r.value)
      if (!parsed.success) {
        setError("The AI's answer wasn't a workout FreeGaz can read. Try rephrasing the request.")
        return
      }
      const w = workoutFromGenerated(parsed.data, { id: `ai:${crypto.randomUUID()}` })
      const problems = workoutIssues(w).filter((i) => i.severity === 'error')
      if (problems.length > 0) {
        setError(`The AI's workout can't be ridden as it is: ${problems.slice(0, 3).map((p) => p.message).join(' ')}`)
        return
      }
      onDrafted(w, r.model ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-panel p-4" aria-label="Describe a workout" data-testid="builder-ai">
      <div className="flex items-center gap-2 font-display text-base font-semibold">
        <Sparkles className="size-4 text-accent" aria-hidden /> Describe a workout
      </div>
      <p className="mt-0.5 text-xs text-ink-dim">The AI drafts it here for you to check and adjust. Nothing is saved until you press Save.</p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void draft()
        }}
      >
        <Input
          value={request}
          onChange={(e) => setRequest(e.target.value.slice(0, MAX_REQUEST))}
          placeholder="e.g. 45 min over-unders, finish with sprints"
          aria-label="Describe the workout you want"
          disabled={busy}
          data-testid="builder-ai-input"
        />
        <Button type="submit" variant="primary" disabled={busy || request.trim() === ''} className="shrink-0">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {busy ? 'Drafting…' : 'Draft it'}
        </Button>
      </form>
      {error && (
        <div role="alert" className="mt-2 flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-ink" data-testid="builder-ai-error">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-bad" aria-hidden />
          <span>
            <span className="font-medium">Couldn't draft it:</span> {error}
          </span>
        </div>
      )}
    </section>
  )
}
