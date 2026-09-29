import { useEffect, useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { useRide } from '../../stores/ride'

const SHOW_MS = 10_000

/** The latest workout cue or coach line, shown for ~10 s. */
export function CueBanner() {
  const cue = useRide((s) => s.cue)
  const coach = useRide((s) => s.snapshot?.coachLine ?? null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const text = cue && now - cue.at < SHOW_MS ? cue.text : coach
  if (!text) return null
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-5 py-3 text-base font-medium" role="status" aria-live="polite" data-testid="cue">
      <MessageSquareText className="size-5 shrink-0 text-accent" /> {text}
    </div>
  )
}
